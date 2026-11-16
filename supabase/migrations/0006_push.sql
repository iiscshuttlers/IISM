-- 0006: phone alerts (Web Push). A camp member can turn on alerts for a phone; the database then
-- asks the send-push Edge Function to deliver one when
--   * a match they played is recorded, edited, disputed or resolved (the existing activity rows),
--   * a coach posts an announcement, or
--   * the squad is published to players.
-- The camp-wide activity switch and each person's activity mute apply to all three.
-- Safe to run once in the Supabase SQL editor after 0001–0004. Nothing is sent until the
-- function URL and shared secret are stored in Vault (see README, "Phone alerts").

-- ───────────────── Extensions ─────────────────
-- pg_net makes the HTTP call after the write commits; Vault holds the function URL and secret.
-- Both ship with Supabase. If either can't be enabled, alerts simply stay off.
DO $$
BEGIN
  CREATE SCHEMA IF NOT EXISTS extensions;
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_net is not available (%); phone alerts stay off until it is enabled', SQLERRM;
END $$;
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS supabase_vault;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Vault is not available (%); phone alerts stay off until it is enabled', SQLERRM;
END $$;

-- ───────────────── Subscriptions ─────────────────
-- One row per phone (browser push endpoint). Alerts go to the person, whichever of their camps
-- the event is in; camp_id records the camp they turned alerts on from.
CREATE TABLE public.push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id  uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  camp_id    uuid NOT NULL REFERENCES public.camps(id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE CHECK (endpoint ~ '^https://[^/[:space:]]+/' AND length(endpoint) <= 2048),
  p256dh     text NOT NULL CHECK (p256dh ~ '^[A-Za-z0-9_=-]{80,100}$'),
  auth       text NOT NULL CHECK (auth ~ '^[A-Za-z0-9_=-]{16,32}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_subscriptions_person_idx ON public.push_subscriptions (person_id);

-- At most 10 phones per person, and the server sets created_at.
CREATE FUNCTION public._push_subscription_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('push:' || NEW.person_id::text, 0));
  IF (SELECT count(*) FROM public.push_subscriptions
       WHERE person_id = NEW.person_id AND endpoint <> NEW.endpoint) >= 10 THEN
    RAISE EXCEPTION 'too_many_devices';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER push_subscriptions_guard BEFORE INSERT ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public._push_subscription_guard();

-- ───────────────── What to send, and to whom ─────────────────
-- Builds the alert for a new activity row, a new announcement, or a camps update that makes the
-- squad visible to players. Returns NULL when nobody should get one. Recipients follow the same
-- rules as the app: the camp-wide switch and personal mutes, announcements only to people who
-- can see the camp (and not to their author), the squad only to players who can see the camp.
CREATE FUNCTION public._push_message(p_table text, p_new jsonb, p_old jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c public.camps;
  v_to uuid[];
  v_msg jsonb;
BEGIN
  SELECT * INTO c FROM public.camps
   WHERE id = (CASE WHEN p_table = 'camps' THEN p_new->>'id' ELSE p_new->>'camp_id' END)::uuid;
  IF NOT FOUND OR NOT c.activity_enabled THEN RETURN NULL; END IF;

  IF p_table = 'activity' THEN
    SELECT array_agg(person_id) INTO v_to FROM public.camp_members
     WHERE camp_id = c.id AND person_id = (p_new->>'recipient_id')::uuid AND NOT activity_muted;
    v_msg := jsonb_build_object(
      'title', CASE p_new->>'kind'
                 WHEN 'match_recorded' THEN 'Match recorded'
                 WHEN 'match_edited' THEN 'Match edited'
                 WHEN 'match_disputed' THEN 'Match disputed'
                 WHEN 'match_resolved' THEN 'Match result settled'
                 ELSE c.name END,
      'body', p_new->>'message',
      'url', CASE WHEN p_new->>'match_id' IS NOT NULL THEN '/matches?match=' || (p_new->>'match_id')
                  ELSE '/activity' END,
      'tag', COALESCE('match-' || (p_new->>'match_id'), 'activity-' || (p_new->>'id')),
      'urgency', CASE WHEN p_new->>'kind' = 'match_disputed' THEN 'high' ELSE 'normal' END,
      'ttl', 86400);

  ELSIF p_table = 'announcements' THEN
    IF (p_new->>'expires_on')::date < current_date THEN RETURN NULL; END IF;
    SELECT array_agg(person_id ORDER BY person_id) INTO v_to FROM public.camp_members
     WHERE camp_id = c.id AND NOT activity_muted
       AND person_id IS DISTINCT FROM (p_new->>'created_by')::uuid
       AND (role IN ('admin', 'coach') OR c.visibility = 'members');
    v_msg := jsonb_build_object(
      'title', CASE WHEN p_new->>'priority' = 'urgent' THEN 'Urgent: ' ELSE '' END || (p_new->>'title'),
      'body', left(p_new->>'message', 300),
      'url', '/',
      'tag', 'announcement-' || (p_new->>'id'),
      'urgency', CASE WHEN p_new->>'priority' IN ('important', 'urgent') THEN 'high' ELSE 'normal' END,
      'ttl', 259200);

  ELSIF p_table = 'camps' THEN
    -- Players can see the squad once it is both locked and published, in whichever order.
    IF NOT ((p_new->>'publish_selection')::boolean AND p_new->>'selection_locked_at' IS NOT NULL)
       OR COALESCE((p_old->>'publish_selection')::boolean AND p_old->>'selection_locked_at' IS NOT NULL, false)
       OR c.visibility <> 'members' THEN
      RETURN NULL;
    END IF;
    SELECT array_agg(person_id ORDER BY person_id) INTO v_to FROM public.camp_members
     WHERE camp_id = c.id AND role = 'player' AND NOT activity_muted;
    v_msg := jsonb_build_object(
      'title', 'The squad is out',
      'body', c.name || ': see who made the squad.',
      'url', '/squad',
      'tag', 'squad-' || c.id,
      'urgency', 'high',
      'ttl', 259200);

  ELSE
    RETURN NULL;
  END IF;

  IF v_to IS NULL THEN RETURN NULL; END IF;
  RETURN v_msg || jsonb_build_object('camp_id', c.id, 'recipients', to_jsonb(v_to));
END $$;

-- Queues the HTTP call to the Edge Function. Skipped when no recipient has alerts on, or when the
-- function URL and secret aren't in Vault yet. A failure here never blocks the write itself.
CREATE FUNCTION public._push_dispatch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_msg jsonb;
  v_url text;
  v_secret text;
BEGIN
  BEGIN
    v_msg := public._push_message(TG_TABLE_NAME, to_jsonb(NEW),
                                  CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END);
    IF v_msg IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.push_subscriptions
                       WHERE person_id IN (SELECT jsonb_array_elements_text(v_msg->'recipients')::uuid))
       OR to_regclass('vault.decrypted_secrets') IS NULL
       OR to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN
      RETURN NULL;
    END IF;
    SELECT max(decrypted_secret) FILTER (WHERE name = 'push_function_url'),
           max(decrypted_secret) FILTER (WHERE name = 'push_webhook_secret')
      INTO v_url, v_secret
      FROM vault.decrypted_secrets
     WHERE name IN ('push_function_url', 'push_webhook_secret');
    IF v_url IS NULL OR v_secret IS NULL THEN RETURN NULL; END IF;
    PERFORM net.http_post(
      url := v_url,
      body := v_msg,
      params := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      timeout_milliseconds := 10000);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'phone alert not queued: %', SQLERRM;
  END;
  RETURN NULL;
END $$;

CREATE TRIGGER activity_push AFTER INSERT ON public.activity
  FOR EACH ROW EXECUTE FUNCTION public._push_dispatch();
CREATE TRIGGER announcements_push AFTER INSERT ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public._push_dispatch();
CREATE TRIGGER camps_push AFTER UPDATE OF publish_selection, selection_locked_at ON public.camps
  FOR EACH ROW
  WHEN (NEW.publish_selection AND NEW.selection_locked_at IS NOT NULL
        AND NOT (OLD.publish_selection AND OLD.selection_locked_at IS NOT NULL))
  EXECUTE FUNCTION public._push_dispatch();

-- ───────────────── Row level security ─────────────────
-- Everyone manages only their own phones, and only for a camp they belong to.
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_read ON public.push_subscriptions FOR SELECT TO authenticated
  USING (person_id = public.me());
CREATE POLICY push_subscriptions_insert ON public.push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (person_id = public.me() AND public.is_camp_member(camp_id));
CREATE POLICY push_subscriptions_update ON public.push_subscriptions FOR UPDATE TO authenticated
  USING (person_id = public.me())
  WITH CHECK (person_id = public.me() AND public.is_camp_member(camp_id));
CREATE POLICY push_subscriptions_delete ON public.push_subscriptions FOR DELETE TO authenticated
  USING (person_id = public.me());

-- ───────────────── Grants ─────────────────
-- Supabase grants ALL on new objects to anon/authenticated by default; start from zero.
REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;
GRANT SELECT, DELETE ON public.push_subscriptions TO authenticated;
-- Saving re-uses the row for a phone that is already registered (upsert on endpoint).
GRANT INSERT (person_id, camp_id, endpoint, p256dh, auth),
      UPDATE (person_id, camp_id, endpoint, p256dh, auth)
  ON public.push_subscriptions TO authenticated;

REVOKE EXECUTE ON FUNCTION public._push_subscription_guard(), public._push_dispatch(),
                           public._push_message(text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
