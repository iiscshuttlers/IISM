\set ON_ERROR_STOP on
-- Test-only auth shims (the hosted project provides real ones).
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('email', current_setting('request.jwt.claim.email', true),
                            'sub', current_setting('request.jwt.claim.sub', true)) $$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
-- Minimal stand-in for Supabase's auth.users (the hosted project has the real table).
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  email_confirmed_at timestamptz
);
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
