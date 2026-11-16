-- 0008: "Send a test alert" (Me → Phone alerts). A member sends one alert to their own phones to
-- check that alerts work end to end, through the same path as real alerts (pg_net → send-push).
-- Only ever to the person who asks, at most once every 30 seconds. Mutes and the camp switch don't
-- apply: the person asked for it. Safe to run once in the Supabase SQL editor after 0007.

-- When each person last sent a test (for the 30-second limit). Only send_test_push touches it.
CREATE TABLE public.push_tests (
  person_id uuid PRIMARY KEY REFERENCES public.people(id) ON DELETE CASCADE,
  sent_at   timestamptz NOT NULL
);
ALTER TABLE public.push_tests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_tests FROM anon, authenticated;

-- Returns what happened, for the app to explain:
--   'queued'          sent to the function; it should arrive within seconds
--   'no_phone'        this person has no phone with alerts on
--   'not_configured'  the function URL or secret isn't in Vault, or pg_net/Vault is missing
--   'too_soon'        a test went out less than 30 seconds ago
CREATE FUNCTION public.send_test_push() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_me     uuid := public.me();
  v_camp   uuid;
  v_url    text;
  v_secret text;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_signed_in' USING ERRCODE = '42501'; END IF;

  SELECT camp_id INTO v_camp FROM public.push_subscriptions
   WHERE person_id = v_me ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN 'no_phone'; END IF;

  IF to_regclass('vault.decrypted_secrets') IS NULL
     OR to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN
    RETURN 'not_configured';
  END IF;
  SELECT max(decrypted_secret) FILTER (WHERE name = 'push_function_url'),
         max(decrypted_secret) FILTER (WHERE name = 'push_webhook_secret')
    INTO v_url, v_secret
    FROM vault.decrypted_secrets
   WHERE name IN ('push_function_url', 'push_webhook_secret');
  IF v_url IS NULL OR v_secret IS NULL THEN RETURN 'not_configured'; END IF;

  -- One test at a time per person, and not more often than every 30 seconds.
  PERFORM pg_advisory_xact_lock(hashtextextended('push-test:' || v_me::text, 0));
  IF EXISTS (SELECT 1 FROM public.push_tests WHERE person_id = v_me AND sent_at > now() - interval '30 seconds') THEN
    RETURN 'too_soon';
  END IF;
  INSERT INTO public.push_tests (person_id, sent_at) VALUES (v_me, now())
    ON CONFLICT (person_id) DO UPDATE SET sent_at = EXCLUDED.sent_at;

  PERFORM net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'camp_id', v_camp,
      'recipients', jsonb_build_array(v_me),
      'title', 'Test alert',
      'body', 'Phone alerts are working on this phone.',
      'url', '/me',
      'tag', 'test-' || v_me,
      'urgency', 'normal',
      'ttl', 600),
    params := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 10000);
  RETURN 'queued';
END $$;

REVOKE EXECUTE ON FUNCTION public.send_test_push() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_test_push() TO authenticated;
