-- 0009: what each player is training for in a camp: singles, doubles, mixed (XD), or any mix.
-- Coaches and the camp admin set it on the player's profile; everyone who can see the camp's
-- roster can see it. The app hides the field until this has run. Safe to run once in the
-- Supabase SQL editor after 0008.

ALTER TABLE public.camp_members
  ADD COLUMN events text[] NOT NULL DEFAULT '{}'
  CONSTRAINT camp_members_events_valid CHECK (events <@ ARRAY['singles', 'doubles', 'mixed']::text[]);

-- Replaces the whole set. Stored without repeats, always in the order singles, doubles, mixed.
CREATE FUNCTION public.set_member_events(p_camp uuid, p_person uuid, p_events text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_camp_staff(p_camp) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF NOT (COALESCE(p_events, '{}') <@ ARRAY['singles', 'doubles', 'mixed']::text[]) THEN
    RAISE EXCEPTION 'invalid_event';
  END IF;
  UPDATE public.camp_members
     SET events = ARRAY(SELECT e FROM unnest(ARRAY['singles', 'doubles', 'mixed']) AS e
                         WHERE e = ANY (COALESCE(p_events, '{}')))
   WHERE camp_id = p_camp AND person_id = p_person;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_in_camp'; END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.set_member_events(uuid, uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_events(uuid, uuid, text[]) TO authenticated;
