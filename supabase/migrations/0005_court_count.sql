-- 0005: how many courts the camp plays on (1–8, default 4), so the live court board shows the
-- right number of courts. Coaches and the admin can change it from the board, e.g. when only
-- two courts are free today. Safe to run once in the Supabase SQL editor after 0001–0004.

ALTER TABLE public.camps
  ADD COLUMN court_count integer NOT NULL DEFAULT 4 CHECK (court_count BETWEEN 1 AND 8);

-- Staff (not only the admin) can set it. Courts above the new number are freed.
CREATE FUNCTION public.set_court_count(p_camp uuid, p_count integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_camp_staff(p_camp) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_count IS NULL OR p_count NOT BETWEEN 1 AND 8 THEN RAISE EXCEPTION 'invalid_court_count'; END IF;
  UPDATE public.camps SET court_count = p_count WHERE id = p_camp;
  DELETE FROM public.court_allocations WHERE camp_id = p_camp AND court_num > p_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.set_court_count(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_court_count(uuid, integer) TO authenticated;
