-- A login may claim an admin-created profile only if its email address is confirmed.
--
-- Profiles are matched by email. Google sign-ins are always confirmed, but email + password
-- sign-ups are confirmed only by Supabase's "Confirm email" setting. Without this check, turning
-- that setting off would let anyone sign up with a roster member's (or the site admin's) email
-- and take over that profile.

CREATE OR REPLACE FUNCTION public.claim_my_profile() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_email text;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
  v_id := public.me();
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  -- Read the email from auth.users (not the JWT) and require it to be confirmed.
  SELECT lower(NULLIF(btrim(u.email), '')) INTO v_email
    FROM auth.users u
   WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN RETURN NULL; END IF;

  UPDATE public.people SET auth_user_id = auth.uid()
   WHERE email = v_email AND auth_user_id IS NULL
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.claim_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_my_profile() TO authenticated;
