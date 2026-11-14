-- IISc Training Camp — standalone schema (own Supabase project, nothing shared with the club app).
--
-- Security model
--   * anon gets nothing. authenticated gets only the explicit grants below.
--   * Matches, roster, selection lock and activity are written ONLY through SECURITY DEFINER
--     RPCs that derive the actor from auth.uid(); clients cannot set authorship or status.
--   * Sessions / drills / attendance are plain tables (any camp member may write), with
--     authorship stamped by trigger.
--   * People profiles are created by the camp admin; a person may optionally have an email,
--     which lets them sign in with Google and claim the profile (claim_my_profile()).

-- ───────────────────────────── Tables ─────────────────────────────

CREATE TABLE public.people (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name    text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 80),
  gender       text CHECK (gender IN ('M', 'F')),
  email        text UNIQUE CHECK (email IS NULL OR (email = lower(btrim(email)) AND email LIKE '%_@_%')),
  auth_user_id uuid UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.site_admins (
  person_id uuid PRIMARY KEY REFERENCES public.people(id) ON DELETE CASCADE
);

CREATE TABLE public.camps (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  starts_on               date,
  ends_on                 date,
  status                  text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  selection_target        integer NOT NULL DEFAULT 10 CHECK (selection_target BETWEEN 1 AND 100),
  visibility              text NOT NULL DEFAULT 'members' CHECK (visibility IN ('staff', 'members')),
  players_see_all_results boolean NOT NULL DEFAULT true,
  publish_selection       boolean NOT NULL DEFAULT false,
  activity_enabled        boolean NOT NULL DEFAULT true,
  selection_locked_at     timestamptz,
  selection_locked_by     uuid REFERENCES public.people(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);

CREATE TABLE public.camp_members (
  camp_id        uuid NOT NULL REFERENCES public.camps(id) ON DELETE CASCADE,
  person_id      uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  role           text NOT NULL CHECK (role IN ('admin', 'coach', 'player')),
  activity_muted boolean NOT NULL DEFAULT false,
  PRIMARY KEY (camp_id, person_id)
);
CREATE INDEX camp_members_person_idx ON public.camp_members (person_id);

CREATE TABLE public.matches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id       uuid NOT NULL REFERENCES public.camps(id) ON DELETE CASCADE,
  played_on     date NOT NULL DEFAULT current_date,
  category      text NOT NULL CHECK (category IN ('MS', 'WS', 'MD', 'WD', 'XD')),
  t1_p1         uuid NOT NULL REFERENCES public.people(id),
  t1_p2         uuid REFERENCES public.people(id),
  t2_p1         uuid NOT NULL REFERENCES public.people(id),
  t2_p2         uuid REFERENCES public.people(id),
  games         text[],
  winner_side   smallint NOT NULL CHECK (winner_side IN (1, 2)),
  status        text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'disputed', 'void')),
  dispute_reason text,
  disputed_by   uuid REFERENCES public.people(id),
  disputed_at   timestamptz,
  recorded_by   uuid NOT NULL REFERENCES public.people(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES public.people(id),
  updated_at    timestamptz,
  CHECK ((category IN ('MS', 'WS')) = (t1_p2 IS NULL AND t2_p2 IS NULL)),
  CHECK (category IN ('MS', 'WS') OR (t1_p2 IS NOT NULL AND t2_p2 IS NOT NULL))
);
CREATE INDEX matches_camp_idx ON public.matches (camp_id, played_on, created_at);

CREATE TABLE public.sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id      uuid NOT NULL REFERENCES public.camps(id) ON DELETE CASCADE,
  session_date date NOT NULL DEFAULT current_date,
  title        text NOT NULL DEFAULT 'Training' CHECK (length(title) <= 80),
  focus        text CHECK (length(focus) <= 200),
  notes        text CHECK (length(notes) <= 2000),
  created_by   uuid REFERENCES public.people(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES public.people(id),
  updated_at   timestamptz
);
CREATE INDEX sessions_camp_idx ON public.sessions (camp_id, session_date);

CREATE TABLE public.session_drills (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  drill_name   text NOT NULL CHECK (length(btrim(drill_name)) BETWEEN 1 AND 80),
  drill_type   text NOT NULL DEFAULT 'other' CHECK (drill_type IN
                 ('footwork', 'net', 'smash', 'defence', 'serve_return', 'multi_shuttle',
                  'fitness', 'match_play', 'other')),
  duration_min integer CHECK (duration_min BETWEEN 1 AND 600),
  sets         integer CHECK (sets BETWEEN 1 AND 100),
  reps         integer CHECK (reps BETWEEN 1 AND 1000),
  intensity    integer CHECK (intensity BETWEEN 1 AND 5),
  notes        text CHECK (length(notes) <= 500),
  created_by   uuid REFERENCES public.people(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES public.people(id),
  updated_at   timestamptz
);
CREATE INDEX session_drills_session_idx ON public.session_drills (session_id);

CREATE TABLE public.attendance (
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  person_id  uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  status     text NOT NULL CHECK (status IN ('present', 'late', 'absent')),
  rpe        integer CHECK (rpe BETWEEN 1 AND 10),
  note       text CHECK (length(note) <= 300),
  created_by uuid REFERENCES public.people(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.people(id),
  updated_at timestamptz,
  PRIMARY KEY (session_id, person_id)
);

CREATE TABLE public.assessments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id     uuid NOT NULL REFERENCES public.camps(id) ON DELETE CASCADE,
  person_id   uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  coach_id    uuid REFERENCES public.people(id),
  assessed_on date NOT NULL DEFAULT current_date,
  technique   integer CHECK (technique BETWEEN 1 AND 5),
  fitness     integer CHECK (fitness BETWEEN 1 AND 5),
  tactics     integer CHECK (tactics BETWEEN 1 AND 5),
  attitude    integer CHECK (attitude BETWEEN 1 AND 5),
  note        text CHECK (length(note) <= 1000),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assessments_camp_idx ON public.assessments (camp_id, person_id);

CREATE TABLE public.selection (
  camp_id    uuid NOT NULL REFERENCES public.camps(id) ON DELETE CASCADE,
  person_id  uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  decision   text NOT NULL CHECK (decision IN ('selected', 'standby', 'not_selected')),
  note       text CHECK (length(note) <= 500),
  decided_by uuid REFERENCES public.people(id),
  decided_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (camp_id, person_id)
);

CREATE TABLE public.selection_events (
  id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  camp_id  uuid NOT NULL REFERENCES public.camps(id) ON DELETE CASCADE,
  kind     text NOT NULL CHECK (kind IN ('lock', 'unlock')),
  reason   text,
  actor_id uuid REFERENCES public.people(id),
  at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.activity (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  camp_id      uuid NOT NULL REFERENCES public.camps(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  kind         text NOT NULL,
  match_id     uuid REFERENCES public.matches(id) ON DELETE CASCADE,
  message      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  read_at      timestamptz
);
CREATE INDEX activity_recipient_idx ON public.activity (recipient_id, created_at DESC);

-- ───────────────────────────── Helpers ─────────────────────────────

-- The caller's people.id (NULL when signed out or not yet on a roster).
CREATE FUNCTION public.me() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id FROM public.people WHERE auth_user_id = auth.uid() AND auth.uid() IS NOT NULL;
$$;

CREATE FUNCTION public.is_site_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.site_admins WHERE person_id = public.me());
$$;

CREATE FUNCTION public.camp_role(p_camp uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN public.is_site_admin() THEN 'admin'
              ELSE (SELECT role FROM public.camp_members
                    WHERE camp_id = p_camp AND person_id = public.me()) END;
$$;

CREATE FUNCTION public.is_camp_admin(p_camp uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(public.camp_role(p_camp) = 'admin', false);
$$;

CREATE FUNCTION public.is_camp_staff(p_camp uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(public.camp_role(p_camp) IN ('admin', 'coach'), false);
$$;

CREATE FUNCTION public.is_camp_member(p_camp uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.camp_role(p_camp) IS NOT NULL;
$$;

-- Staff always; players only when the camp is visible to members.
CREATE FUNCTION public.can_view_camp(p_camp uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.is_camp_staff(p_camp)
      OR (public.is_camp_member(p_camp)
          AND EXISTS (SELECT 1 FROM public.camps WHERE id = p_camp AND visibility = 'members'));
$$;

-- Whether the caller may see every result in the camp (not just their own matches).
CREATE FUNCTION public.can_see_all_results(p_camp uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.is_camp_staff(p_camp)
      OR (public.can_view_camp(p_camp)
          AND EXISTS (SELECT 1 FROM public.camps WHERE id = p_camp AND players_see_all_results));
$$;

CREATE FUNCTION public.session_camp(p_session uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT camp_id FROM public.sessions WHERE id = p_session;
$$;

CREATE FUNCTION public.can_see_person(p_person uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_person = public.me()
      OR public.is_site_admin()
      OR EXISTS (SELECT 1 FROM public.camp_members cm
                 WHERE cm.person_id = p_person AND public.can_view_camp(cm.camp_id));
$$;

-- In-site activity row, honouring the camp-wide switch and the recipient's mute.
CREATE FUNCTION public._notify(p_camp uuid, p_recipient uuid, p_kind text, p_match uuid, p_message text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO public.activity (camp_id, recipient_id, kind, match_id, message)
  SELECT p_camp, p_recipient, p_kind, p_match, p_message
  WHERE p_recipient IS NOT NULL
    AND p_recipient IS DISTINCT FROM public.me()
    AND EXISTS (SELECT 1 FROM public.camps WHERE id = p_camp AND activity_enabled)
    AND EXISTS (SELECT 1 FROM public.camp_members
                WHERE camp_id = p_camp AND person_id = p_recipient AND NOT activity_muted);
$$;

-- ───────────────────────────── Profile / roster RPCs ─────────────────────────────

-- Links the signed-in Google account to the admin-created profile with the same email.
CREATE FUNCTION public.claim_my_profile() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_email text := lower(NULLIF(btrim(auth.jwt()->>'email'), ''));
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
  v_id := public.me();
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  IF v_email IS NULL THEN RETURN NULL; END IF;
  UPDATE public.people SET auth_user_id = auth.uid()
   WHERE email = v_email AND auth_user_id IS NULL
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Run once from the Supabase SQL editor (not callable by app users).
CREATE FUNCTION public.bootstrap_site_admin(p_email text, p_full_name text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.people (full_name, email)
  VALUES (btrim(p_full_name), lower(btrim(p_email)))
  ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
  RETURNING id INTO v_id;
  INSERT INTO public.site_admins (person_id) VALUES (v_id) ON CONFLICT DO NOTHING;
  RETURN v_id;
END $$;

CREATE FUNCTION public.create_camp(p_name text, p_starts_on date, p_ends_on date, p_selection_target integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_site_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.camps (name, starts_on, ends_on, selection_target)
  VALUES (btrim(p_name), p_starts_on, p_ends_on, COALESCE(p_selection_target, 10))
  RETURNING id INTO v_id;
  INSERT INTO public.camp_members (camp_id, person_id, role) VALUES (v_id, public.me(), 'admin');
  RETURN v_id;
END $$;

-- Camp admin creates a profile (email optional) and adds it to the roster in one step.
CREATE FUNCTION public.add_camp_person(p_camp uuid, p_full_name text, p_gender text, p_email text, p_role text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_email text := lower(NULLIF(btrim(p_email), ''));
  v_id uuid;
BEGIN
  IF NOT public.is_camp_admin(p_camp) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_role NOT IN ('admin', 'coach', 'player') THEN RAISE EXCEPTION 'invalid_role'; END IF;
  IF v_email IS NOT NULL THEN
    SELECT id INTO v_id FROM public.people WHERE email = v_email;
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.people (full_name, gender, email)
    VALUES (btrim(p_full_name), NULLIF(p_gender, ''), v_email)
    RETURNING id INTO v_id;
  END IF;
  INSERT INTO public.camp_members (camp_id, person_id, role) VALUES (p_camp, v_id, p_role)
  ON CONFLICT (camp_id, person_id) DO UPDATE SET role = EXCLUDED.role;
  RETURN v_id;
END $$;

-- Camp admin edits a profile that belongs to their camp.
CREATE FUNCTION public.update_camp_person(p_camp uuid, p_person uuid, p_full_name text, p_gender text, p_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_email text := lower(NULLIF(btrim(p_email), ''));
BEGIN
  IF NOT public.is_camp_admin(p_camp) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.camp_members WHERE camp_id = p_camp AND person_id = p_person) THEN
    RAISE EXCEPTION 'not_in_camp';
  END IF;
  UPDATE public.people
     SET full_name = btrim(p_full_name),
         gender = NULLIF(p_gender, ''),
         email = v_email,
         -- Changing the email unlinks any previously claimed sign-in.
         auth_user_id = CASE WHEN email IS NOT DISTINCT FROM v_email THEN auth_user_id END
   WHERE id = p_person;
END $$;

CREATE FUNCTION public.set_member_role(p_camp uuid, p_person uuid, p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_camp_admin(p_camp) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_role NOT IN ('admin', 'coach', 'player') THEN RAISE EXCEPTION 'invalid_role'; END IF;
  IF p_person = public.me() AND p_role <> 'admin' AND NOT public.is_site_admin() THEN
    RAISE EXCEPTION 'cannot_demote_self';
  END IF;
  UPDATE public.camp_members SET role = p_role WHERE camp_id = p_camp AND person_id = p_person;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_in_camp'; END IF;
END $$;

CREATE FUNCTION public.remove_camp_member(p_camp uuid, p_person uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_camp_admin(p_camp) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_person = public.me() THEN RAISE EXCEPTION 'cannot_remove_self'; END IF;
  IF EXISTS (SELECT 1 FROM public.matches WHERE camp_id = p_camp
             AND p_person IN (t1_p1, t1_p2, t2_p1, t2_p2)) THEN
    RAISE EXCEPTION 'has_matches: void their matches first or keep them on the roster';
  END IF;
  -- Raises selection_locked (via the selection guard) if the squad is locked.
  DELETE FROM public.selection WHERE camp_id = p_camp AND person_id = p_person;
  DELETE FROM public.camp_members WHERE camp_id = p_camp AND person_id = p_person;
END $$;

-- Camp admin can mute anyone; a member can mute only themself.
CREATE FUNCTION public.set_activity_muted(p_camp uuid, p_person uuid, p_muted boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT (public.is_camp_admin(p_camp) OR (p_person = public.me() AND public.is_camp_member(p_camp))) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.camp_members SET activity_muted = p_muted WHERE camp_id = p_camp AND person_id = p_person;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_in_camp'; END IF;
END $$;

-- Roster with emails, for the camp admin's settings screen only.
CREATE FUNCTION public.get_roster_admin(p_camp uuid)
RETURNS TABLE (person_id uuid, full_name text, gender text, email text, role text,
               activity_muted boolean, signed_in boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_camp_admin(p_camp) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT p.id, p.full_name, p.gender, p.email, cm.role, cm.activity_muted, p.auth_user_id IS NOT NULL
      FROM public.camp_members cm JOIN public.people p ON p.id = cm.person_id
     WHERE cm.camp_id = p_camp
     ORDER BY cm.role, p.full_name;
END $$;

-- ───────────────────────────── Match RPCs ─────────────────────────────

-- Validates players, genders and scores. Raises on any problem.
CREATE FUNCTION public._validate_match(p_camp uuid, p_category text, p_t1_p1 uuid, p_t1_p2 uuid,
  p_t2_p1 uuid, p_t2_p2 uuid, p_games text[], p_winner_side smallint)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_singles boolean := p_category IN ('MS', 'WS');
  v_ids uuid[];
  v_genders text[];
  g text; a int; b int; w1 int := 0; w2 int := 0;
BEGIN
  IF p_category NOT IN ('MS', 'WS', 'MD', 'WD', 'XD') THEN RAISE EXCEPTION 'invalid_category'; END IF;
  IF p_winner_side NOT IN (1, 2) THEN RAISE EXCEPTION 'invalid_winner'; END IF;
  IF v_singles AND (p_t1_p2 IS NOT NULL OR p_t2_p2 IS NOT NULL) THEN RAISE EXCEPTION 'singles_has_partner'; END IF;
  IF NOT v_singles AND (p_t1_p2 IS NULL OR p_t2_p2 IS NULL) THEN RAISE EXCEPTION 'doubles_needs_partners'; END IF;

  v_ids := array_remove(ARRAY[p_t1_p1, p_t1_p2, p_t2_p1, p_t2_p2], NULL);
  IF (SELECT count(DISTINCT x) FROM unnest(v_ids) x) <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'duplicate_player';
  END IF;
  IF (SELECT count(*) FROM public.camp_members
       WHERE camp_id = p_camp AND role = 'player' AND person_id = ANY (v_ids)) <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'player_not_in_camp';
  END IF;

  -- Gender rules apply only where the profile has a gender set.
  SELECT array_agg(p.gender ORDER BY o.ord) INTO v_genders
    FROM unnest(ARRAY[p_t1_p1, p_t1_p2, p_t2_p1, p_t2_p2]) WITH ORDINALITY o(id, ord)
    LEFT JOIN public.people p ON p.id = o.id;
  IF p_category IN ('MS', 'MD') AND 'F' = ANY (v_genders) THEN RAISE EXCEPTION 'category_gender_mismatch'; END IF;
  IF p_category IN ('WS', 'WD') AND 'M' = ANY (v_genders) THEN RAISE EXCEPTION 'category_gender_mismatch'; END IF;
  IF p_category = 'XD' AND (
       (v_genders[1] IS NOT NULL AND v_genders[1] = v_genders[2]) OR
       (v_genders[3] IS NOT NULL AND v_genders[3] = v_genders[4])) THEN
    RAISE EXCEPTION 'category_gender_mismatch';
  END IF;

  IF p_games IS NOT NULL AND cardinality(p_games) > 0 THEN
    IF cardinality(p_games) > 5 THEN RAISE EXCEPTION 'invalid_games'; END IF;
    FOREACH g IN ARRAY p_games LOOP
      IF g !~ '^\d{1,2}-\d{1,2}$' THEN RAISE EXCEPTION 'invalid_games'; END IF;
      a := split_part(g, '-', 1)::int; b := split_part(g, '-', 2)::int;
      IF a = b OR a > 99 OR b > 99 THEN RAISE EXCEPTION 'invalid_games'; END IF;
      IF a > b THEN w1 := w1 + 1; ELSE w2 := w2 + 1; END IF;
    END LOOP;
    IF (w1 > w2 AND p_winner_side <> 1) OR (w2 > w1 AND p_winner_side <> 2) OR w1 = w2 THEN
      RAISE EXCEPTION 'winner_does_not_match_games';
    END IF;
  END IF;
END $$;

CREATE FUNCTION public.record_match(p_camp uuid, p_played_on date, p_category text,
  p_t1_p1 uuid, p_t1_p2 uuid, p_t2_p1 uuid, p_t2_p2 uuid, p_games text[], p_winner_side smallint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_me uuid := public.me();
  v_id uuid;
  v_games text[] := NULLIF(p_games, '{}');
  p uuid;
BEGIN
  IF v_me IS NULL OR NOT public.can_view_camp(p_camp) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.camps WHERE id = p_camp AND status <> 'active') THEN RAISE EXCEPTION 'camp_closed'; END IF;
  PERFORM public._validate_match(p_camp, p_category, p_t1_p1, p_t1_p2, p_t2_p1, p_t2_p2, v_games, p_winner_side);
  INSERT INTO public.matches (camp_id, played_on, category, t1_p1, t1_p2, t2_p1, t2_p2, games, winner_side, recorded_by)
  VALUES (p_camp, COALESCE(p_played_on, current_date), p_category, p_t1_p1, p_t1_p2, p_t2_p1, p_t2_p2,
          v_games, p_winner_side, v_me)
  RETURNING id INTO v_id;
  FOREACH p IN ARRAY array_remove(ARRAY[p_t1_p1, p_t1_p2, p_t2_p1, p_t2_p2], NULL) LOOP
    PERFORM public._notify(p_camp, p, 'match_recorded', v_id,
      'A match you played was recorded. You can dispute it within 24 hours.');
  END LOOP;
  RETURN v_id;
END $$;

-- Recorder may edit within 24 h while confirmed; staff may edit any time (status unchanged).
CREATE FUNCTION public.edit_match(p_match uuid, p_played_on date, p_category text,
  p_t1_p1 uuid, p_t1_p2 uuid, p_t2_p1 uuid, p_t2_p2 uuid, p_games text[], p_winner_side smallint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_me uuid := public.me();
  m public.matches;
  v_games text[] := NULLIF(p_games, '{}');
  p uuid;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (public.is_camp_staff(m.camp_id)
          OR (m.recorded_by = v_me AND m.status = 'confirmed'
              AND m.created_at > now() - interval '24 hours'
              AND public.can_view_camp(m.camp_id))) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM public._validate_match(m.camp_id, p_category, p_t1_p1, p_t1_p2, p_t2_p1, p_t2_p2, v_games, p_winner_side);
  UPDATE public.matches
     SET played_on = COALESCE(p_played_on, played_on), category = p_category,
         t1_p1 = p_t1_p1, t1_p2 = p_t1_p2, t2_p1 = p_t2_p1, t2_p2 = p_t2_p2,
         games = v_games, winner_side = p_winner_side, updated_by = v_me, updated_at = now()
   WHERE id = p_match;
  FOREACH p IN ARRAY array_remove(ARRAY[p_t1_p1, p_t1_p2, p_t2_p1, p_t2_p2], NULL) LOOP
    PERFORM public._notify(m.camp_id, p, 'match_edited', p_match, 'A match you played was edited.');
  END LOOP;
END $$;

-- A participant may dispute a confirmed match within 24 h of it being recorded.
CREATE FUNCTION public.dispute_match(p_match uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_me uuid := public.me();
  m public.matches;
  s uuid;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_me IS NULL OR v_me NOT IN (m.t1_p1, COALESCE(m.t1_p2, m.t1_p1), m.t2_p1, COALESCE(m.t2_p2, m.t2_p1))
     OR NOT public.is_camp_member(m.camp_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF m.status <> 'confirmed' THEN RAISE EXCEPTION 'not_disputable'; END IF;
  IF m.created_at <= now() - interval '24 hours' THEN RAISE EXCEPTION 'dispute_window_closed'; END IF;
  IF length(btrim(COALESCE(p_reason, ''))) = 0 THEN RAISE EXCEPTION 'reason_required'; END IF;
  UPDATE public.matches
     SET status = 'disputed', dispute_reason = left(btrim(p_reason), 500),
         disputed_by = v_me, disputed_at = now()
   WHERE id = p_match;
  FOR s IN SELECT person_id FROM public.camp_members
            WHERE camp_id = m.camp_id AND role IN ('admin', 'coach') LOOP
    PERFORM public._notify(m.camp_id, s, 'match_disputed', p_match, 'A match result was disputed and needs review.');
  END LOOP;
END $$;

-- Staff only: the single path out of 'disputed' and into/out of 'void'.
CREATE FUNCTION public.resolve_match(p_match uuid, p_status text, p_games text[], p_winner_side smallint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_me uuid := public.me();
  m public.matches;
  v_games text[] := NULLIF(p_games, '{}');
  p uuid;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.is_camp_staff(m.camp_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('confirmed', 'void') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  IF p_status = 'confirmed' THEN
    PERFORM public._validate_match(m.camp_id, m.category, m.t1_p1, m.t1_p2, m.t2_p1, m.t2_p2,
                                   v_games, p_winner_side);
  END IF;
  UPDATE public.matches
     SET status = p_status,
         games = CASE WHEN p_status = 'confirmed' THEN v_games ELSE games END,
         winner_side = CASE WHEN p_status = 'confirmed' THEN p_winner_side ELSE winner_side END,
         updated_by = v_me, updated_at = now()
   WHERE id = p_match;
  FOREACH p IN ARRAY array_remove(ARRAY[m.t1_p1, m.t1_p2, m.t2_p1, m.t2_p2], NULL) LOOP
    PERFORM public._notify(m.camp_id, p, 'match_resolved', p_match,
      CASE WHEN p_status = 'void' THEN 'A match you played was voided by a coach.'
           ELSE 'A coach confirmed the result of a match you played.' END);
  END LOOP;
END $$;

-- ───────────────────────────── Standings ─────────────────────────────

-- Camp-only Elo: everyone starts at 1200, K = 32, doubles use the pair average,
-- winner-only matches count the same as scored ones. Never written anywhere.
CREATE FUNCTION public.get_standings(p_camp uuid)
RETURNS TABLE (person_id uuid, full_name text, gender text, rating integer, played integer,
               won integer, lost integer, points_for integer, points_against integer,
               form text, by_category jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_me uuid := public.me();
  v_all boolean;
  st jsonb := '{}'::jsonb;   -- person_id -> {r, p, w, l, pf, pa, form, cat}
  m record;
  t1 uuid[]; t2 uuid[];
  r1 numeric; r2 numeric; e1 numeric; d1 integer;
  pf1 int; pf2 int; g text;
  pid uuid; side int; cur jsonb; won_it boolean; delta int; cat jsonb;
BEGIN
  IF NOT public.can_view_camp(p_camp) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  v_all := public.can_see_all_results(p_camp);

  SELECT COALESCE(jsonb_object_agg(cm.person_id::text,
           jsonb_build_object('r', 1200, 'p', 0, 'w', 0, 'l', 0, 'pf', 0, 'pa', 0, 'form', '', 'cat', '{}'::jsonb)),
         '{}'::jsonb)
    INTO st FROM public.camp_members cm WHERE cm.camp_id = p_camp AND cm.role = 'player';

  FOR m IN SELECT * FROM public.matches
            WHERE camp_id = p_camp AND status = 'confirmed'
            ORDER BY played_on, created_at, id LOOP
    t1 := array_remove(ARRAY[m.t1_p1, m.t1_p2], NULL);
    t2 := array_remove(ARRAY[m.t2_p1, m.t2_p2], NULL);
    -- Skip matches involving someone no longer listed as a player.
    IF EXISTS (SELECT 1 FROM unnest(t1 || t2) x WHERE NOT st ? x::text) THEN CONTINUE; END IF;

    SELECT avg((st->x::text->>'r')::numeric) INTO r1 FROM unnest(t1) x;
    SELECT avg((st->x::text->>'r')::numeric) INTO r2 FROM unnest(t2) x;
    e1 := 1 / (1 + power(10, (r2 - r1) / 400));
    d1 := round(32 * ((CASE WHEN m.winner_side = 1 THEN 1 ELSE 0 END) - e1));

    pf1 := 0; pf2 := 0;
    IF m.games IS NOT NULL THEN
      FOREACH g IN ARRAY m.games LOOP
        pf1 := pf1 + split_part(g, '-', 1)::int;
        pf2 := pf2 + split_part(g, '-', 2)::int;
      END LOOP;
    END IF;

    FOREACH pid IN ARRAY (t1 || t2) LOOP
      side := CASE WHEN pid = ANY (t1) THEN 1 ELSE 2 END;
      won_it := side = m.winner_side;
      delta := CASE WHEN side = 1 THEN d1 ELSE -d1 END;
      cur := st->pid::text;
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
        'cat', jsonb_set(cur->'cat', ARRAY[m.category], cat));
      st := jsonb_set(st, ARRAY[pid::text], cur);
    END LOOP;
  END LOOP;

  RETURN QUERY
    SELECT p.id, p.full_name, p.gender,
           (s.value->>'r')::numeric::int, (s.value->>'p')::int, (s.value->>'w')::int,
           (s.value->>'l')::int, (s.value->>'pf')::int, (s.value->>'pa')::int,
           s.value->>'form', s.value->'cat'
      FROM jsonb_each(st) s
      JOIN public.people p ON p.id = s.key::uuid
     WHERE v_all OR p.id = v_me
     ORDER BY (s.value->>'r')::numeric DESC, (s.value->>'w')::int DESC, p.full_name;
END $$;

-- ───────────────────────────── Selection ─────────────────────────────

-- Every write to selection takes the camp row lock and refuses while the squad is locked,
-- so edits and lock_selection() serialise and a locked squad cannot drift.
CREATE FUNCTION public._selection_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_locked timestamptz; v_camp uuid := COALESCE(NEW.camp_id, OLD.camp_id);
BEGIN
  SELECT selection_locked_at INTO v_locked FROM public.camps WHERE id = v_camp FOR UPDATE;
  IF v_locked IS NOT NULL THEN RAISE EXCEPTION 'selection_locked' USING ERRCODE = '42501'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.camp_id <> OLD.camp_id OR NEW.person_id <> OLD.person_id) THEN
    RAISE EXCEPTION 'immutable_key';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.camp_members
                 WHERE camp_id = NEW.camp_id AND person_id = NEW.person_id AND role = 'player') THEN
    RAISE EXCEPTION 'player_not_in_camp';
  END IF;
  NEW.decided_by := public.me();
  NEW.decided_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER selection_guard BEFORE INSERT OR UPDATE OR DELETE ON public.selection
  FOR EACH ROW EXECUTE FUNCTION public._selection_guard();

CREATE FUNCTION public._camp_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.selection_locked_at IS NOT NULL AND NEW.selection_locked_at IS NOT NULL
     AND NEW.selection_target <> OLD.selection_target THEN
    RAISE EXCEPTION 'selection_locked' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER camp_guard BEFORE UPDATE ON public.camps
  FOR EACH ROW EXECUTE FUNCTION public._camp_guard();

CREATE FUNCTION public.lock_selection(p_camp uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c public.camps; n int;
BEGIN
  IF NOT public.is_camp_admin(p_camp) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO c FROM public.camps WHERE id = p_camp FOR UPDATE;
  IF c.selection_locked_at IS NOT NULL THEN RAISE EXCEPTION 'already_locked'; END IF;
  SELECT count(*) INTO n FROM public.selection WHERE camp_id = p_camp AND decision = 'selected';
  IF n <> c.selection_target THEN
    RAISE EXCEPTION 'selected_count_mismatch: % selected, % required', n, c.selection_target;
  END IF;
  UPDATE public.camps SET selection_locked_at = now(), selection_locked_by = public.me() WHERE id = p_camp;
  INSERT INTO public.selection_events (camp_id, kind, actor_id) VALUES (p_camp, 'lock', public.me());
END $$;

CREATE FUNCTION public.unlock_selection(p_camp uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c public.camps;
BEGIN
  IF NOT public.is_camp_admin(p_camp) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF length(btrim(COALESCE(p_reason, ''))) = 0 THEN RAISE EXCEPTION 'reason_required'; END IF;
  SELECT * INTO c FROM public.camps WHERE id = p_camp FOR UPDATE;
  IF c.selection_locked_at IS NULL THEN RAISE EXCEPTION 'not_locked'; END IF;
  UPDATE public.camps SET selection_locked_at = NULL, selection_locked_by = NULL WHERE id = p_camp;
  INSERT INTO public.selection_events (camp_id, kind, reason, actor_id)
  VALUES (p_camp, 'unlock', left(btrim(p_reason), 500), public.me());
END $$;

-- Read-only published squad for members (no coach notes); full board for staff.
CREATE FUNCTION public.get_squad(p_camp uuid)
RETURNS TABLE (person_id uuid, full_name text, gender text, decision text, note text, published boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c public.camps; v_staff boolean;
BEGIN
  IF NOT public.can_view_camp(p_camp) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO c FROM public.camps WHERE id = p_camp;
  v_staff := public.is_camp_staff(p_camp);
  IF NOT v_staff AND NOT (c.selection_locked_at IS NOT NULL AND c.publish_selection) THEN
    RETURN;  -- not published yet: no rows
  END IF;
  RETURN QUERY
    SELECT p.id, p.full_name, p.gender, s.decision,
           CASE WHEN v_staff THEN s.note END,
           (c.selection_locked_at IS NOT NULL AND c.publish_selection)
      FROM public.selection s JOIN public.people p ON p.id = s.person_id
     WHERE s.camp_id = p_camp AND (v_staff OR s.decision IN ('selected', 'standby'))
     ORDER BY CASE s.decision WHEN 'selected' THEN 0 WHEN 'standby' THEN 1 ELSE 2 END, p.full_name;
END $$;

-- ───────────────────────────── Authorship stamping ─────────────────────────────

CREATE FUNCTION public._stamp() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := public.me();
    NEW.created_at := now();
    NEW.updated_by := NULL;
    NEW.updated_at := NULL;
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.updated_by := public.me();
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sessions_stamp BEFORE INSERT OR UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public._stamp();
CREATE TRIGGER drills_stamp BEFORE INSERT OR UPDATE ON public.session_drills FOR EACH ROW EXECUTE FUNCTION public._stamp();
CREATE TRIGGER attendance_stamp BEFORE INSERT OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public._stamp();

CREATE FUNCTION public._assessment_stamp() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.camp_id := OLD.camp_id; NEW.person_id := OLD.person_id; NEW.created_at := OLD.created_at;
  ELSE
    NEW.created_at := now();
  END IF;
  NEW.coach_id := public.me();
  RETURN NEW;
END $$;
CREATE TRIGGER assessments_stamp BEFORE INSERT OR UPDATE ON public.assessments FOR EACH ROW EXECUTE FUNCTION public._assessment_stamp();

-- Keep child rows inside their parent's camp.
CREATE FUNCTION public._keep_parent() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME = 'sessions' AND NEW.camp_id <> OLD.camp_id THEN RAISE EXCEPTION 'immutable_camp'; END IF;
  IF TG_TABLE_NAME IN ('session_drills', 'attendance') AND NEW.session_id <> OLD.session_id THEN
    RAISE EXCEPTION 'immutable_session';
  END IF;
  IF TG_TABLE_NAME = 'attendance' AND NEW.person_id <> OLD.person_id THEN RAISE EXCEPTION 'immutable_person'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sessions_keep BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public._keep_parent();
CREATE TRIGGER drills_keep BEFORE UPDATE ON public.session_drills FOR EACH ROW EXECUTE FUNCTION public._keep_parent();
CREATE TRIGGER attendance_keep BEFORE UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public._keep_parent();

-- ───────────────────────────── Row level security ─────────────────────────────

ALTER TABLE public.people           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_admins      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camps            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camp_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_drills   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selection        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selection_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity         ENABLE ROW LEVEL SECURITY;

CREATE POLICY people_read ON public.people FOR SELECT TO authenticated USING (public.can_see_person(id));

CREATE POLICY camps_read ON public.camps FOR SELECT TO authenticated USING (public.can_view_camp(id));
CREATE POLICY camps_admin_update ON public.camps FOR UPDATE TO authenticated
  USING (public.is_camp_admin(id)) WITH CHECK (public.is_camp_admin(id));

CREATE POLICY members_read ON public.camp_members FOR SELECT TO authenticated USING (public.can_view_camp(camp_id));

CREATE POLICY matches_read ON public.matches FOR SELECT TO authenticated
  USING (public.can_view_camp(camp_id)
         AND (public.can_see_all_results(camp_id) OR public.me() IN (t1_p1, t1_p2, t2_p1, t2_p2)));

CREATE POLICY sessions_read ON public.sessions FOR SELECT TO authenticated USING (public.can_view_camp(camp_id));
CREATE POLICY sessions_insert ON public.sessions FOR INSERT TO authenticated WITH CHECK (public.can_view_camp(camp_id));
CREATE POLICY sessions_update ON public.sessions FOR UPDATE TO authenticated
  USING (public.can_view_camp(camp_id)) WITH CHECK (public.can_view_camp(camp_id));
CREATE POLICY sessions_delete ON public.sessions FOR DELETE TO authenticated USING (public.is_camp_staff(camp_id));

CREATE POLICY drills_read ON public.session_drills FOR SELECT TO authenticated
  USING (public.can_view_camp(public.session_camp(session_id)));
CREATE POLICY drills_insert ON public.session_drills FOR INSERT TO authenticated
  WITH CHECK (public.can_view_camp(public.session_camp(session_id)));
CREATE POLICY drills_update ON public.session_drills FOR UPDATE TO authenticated
  USING (public.can_view_camp(public.session_camp(session_id)))
  WITH CHECK (public.can_view_camp(public.session_camp(session_id)));
CREATE POLICY drills_delete ON public.session_drills FOR DELETE TO authenticated
  USING (public.is_camp_staff(public.session_camp(session_id)));

CREATE POLICY attendance_read ON public.attendance FOR SELECT TO authenticated
  USING (public.can_view_camp(public.session_camp(session_id)));
CREATE POLICY attendance_insert ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (public.can_view_camp(public.session_camp(session_id))
              AND EXISTS (SELECT 1 FROM public.camp_members cm
                          WHERE cm.camp_id = public.session_camp(session_id) AND cm.person_id = attendance.person_id));
CREATE POLICY attendance_update ON public.attendance FOR UPDATE TO authenticated
  USING (public.can_view_camp(public.session_camp(session_id)))
  WITH CHECK (public.can_view_camp(public.session_camp(session_id)));
CREATE POLICY attendance_delete ON public.attendance FOR DELETE TO authenticated
  USING (public.is_camp_staff(public.session_camp(session_id)));

CREATE POLICY assessments_staff ON public.assessments FOR ALL TO authenticated
  USING (public.is_camp_staff(camp_id)) WITH CHECK (public.is_camp_staff(camp_id));

CREATE POLICY selection_staff ON public.selection FOR ALL TO authenticated
  USING (public.is_camp_staff(camp_id)) WITH CHECK (public.is_camp_staff(camp_id));

CREATE POLICY selection_events_staff ON public.selection_events FOR SELECT TO authenticated
  USING (public.is_camp_staff(camp_id));

CREATE POLICY activity_own ON public.activity FOR SELECT TO authenticated USING (recipient_id = public.me());
CREATE POLICY activity_mark_read ON public.activity FOR UPDATE TO authenticated
  USING (recipient_id = public.me()) WITH CHECK (recipient_id = public.me());

-- ───────────────────────────── Grants ─────────────────────────────
-- Supabase grants ALL on new public objects to anon/authenticated by default; start from zero.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT SELECT (id, full_name, gender) ON public.people TO authenticated;
GRANT SELECT ON public.camps, public.camp_members, public.matches TO authenticated;
GRANT UPDATE (name, starts_on, ends_on, status, selection_target, visibility,
              players_see_all_results, publish_selection, activity_enabled) ON public.camps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions, public.session_drills, public.attendance,
                                       public.assessments, public.selection TO authenticated;
GRANT SELECT ON public.selection_events TO authenticated;
GRANT SELECT ON public.activity TO authenticated;
GRANT UPDATE (read_at) ON public.activity TO authenticated;

GRANT EXECUTE ON FUNCTION
  public.me(), public.is_site_admin(), public.camp_role(uuid), public.is_camp_admin(uuid),
  public.is_camp_staff(uuid), public.is_camp_member(uuid), public.can_view_camp(uuid),
  public.can_see_all_results(uuid), public.session_camp(uuid), public.can_see_person(uuid),
  public.claim_my_profile(), public.create_camp(text, date, date, integer),
  public.add_camp_person(uuid, text, text, text, text),
  public.update_camp_person(uuid, uuid, text, text, text),
  public.set_member_role(uuid, uuid, text), public.remove_camp_member(uuid, uuid),
  public.set_activity_muted(uuid, uuid, boolean), public.get_roster_admin(uuid),
  public.record_match(uuid, date, text, uuid, uuid, uuid, uuid, text[], smallint),
  public.edit_match(uuid, date, text, uuid, uuid, uuid, uuid, text[], smallint),
  public.dispute_match(uuid, text), public.resolve_match(uuid, text, text[], smallint),
  public.get_standings(uuid), public.lock_selection(uuid), public.unlock_selection(uuid, text),
  public.get_squad(uuid)
TO authenticated;
-- Not granted to app users: bootstrap_site_admin, _validate_match, _notify, trigger functions.
