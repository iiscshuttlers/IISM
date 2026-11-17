-- 0010: leave days, and the camp admin's shortlist weights.
--
-- Leave: a player tells the camp admin they'll be away (exams, illness, travel) and the admin
-- marks the days. Sessions on those days don't count against the player's attendance, and the
-- pairing helper leaves them out. The player and the camp's coaches/admin can read it; only the
-- camp admin can add, change or remove it.
--
-- Shortlist weights: how much each number counts in the admin's ranked shortlist. Admin only:
-- coaches and players can neither read nor change them.
--
-- Safe to run once in the Supabase SQL editor after 0009.

-- ───────────────── Leave ─────────────────
CREATE TABLE public.player_leave (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id    uuid NOT NULL REFERENCES public.camps(id) ON DELETE CASCADE,
  person_id  uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  starts_on  date NOT NULL,
  ends_on    date NOT NULL,
  reason     text NOT NULL DEFAULT 'exam' CHECK (reason IN ('exam', 'medical', 'personal', 'other')),
  note       text CHECK (length(note) <= 300),
  created_by uuid REFERENCES public.people(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.people(id) ON DELETE SET NULL,
  updated_at timestamptz,
  CONSTRAINT player_leave_dates CHECK (ends_on >= starts_on AND ends_on - starts_on <= 90)
);
CREATE INDEX player_leave_camp_idx ON public.player_leave (camp_id, person_id, starts_on);

-- _stamp (0001) records who added or last changed it; _keep_owner (0004) stops moving a row to
-- another camp or person.
CREATE TRIGGER player_leave_stamp BEFORE INSERT OR UPDATE ON public.player_leave
  FOR EACH ROW EXECUTE FUNCTION public._stamp();
CREATE TRIGGER player_leave_keep BEFORE UPDATE ON public.player_leave
  FOR EACH ROW EXECUTE FUNCTION public._keep_owner();

ALTER TABLE public.player_leave ENABLE ROW LEVEL SECURITY;
CREATE POLICY player_leave_read ON public.player_leave FOR SELECT TO authenticated
  USING (public.can_read_personal(camp_id, person_id));
CREATE POLICY player_leave_insert ON public.player_leave FOR INSERT TO authenticated
  WITH CHECK (public.is_camp_admin(camp_id) AND public.in_camp(camp_id, person_id));
CREATE POLICY player_leave_update ON public.player_leave FOR UPDATE TO authenticated
  USING (public.is_camp_admin(camp_id))
  WITH CHECK (public.is_camp_admin(camp_id) AND public.in_camp(camp_id, person_id));
CREATE POLICY player_leave_delete ON public.player_leave FOR DELETE TO authenticated
  USING (public.is_camp_admin(camp_id));

-- ───────────────── Shortlist weights ─────────────────
-- One row per camp. Each weight is 0–10; the app turns them into percentages.
CREATE TABLE public.shortlist_weights (
  camp_id     uuid PRIMARY KEY REFERENCES public.camps(id) ON DELETE CASCADE,
  rating      smallint NOT NULL DEFAULT 3 CHECK (rating BETWEEN 0 AND 10),
  coach_score smallint NOT NULL DEFAULT 3 CHECK (coach_score BETWEEN 0 AND 10),
  attendance  smallint NOT NULL DEFAULT 2 CHECK (attendance BETWEEN 0 AND 10),
  win_rate    smallint NOT NULL DEFAULT 2 CHECK (win_rate BETWEEN 0 AND 10),
  updated_by  uuid REFERENCES public.people(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shortlist_weights_some CHECK (rating + coach_score + attendance + win_rate > 0)
);

CREATE FUNCTION public._weights_stamp() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.camp_id IS DISTINCT FROM OLD.camp_id THEN
    RAISE EXCEPTION 'immutable_camp';
  END IF;
  NEW.updated_by := public.me();
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER shortlist_weights_stamp BEFORE INSERT OR UPDATE ON public.shortlist_weights
  FOR EACH ROW EXECUTE FUNCTION public._weights_stamp();

ALTER TABLE public.shortlist_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY shortlist_weights_read ON public.shortlist_weights FOR SELECT TO authenticated
  USING (public.is_camp_admin(camp_id));
CREATE POLICY shortlist_weights_insert ON public.shortlist_weights FOR INSERT TO authenticated
  WITH CHECK (public.is_camp_admin(camp_id));
CREATE POLICY shortlist_weights_update ON public.shortlist_weights FOR UPDATE TO authenticated
  USING (public.is_camp_admin(camp_id)) WITH CHECK (public.is_camp_admin(camp_id));

-- ───────────────── Grants ─────────────────
-- Supabase grants ALL on new objects to anon/authenticated by default; start from zero.
REVOKE ALL ON public.player_leave, public.shortlist_weights FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_leave TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.shortlist_weights TO authenticated;
REVOKE EXECUTE ON FUNCTION public._weights_stamp() FROM PUBLIC, anon, authenticated;

-- ───────────────── Realtime ─────────────────
-- Open phones refresh when the admin marks or removes leave. Row-level security applies.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'player_leave') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.player_leave;
  END IF;
END $$;
