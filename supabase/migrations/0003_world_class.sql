-- 0003: offline-safe match recording, Glicko-2 ratings with confidence, session duration
-- (training load), daily wellness check-ins, and realtime change feeds.
-- Safe to run once in the Supabase SQL editor after 0001 and 0002.

-- ───────────────── Offline-safe recording ─────────────────
-- A phone that records a match offline generates client_id once and retries with it, so a
-- retry after a lost response never creates a duplicate.
ALTER TABLE public.matches ADD COLUMN client_id uuid UNIQUE;

DROP FUNCTION public.record_match(uuid, date, text, uuid, uuid, uuid, uuid, text[], smallint);

CREATE FUNCTION public.record_match(p_camp uuid, p_played_on date, p_category text,
  p_t1_p1 uuid, p_t1_p2 uuid, p_t2_p1 uuid, p_t2_p2 uuid, p_games text[], p_winner_side smallint,
  p_client_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_me uuid := public.me();
  v_id uuid;
  v_games text[] := NULLIF(p_games, '{}');
  p uuid;
BEGIN
  IF v_me IS NULL OR NOT public.can_view_camp(p_camp) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;

  -- Replay of an already-saved offline submission: return the original row.
  IF p_client_id IS NOT NULL THEN
    SELECT id INTO v_id FROM public.matches WHERE client_id = p_client_id AND recorded_by = v_me;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.camps WHERE id = p_camp AND status <> 'active') THEN RAISE EXCEPTION 'camp_closed'; END IF;
  PERFORM public._validate_match(p_camp, p_category, p_t1_p1, p_t1_p2, p_t2_p1, p_t2_p2, v_games, p_winner_side);
  INSERT INTO public.matches (camp_id, played_on, category, t1_p1, t1_p2, t2_p1, t2_p2, games, winner_side,
                              recorded_by, client_id)
  VALUES (p_camp, COALESCE(p_played_on, current_date), p_category, p_t1_p1, p_t1_p2, p_t2_p1, p_t2_p2,
          v_games, p_winner_side, v_me, p_client_id)
  ON CONFLICT (client_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    -- Lost a race with a concurrent retry of the same submission, or someone else's id.
    SELECT id INTO v_id FROM public.matches WHERE client_id = p_client_id AND recorded_by = v_me;
    IF v_id IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
    RETURN v_id;
  END IF;
  FOREACH p IN ARRAY array_remove(ARRAY[p_t1_p1, p_t1_p2, p_t2_p1, p_t2_p2], NULL) LOOP
    PERFORM public._notify(p_camp, p, 'match_recorded', v_id,
      'A match you played was recorded. You can dispute it within 24 hours.');
  END LOOP;
  RETURN v_id;
END $$;

-- ───────────────── Glicko-2 ─────────────────
-- One rating period per match. Mirrors src/lib/glicko2.ts (unit-tested against Glickman's
-- worked example). Returns {rating, rd, volatility}.
CREATE FUNCTION public._glicko2_update(p_r numeric, p_rd numeric, p_vol numeric,
  p_opp_r numeric, p_opp_rd numeric, p_score numeric)
RETURNS numeric[] LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  sc constant double precision := 173.7178;
  tau constant double precision := 0.5;
  mu double precision := (p_r - 1500) / sc;
  phi double precision := p_rd / sc;
  muj double precision := (p_opp_r - 1500) / sc;
  gj double precision := 1 / sqrt(1 + 3 * power(p_opp_rd / sc, 2) / power(pi(), 2));
  e double precision; v double precision; delta double precision;
  a double precision; aa double precision; bb double precision; cc double precision;
  fa double precision; fb double precision; fc double precision;
  k integer; vol double precision; phi_star double precision; phi_new double precision; mu_new double precision;
BEGIN
  e := 1 / (1 + exp(-gj * (mu - muj)));
  v := 1 / (gj * gj * e * (1 - e));
  delta := v * gj * (p_score - e);
  a := ln(p_vol * p_vol);
  aa := a;
  IF delta * delta > phi * phi + v THEN
    bb := ln(delta * delta - phi * phi - v);
  ELSE
    k := 1;
    WHILE (exp(a - k * tau) * (delta * delta - phi * phi - v - exp(a - k * tau))
           / (2 * power(phi * phi + v + exp(a - k * tau), 2)) - ((a - k * tau) - a) / (tau * tau)) < 0 LOOP
      k := k + 1;
    END LOOP;
    bb := a - k * tau;
  END IF;
  fa := exp(aa) * (delta * delta - phi * phi - v - exp(aa)) / (2 * power(phi * phi + v + exp(aa), 2)) - (aa - a) / (tau * tau);
  fb := exp(bb) * (delta * delta - phi * phi - v - exp(bb)) / (2 * power(phi * phi + v + exp(bb), 2)) - (bb - a) / (tau * tau);
  WHILE abs(bb - aa) > 1e-6 LOOP
    cc := aa + (aa - bb) * fa / (fb - fa);
    fc := exp(cc) * (delta * delta - phi * phi - v - exp(cc)) / (2 * power(phi * phi + v + exp(cc), 2)) - (cc - a) / (tau * tau);
    IF fc * fb <= 0 THEN aa := bb; fa := fb; ELSE fa := fa / 2; END IF;
    bb := cc; fb := fc;
  END LOOP;
  vol := exp(aa / 2);
  phi_star := sqrt(phi * phi + vol * vol);
  phi_new := 1 / sqrt(1 / (phi_star * phi_star) + 1 / v);
  mu_new := mu + phi_new * phi_new * gj * (p_score - e);
  RETURN ARRAY[(mu_new * sc + 1500)::numeric, (phi_new * sc)::numeric, vol::numeric];
END $$;

-- Same contract as before plus glicko / glicko_rd. Elo stays as `rating` for continuity.
DROP FUNCTION public.get_standings(uuid);
CREATE FUNCTION public.get_standings(p_camp uuid)
RETURNS TABLE (person_id uuid, full_name text, gender text, rating integer, played integer,
               won integer, lost integer, points_for integer, points_against integer,
               form text, by_category jsonb, glicko integer, glicko_rd integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_me uuid := public.me();
  v_all boolean;
  st jsonb := '{}'::jsonb;   -- person_id -> {r, p, w, l, pf, pa, form, cat, g, gd, gv}
  nx jsonb;
  m record;
  t1 uuid[]; t2 uuid[];
  r1 numeric; r2 numeric; e1 numeric; d1 integer;
  g1 numeric; g2 numeric; gd1 numeric; gd2 numeric; up numeric[];
  pf1 int; pf2 int; g text;
  pid uuid; side int; cur jsonb; won_it boolean; delta int; cat jsonb;
BEGIN
  IF NOT public.can_view_camp(p_camp) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  v_all := public.can_see_all_results(p_camp);

  SELECT COALESCE(jsonb_object_agg(cm.person_id::text,
           jsonb_build_object('r', 1200, 'p', 0, 'w', 0, 'l', 0, 'pf', 0, 'pa', 0, 'form', '', 'cat', '{}'::jsonb,
                              'g', 1500, 'gd', 350, 'gv', 0.06)),
         '{}'::jsonb)
    INTO st FROM public.camp_members cm WHERE cm.camp_id = p_camp AND cm.role = 'player';

  FOR m IN SELECT * FROM public.matches
            WHERE camp_id = p_camp AND status = 'confirmed'
            ORDER BY played_on, created_at, id LOOP
    t1 := array_remove(ARRAY[m.t1_p1, m.t1_p2], NULL);
    t2 := array_remove(ARRAY[m.t2_p1, m.t2_p2], NULL);
    IF EXISTS (SELECT 1 FROM unnest(t1 || t2) x WHERE NOT st ? x::text) THEN CONTINUE; END IF;

    SELECT avg((st->x::text->>'r')::numeric) INTO r1 FROM unnest(t1) x;
    SELECT avg((st->x::text->>'r')::numeric) INTO r2 FROM unnest(t2) x;
    e1 := 1 / (1 + power(10, (r2 - r1) / 400));
    d1 := round(32 * ((CASE WHEN m.winner_side = 1 THEN 1 ELSE 0 END) - e1));

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
      cur := st->pid::text;
      up := public._glicko2_update((cur->>'g')::numeric, (cur->>'gd')::numeric, (cur->>'gv')::numeric,
              CASE WHEN side = 1 THEN g2 ELSE g1 END, CASE WHEN side = 1 THEN gd2 ELSE gd1 END,
              CASE WHEN won_it THEN 1 ELSE 0 END);
      cat := COALESCE(cur->'cat'->m.category, jsonb_build_object('w', 0, 'l', 0));
      cat := jsonb_build_object('w', (cat->>'w')::int + won_it::int, 'l', (cat->>'l')::int + (NOT won_it)::int);
      cur := jsonb_build_object(
        'r', (cur->>'r')::numeric + delta,
        'p', (cur->>'p')::int + 1,
        'w', (cur->>'w')::int + won_it::int,
        'l', (cur->>'l')::int + (NOT won_it)::int,
        'pf', (cur->>'pf')::int + CASE WHEN side = 1 THEN pf1 ELSE pf2 END,
        'pa', (cur->>'pa')::int + CASE WHEN side = 1 THEN pf2 ELSE pf1 END,
        'form', left((CASE WHEN won_it THEN 'W' ELSE 'L' END) || (cur->>'form'), 5),
        'cat', jsonb_set(cur->'cat', ARRAY[m.category], cat),
        'g', up[1], 'gd', up[2], 'gv', up[3]);
      nx := jsonb_set(nx, ARRAY[pid::text], cur);
    END LOOP;
    st := nx;
  END LOOP;

  RETURN QUERY
    SELECT p.id, p.full_name, p.gender,
           (s.value->>'r')::numeric::int, (s.value->>'p')::int, (s.value->>'w')::int,
           (s.value->>'l')::int, (s.value->>'pf')::int, (s.value->>'pa')::int,
           s.value->>'form', s.value->'cat',
           round((s.value->>'g')::numeric)::int, round((s.value->>'gd')::numeric)::int
      FROM jsonb_each(st) s
      JOIN public.people p ON p.id = s.key::uuid
     WHERE v_all OR p.id = v_me
     ORDER BY (s.value->>'r')::numeric DESC, (s.value->>'w')::int DESC, p.full_name;
END $$;

-- ───────────────── Training load ─────────────────
-- Load = RPE × session minutes (session-RPE method).
ALTER TABLE public.sessions ADD COLUMN duration_min integer CHECK (duration_min BETWEEN 1 AND 600);

-- ───────────────── Wellness check-in ─────────────────
-- A 10-second daily check-in. Players see only their own; coaches and the admin see all.
CREATE TABLE public.wellness (
  camp_id    uuid NOT NULL REFERENCES public.camps(id) ON DELETE CASCADE,
  person_id  uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  day        date NOT NULL DEFAULT current_date,
  sleep      integer NOT NULL CHECK (sleep BETWEEN 1 AND 5),
  soreness   integer NOT NULL CHECK (soreness BETWEEN 1 AND 5),
  energy     integer NOT NULL CHECK (energy BETWEEN 1 AND 5),
  mood       integer NOT NULL CHECK (mood BETWEEN 1 AND 5),
  note       text CHECK (length(note) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  PRIMARY KEY (camp_id, person_id, day)
);
ALTER TABLE public.wellness ENABLE ROW LEVEL SECURITY;

CREATE POLICY wellness_read ON public.wellness FOR SELECT TO authenticated
  USING (person_id = public.me() OR public.is_camp_staff(camp_id));
CREATE POLICY wellness_insert ON public.wellness FOR INSERT TO authenticated
  WITH CHECK (person_id = public.me() AND public.can_view_camp(camp_id) AND public.is_camp_member(camp_id)
              AND EXISTS (SELECT 1 FROM public.camp_members cm
                          WHERE cm.camp_id = wellness.camp_id AND cm.person_id = wellness.person_id));
CREATE POLICY wellness_update ON public.wellness FOR UPDATE TO authenticated
  USING (person_id = public.me())
  WITH CHECK (person_id = public.me() AND public.can_view_camp(camp_id)
              AND EXISTS (SELECT 1 FROM public.camp_members cm
                          WHERE cm.camp_id = wellness.camp_id AND cm.person_id = wellness.person_id));
CREATE POLICY wellness_delete ON public.wellness FOR DELETE TO authenticated
  USING (person_id = public.me());

CREATE FUNCTION public._wellness_stamp() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.camp_id := OLD.camp_id; NEW.person_id := OLD.person_id; NEW.day := OLD.day;
    NEW.created_at := OLD.created_at; NEW.updated_at := now();
  ELSE
    NEW.created_at := now(); NEW.updated_at := NULL;
    IF NEW.day > current_date + 1 THEN RAISE EXCEPTION 'invalid_day'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER wellness_stamp BEFORE INSERT OR UPDATE ON public.wellness
  FOR EACH ROW EXECUTE FUNCTION public._wellness_stamp();

-- ───────────────── Grants ─────────────────
REVOKE ALL ON public.wellness FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wellness TO authenticated;
REVOKE EXECUTE ON FUNCTION public._glicko2_update(numeric, numeric, numeric, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._wellness_stamp() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_match(uuid, date, text, uuid, uuid, uuid, uuid, text[], smallint, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_standings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.record_match(uuid, date, text, uuid, uuid, uuid, uuid, text[], smallint, uuid),
  public.get_standings(uuid)
TO authenticated;

-- ───────────────── Realtime ─────────────────
-- Lets open phones refresh when anyone records a match or logs training. Supabase applies
-- the same row-level security to these change feeds. Skipped where realtime isn't installed.
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['matches', 'sessions', 'attendance'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;
