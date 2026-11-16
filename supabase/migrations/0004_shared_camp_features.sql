-- 0004: features that used to live only on the phone that entered them now live in the camp
-- database, so coaches and players see the same thing: announcements (with read receipts),
-- player goals, equipment, injury reports, post-practice reflections, custom skills, the venue
-- plan, the live court board and each player's next-session focus. Also a race-safe way to get
-- today's session.
-- Safe to run once in the Supabase SQL editor after 0001–0003.

-- ───────────────── Today's session, race-safe ─────────────────
-- Checking in creates today's session when there isn't one yet. Two phones doing that at the
-- same moment used to create two sessions; this serialises them per camp and day and returns
-- the existing session if there is one. Runs as the caller, so the sessions policies apply.
CREATE FUNCTION public.ensure_session(p_camp uuid, p_day date, p_title text, p_focus text, p_duration_min integer)
RETURNS uuid LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF public.me() IS NULL OR NOT public.can_view_camp(p_camp) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- p_day is the phone's local date; allow a day either side of the server's UTC date.
  IF p_day IS NULL OR p_day NOT BETWEEN current_date - 1 AND current_date + 1 THEN
    RAISE EXCEPTION 'invalid_day';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('session:' || p_camp::text || ':' || p_day::text, 0));
  SELECT id INTO v_id FROM public.sessions
   WHERE camp_id = p_camp AND session_date = p_day
   ORDER BY created_at, id
   LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.sessions (camp_id, session_date, title, focus, duration_min)
    VALUES (p_camp, p_day, COALESCE(NULLIF(btrim(p_title), ''), 'Training'),
            NULLIF(btrim(p_focus), ''), p_duration_min)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;

-- ───────────────── Shared helpers ─────────────────

-- Is this person on this camp's roster?
CREATE FUNCTION public.in_camp(p_camp uuid, p_person uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.camp_members WHERE camp_id = p_camp AND person_id = p_person);
$$;

-- Personal rows (goals, injury reports, reflections, next-session focus): the person themselves
-- or any coach/admin of the camp can read them.
CREATE FUNCTION public.can_read_personal(p_camp uuid, p_person uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(p_person = public.me(), false) OR public.is_camp_staff(p_camp);
$$;

-- ...and write them: the person while the camp is visible to them, or any coach/admin, and only
-- for someone on that camp's roster.
CREATE FUNCTION public.can_write_personal(p_camp uuid, p_person uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.in_camp(p_camp, p_person)
     AND ((COALESCE(p_person = public.me(), false) AND public.can_view_camp(p_camp))
          OR public.is_camp_staff(p_camp));
$$;

-- Rows can't be moved to another camp or another person.
CREATE FUNCTION public._keep_owner() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  o jsonb := to_jsonb(OLD);
  n jsonb := to_jsonb(NEW);
BEGIN
  IF n->>'camp_id' IS DISTINCT FROM o->>'camp_id' THEN RAISE EXCEPTION 'immutable_camp'; END IF;
  IF n ? 'person_id' AND n->>'person_id' IS DISTINCT FROM o->>'person_id' THEN
    RAISE EXCEPTION 'immutable_person';
  END IF;
  RETURN NEW;
END $$;

-- Coach-only fields. A player can edit the rest of their own row, but an injury report's status
-- and staff note, and a goal's coach feedback, are set by coaches only.
CREATE FUNCTION public._coach_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF public.is_camp_staff(NEW.camp_id) THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'injury_reports' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.status := 'new';
      NEW.staff_notes := NULL;
    ELSE
      NEW.status := OLD.status;
      NEW.staff_notes := OLD.staff_notes;
    END IF;
  ELSIF TG_TABLE_NAME = 'player_goals' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.coach_feedback := NULL;
    ELSE
      NEW.coach_feedback := OLD.coach_feedback;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ───────────────── Announcements ─────────────────
-- Coaches and the admin post; everyone who can see the camp reads. Each person acknowledges
-- for themselves; players see only their own receipt, staff see everyone's.
CREATE TABLE public.announcements (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id    uuid NOT NULL REFERENCES public.camps(id) ON DELETE CASCADE,
  title      text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  message    text NOT NULL CHECK (length(btrim(message)) BETWEEN 1 AND 2000),
  priority   text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'important', 'urgent')),
  expires_on date,
  created_by uuid REFERENCES public.people(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.people(id) ON DELETE SET NULL,
  updated_at timestamptz
);
CREATE INDEX announcements_camp_idx ON public.announcements (camp_id, created_at DESC);

CREATE TABLE public.announcement_reads (
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  person_id       uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  read_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, person_id)
);

CREATE FUNCTION public.announcement_camp(p_announcement uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT camp_id FROM public.announcements WHERE id = p_announcement;
$$;

-- ───────────────── Equipment ─────────────────
-- Everyone sees the camp's gear; coaches and the admin manage it.
CREATE TABLE public.equipment (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id     uuid NOT NULL REFERENCES public.camps(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  category    text NOT NULL CHECK (category IN ('shuttles', 'rackets', 'training_aids', 'medical')),
  quantity    integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 500),
  status      text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'borrowed', 'needs_replacement')),
  borrowed_by uuid REFERENCES public.people(id) ON DELETE SET NULL,
  borrowed_at timestamptz,
  notes       text CHECK (length(notes) <= 300),
  created_by  uuid REFERENCES public.people(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES public.people(id) ON DELETE SET NULL,
  updated_at  timestamptz
);
CREATE INDEX equipment_camp_idx ON public.equipment (camp_id);

-- ───────────────── Injury reports ─────────────────
-- Private between the player and the coaches.
CREATE TABLE public.injury_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id     uuid NOT NULL REFERENCES public.camps(id) ON DELETE CASCADE,
  person_id   uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  body_part   text NOT NULL CHECK (length(btrim(body_part)) BETWEEN 1 AND 60),
  severity    text NOT NULL CHECK (severity IN ('mild', 'moderate', 'severe')),
  notes       text NOT NULL CHECK (length(btrim(notes)) BETWEEN 1 AND 1000),
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'modified_training', 'cleared')),
  staff_notes text CHECK (length(staff_notes) <= 1000),
  created_by  uuid REFERENCES public.people(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES public.people(id) ON DELETE SET NULL,
  updated_at  timestamptz
);
CREATE INDEX injury_reports_camp_idx ON public.injury_reports (camp_id, person_id);

-- ───────────────── Player goals ─────────────────
CREATE TABLE public.player_goals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id        uuid NOT NULL REFERENCES public.camps(id) ON DELETE CASCADE,
  person_id      uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  title          text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  category       text NOT NULL CHECK (category IN ('technique', 'fitness', 'tactics', 'mental')),
  target_date    date,
  status         text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'achieved', 'needs_work')),
  coach_feedback text CHECK (length(coach_feedback) <= 1000),
  created_by     uuid REFERENCES public.people(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid REFERENCES public.people(id) ON DELETE SET NULL,
  updated_at     timestamptz
);
CREATE INDEX player_goals_camp_idx ON public.player_goals (camp_id, person_id);

-- ───────────────── Post-practice reflections ─────────────────
CREATE TABLE public.session_reflections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id      uuid NOT NULL REFERENCES public.camps(id) ON DELETE CASCADE,
  person_id    uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  session_id   uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  session_date date NOT NULL DEFAULT current_date,
  went_well    text NOT NULL CHECK (length(btrim(went_well)) BETWEEN 1 AND 1000),
  to_work_on   text NOT NULL CHECK (length(btrim(to_work_on)) BETWEEN 1 AND 1000),
  effort_rpe   integer NOT NULL CHECK (effort_rpe BETWEEN 1 AND 10),
  energy_level text NOT NULL CHECK (energy_level IN ('high', 'normal', 'low')),
  created_by   uuid REFERENCES public.people(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES public.people(id) ON DELETE SET NULL,
  updated_at   timestamptz
);
CREATE INDEX session_reflections_camp_idx ON public.session_reflections (camp_id, person_id);

-- ───────────────── Custom skills ─────────────────
-- Coaches add techniques to the built-in library; everyone reads them.
CREATE TABLE public.custom_skills (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id         uuid NOT NULL REFERENCES public.camps(id) ON DELETE CASCADE,
  title           text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  category        text NOT NULL CHECK (category IN ('footwork', 'net', 'attack', 'defence', 'serve_return', 'tactics', 'doubles')),
  difficulty      text NOT NULL CHECK (difficulty IN ('fundamental', 'intermediate', 'advanced')),
  description     text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 2000),
  key_cues        text[] NOT NULL DEFAULT '{}' CHECK (cardinality(key_cues) <= 20),
  common_mistakes text[] NOT NULL DEFAULT '{}' CHECK (cardinality(common_mistakes) <= 20),
  suggested_drill text NOT NULL DEFAULT '' CHECK (length(suggested_drill) <= 1000),
  created_by      uuid REFERENCES public.people(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES public.people(id) ON DELETE SET NULL,
  updated_at      timestamptz
);
CREATE INDEX custom_skills_camp_idx ON public.custom_skills (camp_id);

-- ───────────────── Venue & conditions plan ─────────────────
-- One per camp. Coaches and the admin set it; everyone sees it.
CREATE TABLE public.venue_plans (
  camp_id         uuid PRIMARY KEY REFERENCES public.camps(id) ON DELETE CASCADE,
  plan_type       text NOT NULL CHECK (plan_type IN ('indoor_regular', 'indoor_backup', 'outdoor_relocated', 'heat_warning')),
  venue_name      text NOT NULL CHECK (length(btrim(venue_name)) BETWEEN 1 AND 120),
  weather_summary text NOT NULL DEFAULT '' CHECK (length(weather_summary) <= 200),
  shuttle_speed   text NOT NULL CHECK (shuttle_speed IN ('76 (Slow)', '77 (Medium)', '78 (Fast)', 'Standard')),
  athlete_notice  text NOT NULL DEFAULT '' CHECK (length(athlete_notice) <= 1000),
  created_by      uuid REFERENCES public.people(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES public.people(id) ON DELETE SET NULL,
  updated_at      timestamptz
);

-- ───────────────── Live courts ─────────────────
-- What's on each court right now. A court with no row is open. Coaches and the admin assign
-- courts; everyone sees the board.
CREATE TABLE public.court_allocations (
  camp_id    uuid NOT NULL REFERENCES public.camps(id) ON DELETE CASCADE,
  court_num  integer NOT NULL CHECK (court_num BETWEEN 1 AND 8),
  status     text NOT NULL CHECK (status IN ('match', 'drill', 'warmup')),
  title      text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  subtitle   text CHECK (length(subtitle) <= 200),
  started_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.people(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.people(id) ON DELETE SET NULL,
  updated_at timestamptz,
  PRIMARY KEY (camp_id, court_num)
);

-- ───────────────── Next-session focus ─────────────────
-- One small, current focus per player. Set by the player or a coach.
CREATE TABLE public.next_session_focus (
  camp_id      uuid NOT NULL REFERENCES public.camps(id) ON DELETE CASCADE,
  person_id    uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  focus_text   text NOT NULL CHECK (length(btrim(focus_text)) BETWEEN 1 AND 300),
  source       text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'skill_library')),
  set_by       uuid REFERENCES public.people(id) ON DELETE SET NULL,
  set_at       timestamptz NOT NULL DEFAULT now(),
  completed    boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  PRIMARY KEY (camp_id, person_id)
);

-- Who set the focus is stamped (not taken from the client); a new focus starts not done.
CREATE FUNCTION public._focus_stamp() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_new_focus boolean := TG_OP = 'INSERT';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_new_focus := NEW.focus_text IS DISTINCT FROM OLD.focus_text OR NEW.source IS DISTINCT FROM OLD.source;
  END IF;
  IF v_new_focus THEN
    NEW.set_by := public.me();
    NEW.set_at := now();
    NEW.completed := false;
    NEW.completed_at := NULL;
  ELSE
    NEW.set_by := OLD.set_by;
    NEW.set_at := OLD.set_at;
    IF NOT NEW.completed THEN
      NEW.completed_at := NULL;
    ELSIF NOT OLD.completed THEN
      NEW.completed_at := now();
    ELSE
      NEW.completed_at := OLD.completed_at;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ───────────────── Triggers ─────────────────
-- _stamp (0001) sets created_by/created_at on insert and updated_by/updated_at on update.
CREATE TRIGGER announcements_stamp BEFORE INSERT OR UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public._stamp();
CREATE TRIGGER equipment_stamp BEFORE INSERT OR UPDATE ON public.equipment FOR EACH ROW EXECUTE FUNCTION public._stamp();
CREATE TRIGGER injury_reports_stamp BEFORE INSERT OR UPDATE ON public.injury_reports FOR EACH ROW EXECUTE FUNCTION public._stamp();
CREATE TRIGGER player_goals_stamp BEFORE INSERT OR UPDATE ON public.player_goals FOR EACH ROW EXECUTE FUNCTION public._stamp();
CREATE TRIGGER session_reflections_stamp BEFORE INSERT OR UPDATE ON public.session_reflections FOR EACH ROW EXECUTE FUNCTION public._stamp();
CREATE TRIGGER custom_skills_stamp BEFORE INSERT OR UPDATE ON public.custom_skills FOR EACH ROW EXECUTE FUNCTION public._stamp();
CREATE TRIGGER venue_plans_stamp BEFORE INSERT OR UPDATE ON public.venue_plans FOR EACH ROW EXECUTE FUNCTION public._stamp();
CREATE TRIGGER court_allocations_stamp BEFORE INSERT OR UPDATE ON public.court_allocations FOR EACH ROW EXECUTE FUNCTION public._stamp();
CREATE TRIGGER next_session_focus_stamp BEFORE INSERT OR UPDATE ON public.next_session_focus FOR EACH ROW EXECUTE FUNCTION public._focus_stamp();

CREATE TRIGGER announcements_keep BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public._keep_owner();
CREATE TRIGGER equipment_keep BEFORE UPDATE ON public.equipment FOR EACH ROW EXECUTE FUNCTION public._keep_owner();
CREATE TRIGGER injury_reports_keep BEFORE UPDATE ON public.injury_reports FOR EACH ROW EXECUTE FUNCTION public._keep_owner();
CREATE TRIGGER player_goals_keep BEFORE UPDATE ON public.player_goals FOR EACH ROW EXECUTE FUNCTION public._keep_owner();
CREATE TRIGGER session_reflections_keep BEFORE UPDATE ON public.session_reflections FOR EACH ROW EXECUTE FUNCTION public._keep_owner();
CREATE TRIGGER custom_skills_keep BEFORE UPDATE ON public.custom_skills FOR EACH ROW EXECUTE FUNCTION public._keep_owner();
CREATE TRIGGER venue_plans_keep BEFORE UPDATE ON public.venue_plans FOR EACH ROW EXECUTE FUNCTION public._keep_owner();
CREATE TRIGGER court_allocations_keep BEFORE UPDATE ON public.court_allocations FOR EACH ROW EXECUTE FUNCTION public._keep_owner();
CREATE TRIGGER next_session_focus_keep BEFORE UPDATE ON public.next_session_focus FOR EACH ROW EXECUTE FUNCTION public._keep_owner();

CREATE TRIGGER injury_reports_coach BEFORE INSERT OR UPDATE ON public.injury_reports FOR EACH ROW EXECUTE FUNCTION public._coach_fields();
CREATE TRIGGER player_goals_coach BEFORE INSERT OR UPDATE ON public.player_goals FOR EACH ROW EXECUTE FUNCTION public._coach_fields();

-- ───────────────── Row level security ─────────────────
ALTER TABLE public.announcements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.injury_reports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_goals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_skills       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_plans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.court_allocations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.next_session_focus  ENABLE ROW LEVEL SECURITY;

-- Camp-wide content: everyone who can see the camp reads it, coaches and the admin write it.
CREATE POLICY announcements_read ON public.announcements FOR SELECT TO authenticated USING (public.can_view_camp(camp_id));
CREATE POLICY announcements_insert ON public.announcements FOR INSERT TO authenticated WITH CHECK (public.is_camp_staff(camp_id));
CREATE POLICY announcements_update ON public.announcements FOR UPDATE TO authenticated
  USING (public.is_camp_staff(camp_id)) WITH CHECK (public.is_camp_staff(camp_id));
CREATE POLICY announcements_delete ON public.announcements FOR DELETE TO authenticated USING (public.is_camp_staff(camp_id));

CREATE POLICY equipment_read ON public.equipment FOR SELECT TO authenticated USING (public.can_view_camp(camp_id));
CREATE POLICY equipment_insert ON public.equipment FOR INSERT TO authenticated
  WITH CHECK (public.is_camp_staff(camp_id) AND (borrowed_by IS NULL OR public.in_camp(camp_id, borrowed_by)));
CREATE POLICY equipment_update ON public.equipment FOR UPDATE TO authenticated
  USING (public.is_camp_staff(camp_id))
  WITH CHECK (public.is_camp_staff(camp_id) AND (borrowed_by IS NULL OR public.in_camp(camp_id, borrowed_by)));
CREATE POLICY equipment_delete ON public.equipment FOR DELETE TO authenticated USING (public.is_camp_staff(camp_id));

CREATE POLICY custom_skills_read ON public.custom_skills FOR SELECT TO authenticated USING (public.can_view_camp(camp_id));
CREATE POLICY custom_skills_insert ON public.custom_skills FOR INSERT TO authenticated WITH CHECK (public.is_camp_staff(camp_id));
CREATE POLICY custom_skills_update ON public.custom_skills FOR UPDATE TO authenticated
  USING (public.is_camp_staff(camp_id)) WITH CHECK (public.is_camp_staff(camp_id));
CREATE POLICY custom_skills_delete ON public.custom_skills FOR DELETE TO authenticated USING (public.is_camp_staff(camp_id));

CREATE POLICY venue_plans_read ON public.venue_plans FOR SELECT TO authenticated USING (public.can_view_camp(camp_id));
CREATE POLICY venue_plans_insert ON public.venue_plans FOR INSERT TO authenticated WITH CHECK (public.is_camp_staff(camp_id));
CREATE POLICY venue_plans_update ON public.venue_plans FOR UPDATE TO authenticated
  USING (public.is_camp_staff(camp_id)) WITH CHECK (public.is_camp_staff(camp_id));
CREATE POLICY venue_plans_delete ON public.venue_plans FOR DELETE TO authenticated USING (public.is_camp_staff(camp_id));

CREATE POLICY court_allocations_read ON public.court_allocations FOR SELECT TO authenticated USING (public.can_view_camp(camp_id));
CREATE POLICY court_allocations_insert ON public.court_allocations FOR INSERT TO authenticated WITH CHECK (public.is_camp_staff(camp_id));
CREATE POLICY court_allocations_update ON public.court_allocations FOR UPDATE TO authenticated
  USING (public.is_camp_staff(camp_id)) WITH CHECK (public.is_camp_staff(camp_id));
CREATE POLICY court_allocations_delete ON public.court_allocations FOR DELETE TO authenticated USING (public.is_camp_staff(camp_id));

-- Read receipts: your own, or everyone's if you're staff.
CREATE POLICY announcement_reads_read ON public.announcement_reads FOR SELECT TO authenticated
  USING (person_id = public.me() OR public.is_camp_staff(public.announcement_camp(announcement_id)));
CREATE POLICY announcement_reads_insert ON public.announcement_reads FOR INSERT TO authenticated
  WITH CHECK (person_id = public.me() AND public.can_view_camp(public.announcement_camp(announcement_id)));
CREATE POLICY announcement_reads_delete ON public.announcement_reads FOR DELETE TO authenticated
  USING (person_id = public.me());

-- Personal rows: the person and the camp's coaches/admin.
CREATE POLICY injury_reports_read ON public.injury_reports FOR SELECT TO authenticated
  USING (public.can_read_personal(camp_id, person_id));
CREATE POLICY injury_reports_insert ON public.injury_reports FOR INSERT TO authenticated
  WITH CHECK (public.can_write_personal(camp_id, person_id));
CREATE POLICY injury_reports_update ON public.injury_reports FOR UPDATE TO authenticated
  USING (public.can_write_personal(camp_id, person_id)) WITH CHECK (public.can_write_personal(camp_id, person_id));
CREATE POLICY injury_reports_delete ON public.injury_reports FOR DELETE TO authenticated
  USING (public.can_write_personal(camp_id, person_id));

CREATE POLICY player_goals_read ON public.player_goals FOR SELECT TO authenticated
  USING (public.can_read_personal(camp_id, person_id));
CREATE POLICY player_goals_insert ON public.player_goals FOR INSERT TO authenticated
  WITH CHECK (public.can_write_personal(camp_id, person_id));
CREATE POLICY player_goals_update ON public.player_goals FOR UPDATE TO authenticated
  USING (public.can_write_personal(camp_id, person_id)) WITH CHECK (public.can_write_personal(camp_id, person_id));
CREATE POLICY player_goals_delete ON public.player_goals FOR DELETE TO authenticated
  USING (public.can_write_personal(camp_id, person_id));

CREATE POLICY session_reflections_read ON public.session_reflections FOR SELECT TO authenticated
  USING (public.can_read_personal(camp_id, person_id));
CREATE POLICY session_reflections_insert ON public.session_reflections FOR INSERT TO authenticated
  WITH CHECK (public.can_write_personal(camp_id, person_id)
              AND (session_id IS NULL OR public.session_camp(session_id) = camp_id));
CREATE POLICY session_reflections_update ON public.session_reflections FOR UPDATE TO authenticated
  USING (public.can_write_personal(camp_id, person_id))
  WITH CHECK (public.can_write_personal(camp_id, person_id)
              AND (session_id IS NULL OR public.session_camp(session_id) = camp_id));
CREATE POLICY session_reflections_delete ON public.session_reflections FOR DELETE TO authenticated
  USING (public.can_write_personal(camp_id, person_id));

CREATE POLICY next_session_focus_read ON public.next_session_focus FOR SELECT TO authenticated
  USING (public.can_read_personal(camp_id, person_id));
CREATE POLICY next_session_focus_insert ON public.next_session_focus FOR INSERT TO authenticated
  WITH CHECK (public.can_write_personal(camp_id, person_id));
CREATE POLICY next_session_focus_update ON public.next_session_focus FOR UPDATE TO authenticated
  USING (public.can_write_personal(camp_id, person_id)) WITH CHECK (public.can_write_personal(camp_id, person_id));
CREATE POLICY next_session_focus_delete ON public.next_session_focus FOR DELETE TO authenticated
  USING (public.can_write_personal(camp_id, person_id));

-- ───────────────── Grants ─────────────────
-- Supabase grants ALL on new objects to anon/authenticated by default; start from zero.
REVOKE ALL ON public.announcements, public.announcement_reads, public.equipment, public.injury_reports,
              public.player_goals, public.session_reflections, public.custom_skills, public.venue_plans,
              public.court_allocations, public.next_session_focus
  FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements, public.equipment, public.injury_reports,
                                       public.player_goals, public.session_reflections, public.custom_skills,
                                       public.venue_plans, public.court_allocations, public.next_session_focus
  TO authenticated;
GRANT SELECT, DELETE ON public.announcement_reads TO authenticated;
GRANT INSERT (announcement_id, person_id) ON public.announcement_reads TO authenticated;

REVOKE EXECUTE ON FUNCTION public._keep_owner(), public._coach_fields(), public._focus_stamp()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION
  public.ensure_session(uuid, date, text, text, integer), public.in_camp(uuid, uuid),
  public.can_read_personal(uuid, uuid), public.can_write_personal(uuid, uuid), public.announcement_camp(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.ensure_session(uuid, date, text, text, integer), public.in_camp(uuid, uuid),
  public.can_read_personal(uuid, uuid), public.can_write_personal(uuid, uuid), public.announcement_camp(uuid)
TO authenticated;

-- ───────────────── Realtime ─────────────────
-- Open phones refresh when a coach posts a notice, assigns a court, changes the venue plan or
-- sets a focus. Supabase applies the same row-level security to these change feeds.
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['announcements', 'venue_plans', 'court_allocations', 'next_session_focus',
                             'injury_reports', 'equipment', 'player_goals'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;
