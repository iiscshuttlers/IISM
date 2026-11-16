-- 0006:
--   1. Fixes "record "new" has no field "camp_id"": the 0001 trigger that keeps attendance,
--      drills and sessions attached to their parent failed on EVERY update of those rows
--      (changing Present to Late, logging an effort rating, editing a session or drill).
--   2. The camp admin can permanently delete a match once it has been voided.
--   3. Standings get separate singles, doubles and mixed ratings next to the overall one.
-- Safe to run once in the Supabase SQL editor after 0001–0005.

-- ───────────────── 1. Parent-keeping trigger ─────────────────
-- The old version compared NEW.camp_id on attendance (which has no camp_id) inside an AND;
-- PL/pgSQL resolves every field in the expression before evaluating it, so it always failed.
-- Comparing as jsonb only looks at columns the row actually has.
CREATE OR REPLACE FUNCTION public._keep_parent() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  o jsonb := to_jsonb(OLD);
  n jsonb := to_jsonb(NEW);
BEGIN
  IF n ? 'camp_id' AND n->>'camp_id' IS DISTINCT FROM o->>'camp_id' THEN RAISE EXCEPTION 'immutable_camp'; END IF;
  IF n ? 'session_id' AND n->>'session_id' IS DISTINCT FROM o->>'session_id' THEN RAISE EXCEPTION 'immutable_session'; END IF;
  IF TG_TABLE_NAME = 'attendance' AND n->>'person_id' IS DISTINCT FROM o->>'person_id' THEN
    RAISE EXCEPTION 'immutable_person';
  END IF;
  RETURN NEW;
END $$;

-- ───────────────── 2. Permanent delete ─────────────────
-- Admin only, and only after the match has been voided (voiding is the undoable step).
-- Its activity alerts go with it (ON DELETE CASCADE).
CREATE FUNCTION public.delete_match(p_match uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_camp uuid;
  v_status text;
BEGIN
  SELECT camp_id, status INTO v_camp, v_status FROM public.matches WHERE id = p_match;
  IF v_camp IS NULL OR NOT public.is_camp_admin(v_camp) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF v_status <> 'void' THEN RAISE EXCEPTION 'void_first'; END IF;
  DELETE FROM public.matches WHERE id = p_match;
END $$;

-- ───────────────── 3. Ratings per discipline ─────────────────
-- Same contract as 0003 plus rating_/played_ singles, doubles, mixed. The overall rating
-- (every confirmed match) and Glicko are unchanged. Each discipline rating starts at 1200 and
-- moves only with matches of that discipline (MS+WS singles, MD+WD doubles, XD mixed).
DROP FUNCTION public.get_standings(uuid);
CREATE FUNCTION public.get_standings(p_camp uuid)
RETURNS TABLE (person_id uuid, full_name text, gender text, rating integer, played integer,
               won integer, lost integer, points_for integer, points_against integer,
               form text, by_category jsonb, glicko integer, glicko_rd integer,
               rating_singles integer, rating_doubles integer, rating_mixed integer,
               played_singles integer, played_doubles integer, played_mixed integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_me uuid := public.me();
  v_all boolean;
  st jsonb := '{}'::jsonb;   -- person_id -> {r, p, w, l, pf, pa, form, cat, g, gd, gv, es/ed/ex, ps/pd/px}
  nx jsonb;
  m record;
  t1 uuid[]; t2 uuid[];
  r1 numeric; r2 numeric; e1 numeric; d1 integer;
  dk text;                    -- discipline key: s, d or x
  q1 numeric; q2 numeric; dq integer;
  g1 numeric; g2 numeric; gd1 numeric; gd2 numeric; up numeric[];
  pf1 int; pf2 int; g text;
  pid uuid; side int; prev jsonb; cur jsonb; won_it boolean; delta int; cat jsonb;
BEGIN
  IF NOT public.can_view_camp(p_camp) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  v_all := public.can_see_all_results(p_camp);

  SELECT COALESCE(jsonb_object_agg(cm.person_id::text,
           jsonb_build_object('r', 1200, 'p', 0, 'w', 0, 'l', 0, 'pf', 0, 'pa', 0, 'form', '', 'cat', '{}'::jsonb,
                              'g', 1500, 'gd', 350, 'gv', 0.06,
                              'es', 1200, 'ed', 1200, 'ex', 1200, 'ps', 0, 'pd', 0, 'px', 0)),
         '{}'::jsonb)
    INTO st FROM public.camp_members cm WHERE cm.camp_id = p_camp AND cm.role = 'player';

  FOR m IN SELECT * FROM public.matches
            WHERE camp_id = p_camp AND status = 'confirmed'
            ORDER BY played_on, created_at, id LOOP
    t1 := array_remove(ARRAY[m.t1_p1, m.t1_p2], NULL);
    t2 := array_remove(ARRAY[m.t2_p1, m.t2_p2], NULL);
    IF EXISTS (SELECT 1 FROM unnest(t1 || t2) x WHERE NOT st ? x::text) THEN CONTINUE; END IF;

    -- Overall Elo (every match).
    SELECT avg((st->x::text->>'r')::numeric) INTO r1 FROM unnest(t1) x;
    SELECT avg((st->x::text->>'r')::numeric) INTO r2 FROM unnest(t2) x;
    e1 := 1 / (1 + power(10, (r2 - r1) / 400));
    d1 := round(32 * ((CASE WHEN m.winner_side = 1 THEN 1 ELSE 0 END) - e1));

    -- Discipline Elo (only this discipline's ratings).
    dk := CASE WHEN m.category IN ('MS', 'WS') THEN 's' WHEN m.category = 'XD' THEN 'x' ELSE 'd' END;
    SELECT avg((st->x::text->>('e' || dk))::numeric) INTO q1 FROM unnest(t1) x;
    SELECT avg((st->x::text->>('e' || dk))::numeric) INTO q2 FROM unnest(t2) x;
    dq := round(32 * ((CASE WHEN m.winner_side = 1 THEN 1 ELSE 0 END) - 1 / (1 + power(10, (q2 - q1) / 400))));

    -- Glicko-2 team composites from the pre-match snapshot.
    SELECT avg((st->x::text->>'g')::numeric), sqrt(avg(power((st->x::text->>'gd')::numeric, 2)))
      INTO g1, gd1 FROM unnest(t1) x;
    SELECT avg((st->x::text->>'g')::numeric), sqrt(avg(power((st->x::text->>'gd')::numeric, 2)))
      INTO g2, gd2 FROM unnest(t2) x;

    pf1 := 0; pf2 := 0;
    IF m.games IS NOT NULL THEN
      FOREACH g IN ARRAY m.games LOOP
        pf1 := pf1 + split_part(g, '-', 1)::int;
        pf2 := pf2 + split_part(g, '-', 2)::int;
      END LOOP;
    END IF;

    nx := st;
    FOREACH pid IN ARRAY (t1 || t2) LOOP
      side := CASE WHEN pid = ANY (t1) THEN 1 ELSE 2 END;
      won_it := side = m.winner_side;
      delta := CASE WHEN side = 1 THEN d1 ELSE -d1 END;
      prev := st->pid::text;
      up := public._glicko2_update((prev->>'g')::numeric, (prev->>'gd')::numeric, (prev->>'gv')::numeric,
              CASE WHEN side = 1 THEN g2 ELSE g1 END, CASE WHEN side = 1 THEN gd2 ELSE gd1 END,
              CASE WHEN won_it THEN 1 ELSE 0 END);
      cat := COALESCE(prev->'cat'->m.category, jsonb_build_object('w', 0, 'l', 0));
      cat := jsonb_build_object('w', (cat->>'w')::int + won_it::int, 'l', (cat->>'l')::int + (NOT won_it)::int);
      cur := prev || jsonb_build_object(
        'r', (prev->>'r')::numeric + delta,
        'p', (prev->>'p')::int + 1,
        'w', (prev->>'w')::int + won_it::int,
        'l', (prev->>'l')::int + (NOT won_it)::int,
        'pf', (prev->>'pf')::int + CASE WHEN side = 1 THEN pf1 ELSE pf2 END,
        'pa', (prev->>'pa')::int + CASE WHEN side = 1 THEN pf2 ELSE pf1 END,
        'form', left((CASE WHEN won_it THEN 'W' ELSE 'L' END) || (prev->>'form'), 5),
        'cat', jsonb_set(prev->'cat', ARRAY[m.category], cat),
        'g', up[1], 'gd', up[2], 'gv', up[3],
        'e' || dk, (prev->>('e' || dk))::numeric + CASE WHEN side = 1 THEN dq ELSE -dq END,
        'p' || dk, (prev->>('p' || dk))::int + 1);
      nx := jsonb_set(nx, ARRAY[pid::text], cur);
    END LOOP;
    st := nx;
  END LOOP;

  RETURN QUERY
    SELECT p.id, p.full_name, p.gender,
           (s.value->>'r')::numeric::int, (s.value->>'p')::int, (s.value->>'w')::int,
           (s.value->>'l')::int, (s.value->>'pf')::int, (s.value->>'pa')::int,
           s.value->>'form', s.value->'cat',
           round((s.value->>'g')::numeric)::int, round((s.value->>'gd')::numeric)::int,
           (s.value->>'es')::numeric::int, (s.value->>'ed')::numeric::int, (s.value->>'ex')::numeric::int,
           (s.value->>'ps')::int, (s.value->>'pd')::int, (s.value->>'px')::int
      FROM jsonb_each(st) s
      JOIN public.people p ON p.id = s.key::uuid
     WHERE v_all OR p.id = v_me
     ORDER BY (s.value->>'r')::numeric DESC, (s.value->>'w')::int DESC, p.full_name;
END $$;

-- ───────────────── Grants ─────────────────
REVOKE EXECUTE ON FUNCTION public.delete_match(uuid), public.get_standings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_match(uuid), public.get_standings(uuid) TO authenticated;
