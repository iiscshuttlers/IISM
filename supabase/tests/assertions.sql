\set ON_ERROR_STOP on
-- Training camp assertions. Run after bootstrap.sql and migrations/0001_camp.sql on a
-- throwaway database. Executes as the real anon / authenticated roles.

CREATE OR REPLACE FUNCTION pg_temp.as_user(p_sub text, p_email text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_sub, ''), false);
  PERFORM set_config('request.jwt.claim.email', coalesce(p_email, ''), false);
  EXECUTE format('SET ROLE %I', CASE WHEN p_sub IS NULL THEN 'anon' ELSE 'authenticated' END);
END $$;

-- Auth ids
\set u_admin  '''aaaaaaaa-0000-0000-0000-000000000001'''
\set u_coach  '''aaaaaaaa-0000-0000-0000-000000000002'''
\set u_p1     '''aaaaaaaa-0000-0000-0000-000000000011'''
\set u_p2     '''aaaaaaaa-0000-0000-0000-000000000012'''
\set u_p3     '''aaaaaaaa-0000-0000-0000-000000000013'''
\set u_p4     '''aaaaaaaa-0000-0000-0000-000000000014'''
\set u_out    '''aaaaaaaa-0000-0000-0000-000000000099'''

-- Site admin is bootstrapped from the SQL editor (postgres), then claims by Google email.
SELECT public.bootstrap_site_admin('Admin@X.test', 'Admin') IS NOT NULL AS bootstrapped;
DO $$ BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.bootstrap_site_admin('evil@x.test', 'Evil');
    RAISE EXCEPTION 'authenticated called bootstrap_site_admin';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- Confirmed logins (Google sign-ins are always confirmed).
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@x.test', now()),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'coach@x.test', now()),
  ('aaaaaaaa-0000-0000-0000-000000000011', 'p1@x.test', now()),
  ('aaaaaaaa-0000-0000-0000-000000000012', 'p2@x.test', now()),
  ('aaaaaaaa-0000-0000-0000-000000000013', 'p3@x.test', now()),
  ('aaaaaaaa-0000-0000-0000-000000000014', 'p4@x.test', now()),
  ('aaaaaaaa-0000-0000-0000-000000000099', 'out@x.test', now());

CREATE TEMP TABLE ids (k text PRIMARY KEY, v uuid);
GRANT ALL ON ids TO anon, authenticated;

SELECT pg_temp.as_user(:u_admin, 'admin@x.test');
INSERT INTO ids SELECT 'admin', public.claim_my_profile();
INSERT INTO ids SELECT 'camp', public.create_camp('Selection Camp Nov 2026', '2026-11-16', '2026-12-16', 2);
INSERT INTO ids SELECT 'coach', public.add_camp_person((SELECT v FROM ids WHERE k='camp'), 'Coach', 'M', 'coach@x.test', 'coach');
INSERT INTO ids SELECT 'p1', public.add_camp_person((SELECT v FROM ids WHERE k='camp'), 'Arjun', 'M', 'p1@x.test', 'player');
INSERT INTO ids SELECT 'p2', public.add_camp_person((SELECT v FROM ids WHERE k='camp'), 'Bharat', 'M', 'P2@x.test ', 'player');
INSERT INTO ids SELECT 'p3', public.add_camp_person((SELECT v FROM ids WHERE k='camp'), 'Chitra', 'F', 'p3@x.test', 'player');
INSERT INTO ids SELECT 'p4', public.add_camp_person((SELECT v FROM ids WHERE k='camp'), 'Divya', 'F', 'p4@x.test', 'player');
-- Admin-created profile with no email: never signs in, still plays.
INSERT INTO ids SELECT 'p5', public.add_camp_person((SELECT v FROM ids WHERE k='camp'), 'Eshan', 'M', NULL, 'player');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.get_roster_admin((SELECT v FROM ids WHERE k='camp'))) <> 7 THEN
    RAISE EXCEPTION 'roster size wrong';
  END IF;
END $$;

-- 0. Claiming needs a CONFIRMED email from auth.users; the JWT email claim is not trusted.
INSERT INTO ids SELECT 'late', public.add_camp_person((SELECT v FROM ids WHERE k='camp'), 'Late Joiner', 'M', 'late@x.test', 'player');
RESET ROLE;
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000077', 'late@x.test', NULL),        -- signed up, not confirmed
  ('aaaaaaaa-0000-0000-0000-000000000078', 'mallory@x.test', now());    -- confirmed, different email
SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000077', 'late@x.test');
DO $$ BEGIN
  IF public.claim_my_profile() IS NOT NULL THEN RAISE EXCEPTION 'unconfirmed sign-up claimed a profile'; END IF;
END $$;
-- Forged JWT email: Mallory's token claims to be p1, whose profile is still unclaimed.
SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000078', 'p1@x.test');
DO $$ BEGIN
  IF public.claim_my_profile() IS NOT NULL THEN RAISE EXCEPTION 'JWT email was trusted for claiming'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.people WHERE email IN ('late@x.test', 'p1@x.test')
             AND auth_user_id IN ('aaaaaaaa-0000-0000-0000-000000000077', 'aaaaaaaa-0000-0000-0000-000000000078')) THEN
    RAISE EXCEPTION 'profile linked to an unproven login';
  END IF;
END $$;
UPDATE auth.users SET email_confirmed_at = now() WHERE id = 'aaaaaaaa-0000-0000-0000-000000000077';
SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000077', 'late@x.test');
DO $$ BEGIN
  IF public.claim_my_profile() IS DISTINCT FROM (SELECT v FROM ids WHERE k='late') THEN
    RAISE EXCEPTION 'confirmed sign-up could not claim';
  END IF;
END $$;
-- Remove the extra player so later roster counts stay as designed.
SELECT pg_temp.as_user(:u_admin, 'admin@x.test');
SELECT public.remove_camp_member((SELECT v FROM ids WHERE k='camp'), (SELECT v FROM ids WHERE k='late'));

SELECT pg_temp.as_user(:u_coach, 'coach@x.test'); SELECT public.claim_my_profile() IS NOT NULL AS coach_claimed;
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');       SELECT public.claim_my_profile() IS NOT NULL AS p1_claimed;
SELECT pg_temp.as_user(:u_p2, 'p2@x.test');       SELECT public.claim_my_profile() IS NOT NULL AS p2_claimed;
SELECT pg_temp.as_user(:u_p3, 'p3@x.test');       SELECT public.claim_my_profile() IS NOT NULL AS p3_claimed;
SELECT pg_temp.as_user(:u_p4, 'p4@x.test');       SELECT public.claim_my_profile() IS NOT NULL AS p4_claimed;

-- 1. Anonymous: nothing.
SELECT pg_temp.as_user(NULL, NULL);
DO $$ BEGIN
  BEGIN PERFORM 1 FROM public.camps; RAISE EXCEPTION 'anon read camps';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.get_standings((SELECT v FROM ids WHERE k='camp')); RAISE EXCEPTION 'anon standings';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- 2. Signed-in outsider: no profile, sees nothing, cannot record.
SELECT pg_temp.as_user(:u_out, 'out@x.test');
DO $$ BEGIN
  IF public.claim_my_profile() IS NOT NULL THEN RAISE EXCEPTION 'outsider claimed a profile'; END IF;
  IF EXISTS (SELECT 1 FROM public.camps) THEN RAISE EXCEPTION 'outsider sees camp'; END IF;
  IF EXISTS (SELECT 1 FROM public.people) THEN RAISE EXCEPTION 'outsider sees people'; END IF;
  BEGIN
    PERFORM public.record_match((SELECT v FROM ids WHERE k='camp'), NULL, 'MS',
      (SELECT v FROM ids WHERE k='p1'), NULL, (SELECT v FROM ids WHERE k='p2'), NULL, NULL, 1::smallint);
    RAISE EXCEPTION 'outsider recorded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- 3. Players: direct table writes on matches are refused; emails hidden.
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');
DO $$ BEGIN
  BEGIN
    INSERT INTO public.matches (camp_id, category, t1_p1, t2_p1, winner_side, recorded_by)
    VALUES ((SELECT v FROM ids WHERE k='camp'), 'MS', (SELECT v FROM ids WHERE k='p1'),
            (SELECT v FROM ids WHERE k='p2'), 1, (SELECT v FROM ids WHERE k='p2'));
    RAISE EXCEPTION 'direct match insert allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.matches SET status = 'confirmed'; RAISE EXCEPTION 'direct match update allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.matches; RAISE EXCEPTION 'direct match delete allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM email FROM public.people; RAISE EXCEPTION 'player read emails';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.get_roster_admin((SELECT v FROM ids WHERE k='camp')); RAISE EXCEPTION 'player read admin roster';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.add_camp_person((SELECT v FROM ids WHERE k='camp'), 'X', 'M', NULL, 'player');
    RAISE EXCEPTION 'player added a person';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT count(*) FROM public.people) <> 7 THEN RAISE EXCEPTION 'player cannot see roster names'; END IF;
END $$;

-- 4. Recording: scored singles + winner-only mixed; invalid inputs rejected.
INSERT INTO ids SELECT 'm1', public.record_match((SELECT v FROM ids WHERE k='camp'), '2026-11-16', 'MS',
  (SELECT v FROM ids WHERE k='p1'), NULL, (SELECT v FROM ids WHERE k='p2'), NULL, ARRAY['21-15','21-18'], 1::smallint);
INSERT INTO ids SELECT 'm2', public.record_match((SELECT v FROM ids WHERE k='camp'), '2026-11-17', 'XD',
  (SELECT v FROM ids WHERE k='p1'), (SELECT v FROM ids WHERE k='p3'),
  (SELECT v FROM ids WHERE k='p2'), (SELECT v FROM ids WHERE k='p4'), NULL, 2::smallint);
DO $$
DECLARE c uuid := (SELECT v FROM ids WHERE k='camp');
        p1 uuid := (SELECT v FROM ids WHERE k='p1'); p2 uuid := (SELECT v FROM ids WHERE k='p2');
        p3 uuid := (SELECT v FROM ids WHERE k='p3'); coach uuid := (SELECT v FROM ids WHERE k='coach');
BEGIN
  BEGIN PERFORM public.record_match(c, NULL, 'MS', p1, NULL, p3, NULL, NULL, 1::smallint);
    RAISE EXCEPTION 'MS with a woman accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'category_gender_mismatch' THEN RAISE; END IF; END;
  BEGIN PERFORM public.record_match(c, NULL, 'MS', p1, NULL, p2, NULL, ARRAY['15-21','10-21'], 1::smallint);
    RAISE EXCEPTION 'winner/games mismatch accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'winner_does_not_match_games' THEN RAISE; END IF; END;
  BEGIN PERFORM public.record_match(c, NULL, 'MS', p1, NULL, p1, NULL, NULL, 1::smallint);
    RAISE EXCEPTION 'duplicate player accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'duplicate_player' THEN RAISE; END IF; END;
  BEGIN PERFORM public.record_match(c, NULL, 'MS', p1, NULL, coach, NULL, NULL, 1::smallint);
    RAISE EXCEPTION 'coach as player accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'player_not_in_camp' THEN RAISE; END IF; END;
  BEGIN PERFORM public.record_match(c, NULL, 'MS', p1, NULL, p2, NULL, ARRAY['21-21'], 1::smallint);
    RAISE EXCEPTION 'tied game accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'invalid_games' THEN RAISE; END IF; END;
  BEGIN PERFORM public.record_match(c, NULL, 'MD', p1, NULL, p2, NULL, NULL, 1::smallint);
    RAISE EXCEPTION 'doubles without partners accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'doubles_needs_partners' THEN RAISE; END IF; END;
END $$;

-- 5. Activity: participants notified, recorder not; mutes respected.
SELECT pg_temp.as_user(:u_p2, 'p2@x.test');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.activity WHERE kind = 'match_recorded') <> 2 THEN RAISE EXCEPTION 'p2 activity count'; END IF;
END $$;
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.activity) THEN RAISE EXCEPTION 'recorder notified about own match'; END IF;
  BEGIN PERFORM public.set_activity_muted((SELECT v FROM ids WHERE k='camp'), (SELECT v FROM ids WHERE k='p2'), true);
    RAISE EXCEPTION 'player muted someone else';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM public.set_activity_muted((SELECT v FROM ids WHERE k='camp'), (SELECT v FROM ids WHERE k='p1'), false);
END $$;

-- 6. Standings maths (before any other matches).
--    m1: equal 1200s, P1 wins -> +16/-16.  m2: (1216+1200)/2 vs (1184+1200)/2, side 2 wins -> 17.
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.get_standings((SELECT v FROM ids WHERE k='camp')) WHERE person_id = (SELECT v FROM ids WHERE k='p1');
  IF r.rating <> 1199 OR r.played <> 2 OR r.won <> 1 OR r.lost <> 1 OR r.points_for <> 42
     OR r.points_against <> 33 OR r.form <> 'LW' THEN
    RAISE EXCEPTION 'p1 standings wrong: %', row_to_json(r);
  END IF;
  IF (r.by_category->'MS'->>'w')::int <> 1 OR (r.by_category->'XD'->>'l')::int <> 1 THEN
    RAISE EXCEPTION 'p1 categories wrong: %', r.by_category;
  END IF;
  IF (SELECT rating FROM public.get_standings((SELECT v FROM ids WHERE k='camp'))
       WHERE person_id = (SELECT v FROM ids WHERE k='p4')) <> 1217 THEN RAISE EXCEPTION 'p4 rating wrong'; END IF;
  IF (SELECT rating FROM public.get_standings((SELECT v FROM ids WHERE k='camp'))
       WHERE person_id = (SELECT v FROM ids WHERE k='p5')) <> 1200 THEN RAISE EXCEPTION 'p5 should be 1200'; END IF;
  IF (SELECT count(*) FROM public.get_standings((SELECT v FROM ids WHERE k='camp'))) <> 5 THEN
    RAISE EXCEPTION 'standings should list all 5 players';
  END IF;
END $$;

-- 7. Admin mutes P4; a new match notifies P2 but not P4.
SELECT pg_temp.as_user(:u_admin, 'admin@x.test');
SELECT public.set_activity_muted((SELECT v FROM ids WHERE k='camp'), (SELECT v FROM ids WHERE k='p4'), true);
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');
INSERT INTO ids SELECT 'm3', public.record_match((SELECT v FROM ids WHERE k='camp'), '2026-11-18', 'XD',
  (SELECT v FROM ids WHERE k='p1'), (SELECT v FROM ids WHERE k='p3'),
  (SELECT v FROM ids WHERE k='p2'), (SELECT v FROM ids WHERE k='p4'), ARRAY['21-19','18-21','21-17'], 1::smallint);
SELECT pg_temp.as_user(:u_p4, 'p4@x.test');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.activity WHERE match_id = (SELECT v FROM ids WHERE k='m3')) THEN
    RAISE EXCEPTION 'muted member was notified';
  END IF;
END $$;
-- Camp-wide switch off: nobody notified.
SELECT pg_temp.as_user(:u_admin, 'admin@x.test');
UPDATE public.camps SET activity_enabled = false WHERE id = (SELECT v FROM ids WHERE k='camp');
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');
INSERT INTO ids SELECT 'm4', public.record_match((SELECT v FROM ids WHERE k='camp'), '2026-11-18', 'MS',
  (SELECT v FROM ids WHERE k='p1'), NULL, (SELECT v FROM ids WHERE k='p5'), NULL, NULL, 2::smallint);
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.activity WHERE match_id = (SELECT v FROM ids WHERE k='m4')) THEN
    RAISE EXCEPTION 'activity written while camp switch off';
  END IF;
END $$;
UPDATE public.camps SET activity_enabled = true;

-- 8. Edit window and dispute workflow.
SELECT pg_temp.as_user(:u_p2, 'p2@x.test');
DO $$ BEGIN
  BEGIN PERFORM public.edit_match((SELECT v FROM ids WHERE k='m1'), NULL, 'MS',
      (SELECT v FROM ids WHERE k='p1'), NULL, (SELECT v FROM ids WHERE k='p2'), NULL, NULL, 2::smallint);
    RAISE EXCEPTION 'non-recorder edited';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.resolve_match((SELECT v FROM ids WHERE k='m1'), 'void', NULL, NULL);
    RAISE EXCEPTION 'player resolved';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT pg_temp.as_user(:u_p3, 'p3@x.test');
DO $$ BEGIN
  BEGIN PERFORM public.dispute_match((SELECT v FROM ids WHERE k='m1'), 'wrong');
    RAISE EXCEPTION 'non-participant disputed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT pg_temp.as_user(:u_p2, 'p2@x.test');
SELECT public.dispute_match((SELECT v FROM ids WHERE k='m1'), 'Score was 21-19 in game two');
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');
DO $$ BEGIN
  IF (SELECT status FROM public.matches WHERE id = (SELECT v FROM ids WHERE k='m1')) <> 'disputed' THEN
    RAISE EXCEPTION 'dispute not recorded';
  END IF;
  BEGIN PERFORM public.edit_match((SELECT v FROM ids WHERE k='m1'), NULL, 'MS',
      (SELECT v FROM ids WHERE k='p1'), NULL, (SELECT v FROM ids WHERE k='p2'), NULL, NULL, 1::smallint);
    RAISE EXCEPTION 'recorder edited a disputed match';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.dispute_match((SELECT v FROM ids WHERE k='m1'), 'again');
    RAISE EXCEPTION 'double dispute';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'not_disputable' THEN RAISE; END IF; END;
  -- Disputed matches drop out of standings.
  IF (SELECT played FROM public.get_standings((SELECT v FROM ids WHERE k='camp'))
       WHERE person_id = (SELECT v FROM ids WHERE k='p1')) <> 3 THEN RAISE EXCEPTION 'disputed match still counted'; END IF;
END $$;
SELECT pg_temp.as_user(:u_coach, 'coach@x.test');
SELECT public.resolve_match((SELECT v FROM ids WHERE k='m1'), 'confirmed', ARRAY['21-15','21-19'], 1::smallint);
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');
-- Recorder edit within 24 h works and is stamped server-side.
SELECT public.edit_match((SELECT v FROM ids WHERE k='m2'), NULL, 'XD',
  (SELECT v FROM ids WHERE k='p1'), (SELECT v FROM ids WHERE k='p3'),
  (SELECT v FROM ids WHERE k='p2'), (SELECT v FROM ids WHERE k='p4'), ARRAY['15-21','19-21'], 2::smallint);
RESET ROLE;
UPDATE public.matches SET created_at = now() - interval '25 hours' WHERE id = (SELECT v FROM ids WHERE k='m3');
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');
DO $$ BEGIN
  BEGIN PERFORM public.edit_match((SELECT v FROM ids WHERE k='m3'), NULL, 'XD',
      (SELECT v FROM ids WHERE k='p1'), (SELECT v FROM ids WHERE k='p3'),
      (SELECT v FROM ids WHERE k='p2'), (SELECT v FROM ids WHERE k='p4'), NULL, 2::smallint);
    RAISE EXCEPTION 'edit after 24h allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT pg_temp.as_user(:u_p2, 'p2@x.test');
DO $$ BEGIN
  BEGIN PERFORM public.dispute_match((SELECT v FROM ids WHERE k='m3'), 'late');
    RAISE EXCEPTION 'dispute after 24h allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'dispute_window_closed' THEN RAISE; END IF; END;
END $$;

-- 9. Results privacy toggle.
SELECT pg_temp.as_user(:u_admin, 'admin@x.test');
UPDATE public.camps SET players_see_all_results = false WHERE id = (SELECT v FROM ids WHERE k='camp');
SELECT pg_temp.as_user(:u_p3, 'p3@x.test');
DO $$ BEGIN
  -- P3 played m2 and m3 only.
  IF (SELECT count(*) FROM public.matches) <> 2 THEN RAISE EXCEPTION 'p3 sees other matches'; END IF;
  IF (SELECT count(*) FROM public.get_standings((SELECT v FROM ids WHERE k='camp'))) <> 1 THEN
    RAISE EXCEPTION 'p3 sees full standings';
  END IF;
END $$;
SELECT pg_temp.as_user(:u_coach, 'coach@x.test');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.matches) <> 4 THEN RAISE EXCEPTION 'coach should see all matches'; END IF;
  IF (SELECT count(*) FROM public.get_standings((SELECT v FROM ids WHERE k='camp'))) <> 5 THEN
    RAISE EXCEPTION 'coach should see full standings';
  END IF;
END $$;
-- A player cannot flip camp settings.
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');
UPDATE public.camps SET players_see_all_results = true;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT players_see_all_results FROM public.camps) THEN RAISE EXCEPTION 'player changed settings'; END IF;
END $$;

-- 10. Visibility: staff-only hides the camp from players entirely.
SELECT pg_temp.as_user(:u_admin, 'admin@x.test');
UPDATE public.camps SET visibility = 'staff' WHERE id = (SELECT v FROM ids WHERE k='camp');
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.camps) OR EXISTS (SELECT 1 FROM public.matches) OR EXISTS (SELECT 1 FROM public.sessions) THEN
    RAISE EXCEPTION 'player sees staff-only camp';
  END IF;
  BEGIN PERFORM public.get_standings((SELECT v FROM ids WHERE k='camp')); RAISE EXCEPTION 'player standings in staff mode';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.record_match((SELECT v FROM ids WHERE k='camp'), NULL, 'MS',
      (SELECT v FROM ids WHERE k='p1'), NULL, (SELECT v FROM ids WHERE k='p2'), NULL, NULL, 1::smallint);
    RAISE EXCEPTION 'player recorded in staff mode';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT pg_temp.as_user(:u_coach, 'coach@x.test');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.camps) THEN RAISE EXCEPTION 'coach lost access'; END IF;
END $$;
SELECT pg_temp.as_user(:u_admin, 'admin@x.test');
UPDATE public.camps SET visibility = 'members', players_see_all_results = true;

-- 11. Training log: any member writes, authorship stamped, only staff delete.
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');
INSERT INTO public.sessions (camp_id, session_date, title, focus, created_by)
VALUES ((SELECT v FROM ids WHERE k='camp'), '2026-11-16', 'Morning', 'Footwork',
        (SELECT v FROM ids WHERE k='coach'));
INSERT INTO ids SELECT 's1', id FROM public.sessions WHERE title = 'Morning';
INSERT INTO public.session_drills (session_id, drill_name, drill_type, duration_min, sets, reps, intensity)
VALUES ((SELECT v FROM ids WHERE k='s1'), '6-corner shadow', 'footwork', 20, 4, 10, 4);
INSERT INTO public.attendance (session_id, person_id, status, rpe)
VALUES ((SELECT v FROM ids WHERE k='s1'), (SELECT v FROM ids WHERE k='p2'), 'present', 7);
DO $$ BEGIN
  IF (SELECT created_by FROM public.sessions WHERE id = (SELECT v FROM ids WHERE k='s1')) <> (SELECT v FROM ids WHERE k='p1') THEN
    RAISE EXCEPTION 'created_by spoofed';
  END IF;
  BEGIN
    INSERT INTO public.attendance (session_id, person_id, status)
    VALUES ((SELECT v FROM ids WHERE k='s1'), (SELECT v FROM ids WHERE k='admin') , 'present');
    -- admin is a camp member, so this is allowed; now try a non-member person id
    INSERT INTO public.attendance (session_id, person_id, status)
    VALUES ((SELECT v FROM ids WHERE k='s1'), gen_random_uuid(), 'present');
    RAISE EXCEPTION 'attendance for non-member accepted';
  EXCEPTION WHEN insufficient_privilege OR foreign_key_violation THEN NULL; END;
  DELETE FROM public.sessions WHERE id = (SELECT v FROM ids WHERE k='s1');
  IF NOT EXISTS (SELECT 1 FROM public.sessions WHERE id = (SELECT v FROM ids WHERE k='s1')) THEN
    RAISE EXCEPTION 'player deleted a session';
  END IF;
  -- Assessments are invisible and unwritable for players.
  BEGIN
    INSERT INTO public.assessments (camp_id, person_id, technique)
    VALUES ((SELECT v FROM ids WHERE k='camp'), (SELECT v FROM ids WHERE k='p1'), 5);
    RAISE EXCEPTION 'player wrote an assessment';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT pg_temp.as_user(:u_coach, 'coach@x.test');
INSERT INTO public.assessments (camp_id, person_id, technique, fitness, tactics, attitude, note)
VALUES ((SELECT v FROM ids WHERE k='camp'), (SELECT v FROM ids WHERE k='p1'), 4, 4, 3, 5, 'Private coach note');
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.assessments) THEN RAISE EXCEPTION 'player sees assessments'; END IF;
END $$;

-- 12. Selection and lock contract.
SELECT pg_temp.as_user(:u_coach, 'coach@x.test');
INSERT INTO public.selection (camp_id, person_id, decision, note) VALUES
  ((SELECT v FROM ids WHERE k='camp'), (SELECT v FROM ids WHERE k='p1'), 'selected', 'Strong'),
  ((SELECT v FROM ids WHERE k='camp'), (SELECT v FROM ids WHERE k='p3'), 'selected', NULL),
  ((SELECT v FROM ids WHERE k='camp'), (SELECT v FROM ids WHERE k='p2'), 'standby', NULL),
  ((SELECT v FROM ids WHERE k='camp'), (SELECT v FROM ids WHERE k='p5'), 'not_selected', 'Injured');
DO $$ BEGIN
  BEGIN PERFORM public.lock_selection((SELECT v FROM ids WHERE k='camp')); RAISE EXCEPTION 'coach locked';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.selection) THEN RAISE EXCEPTION 'player reads selection table'; END IF;
  IF EXISTS (SELECT 1 FROM public.get_squad((SELECT v FROM ids WHERE k='camp'))) THEN RAISE EXCEPTION 'squad visible before lock'; END IF;
END $$;
SELECT pg_temp.as_user(:u_admin, 'admin@x.test');
UPDATE public.camps SET selection_target = 3;
DO $$ BEGIN
  BEGIN PERFORM public.lock_selection((SELECT v FROM ids WHERE k='camp')); RAISE EXCEPTION 'locked with wrong count';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'selected_count_mismatch%' THEN RAISE; END IF; END;
END $$;
UPDATE public.camps SET selection_target = 2;
SELECT public.lock_selection((SELECT v FROM ids WHERE k='camp'));
DO $$ BEGIN
  BEGIN UPDATE public.camps SET selection_target = 3; RAISE EXCEPTION 'target changed while locked';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.remove_camp_member((SELECT v FROM ids WHERE k='camp'), (SELECT v FROM ids WHERE k='p5'));
    RAISE EXCEPTION 'removed a member with a locked decision';
  EXCEPTION WHEN raise_exception OR insufficient_privilege THEN NULL; END;
END $$;
SELECT pg_temp.as_user(:u_coach, 'coach@x.test');
DO $$ BEGIN
  BEGIN UPDATE public.selection SET decision = 'not_selected' WHERE person_id = (SELECT v FROM ids WHERE k='p3');
    RAISE EXCEPTION 'locked selection updated';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.selection (camp_id, person_id, decision)
        VALUES ((SELECT v FROM ids WHERE k='camp'), (SELECT v FROM ids WHERE k='p4'), 'selected');
    RAISE EXCEPTION 'locked selection inserted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.selection WHERE person_id = (SELECT v FROM ids WHERE k='p1');
    RAISE EXCEPTION 'locked selection deleted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.get_squad((SELECT v FROM ids WHERE k='camp'))) THEN RAISE EXCEPTION 'squad visible before publish'; END IF;
END $$;
SELECT pg_temp.as_user(:u_admin, 'admin@x.test');
UPDATE public.camps SET publish_selection = true;
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.get_squad((SELECT v FROM ids WHERE k='camp'))) <> 3 THEN
    RAISE EXCEPTION 'published squad should show 2 selected + 1 standby';
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_squad((SELECT v FROM ids WHERE k='camp')) WHERE note IS NOT NULL) THEN
    RAISE EXCEPTION 'coach notes leaked to player';
  END IF;
END $$;
SELECT pg_temp.as_user(:u_admin, 'admin@x.test');
DO $$ BEGIN
  BEGIN PERFORM public.unlock_selection((SELECT v FROM ids WHERE k='camp'), ' '); RAISE EXCEPTION 'unlock without reason';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'reason_required' THEN RAISE; END IF; END;
END $$;
SELECT public.unlock_selection((SELECT v FROM ids WHERE k='camp'), 'Late injury');
SELECT pg_temp.as_user(:u_coach, 'coach@x.test');
UPDATE public.selection SET decision = 'standby' WHERE person_id = (SELECT v FROM ids WHERE k='p3');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.selection_events) <> 2 THEN RAISE EXCEPTION 'lock/unlock not audited'; END IF;
END $$;

-- 13. Activity read marking: only own rows, only read_at.
SELECT pg_temp.as_user(:u_p2, 'p2@x.test');
UPDATE public.activity SET read_at = now();
DO $$ BEGIN
  BEGIN UPDATE public.activity SET message = 'x'; RAISE EXCEPTION 'activity message editable';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.activity a JOIN ids ON ids.k = 'p2' WHERE a.recipient_id = ids.v AND a.read_at IS NULL) THEN
    RAISE EXCEPTION 'read marking failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.activity a JOIN ids ON ids.k = 'p2' WHERE a.recipient_id <> ids.v AND a.read_at IS NOT NULL) THEN
    RAISE EXCEPTION 'p2 marked others activity';
  END IF;
END $$;

-- 14. (0003) Offline retries are idempotent; a client id can't be hijacked.
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');
INSERT INTO ids SELECT 'off1', public.record_match((SELECT v FROM ids WHERE k='camp'), NULL, 'MS',
  (SELECT v FROM ids WHERE k='p1'), NULL, (SELECT v FROM ids WHERE k='p2'), NULL, '{21-10,21-12}', 1::smallint,
  'cccccccc-0000-0000-0000-000000000001');
DO $$ BEGIN
  IF public.record_match((SELECT v FROM ids WHERE k='camp'), NULL, 'MS',
       (SELECT v FROM ids WHERE k='p1'), NULL, (SELECT v FROM ids WHERE k='p2'), NULL, '{21-10,21-12}', 1::smallint,
       'cccccccc-0000-0000-0000-000000000001') IS DISTINCT FROM (SELECT v FROM ids WHERE k='off1') THEN
    RAISE EXCEPTION 'retry returned a different match';
  END IF;
  IF (SELECT count(*) FROM public.matches WHERE client_id = 'cccccccc-0000-0000-0000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'retry duplicated the match';
  END IF;
END $$;
SELECT pg_temp.as_user(:u_p2, 'p2@x.test');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.activity WHERE match_id = (SELECT v FROM ids WHERE k='off1')) <> 1 THEN
    RAISE EXCEPTION 'retry should notify once';
  END IF;
  BEGIN
    PERFORM public.record_match((SELECT v FROM ids WHERE k='camp'), NULL, 'MS',
      (SELECT v FROM ids WHERE k='p2'), NULL, (SELECT v FROM ids WHERE k='p5'), NULL, NULL, 1::smallint,
      'cccccccc-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'reused someone else''s client id';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT pg_temp.as_user(:u_coach, 'coach@x.test');
SELECT public.resolve_match((SELECT v FROM ids WHERE k='off1'), 'void', NULL, 1::smallint);

-- 15. (0003) Glicko-2 on a fresh camp matches src/lib/glicko2.ts exactly.
SELECT pg_temp.as_user(:u_admin, 'admin@x.test');
INSERT INTO ids SELECT 'gcamp', public.create_camp('Glicko', NULL, NULL, 2);
INSERT INTO ids SELECT 'g1', public.add_camp_person((SELECT v FROM ids WHERE k='gcamp'), 'G1', 'M', NULL, 'player');
INSERT INTO ids SELECT 'g2', public.add_camp_person((SELECT v FROM ids WHERE k='gcamp'), 'G2', 'M', NULL, 'player');
INSERT INTO ids SELECT 'g3', public.add_camp_person((SELECT v FROM ids WHERE k='gcamp'), 'G3', 'F', NULL, 'player');
INSERT INTO ids SELECT 'g4', public.add_camp_person((SELECT v FROM ids WHERE k='gcamp'), 'G4', 'F', NULL, 'player');
SELECT public.record_match((SELECT v FROM ids WHERE k='gcamp'), '2026-11-16', 'MS',
  (SELECT v FROM ids WHERE k='g1'), NULL, (SELECT v FROM ids WHERE k='g2'), NULL, NULL, 1::smallint);
SELECT public.record_match((SELECT v FROM ids WHERE k='gcamp'), '2026-11-17', 'XD',
  (SELECT v FROM ids WHERE k='g1'), (SELECT v FROM ids WHERE k='g3'),
  (SELECT v FROM ids WHERE k='g2'), (SELECT v FROM ids WHERE k='g4'), NULL, 2::smallint);
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT i.k, s.glicko, s.glicko_rd FROM public.get_standings((SELECT v FROM ids WHERE k='gcamp')) s
             JOIN ids i ON i.v = s.person_id LOOP
    IF (r.k, r.glicko, r.glicko_rd) NOT IN (('g1', 1468, 258), ('g2', 1532, 258), ('g3', 1307, 287), ('g4', 1693, 287)) THEN
      RAISE EXCEPTION 'glicko mismatch: % % %', r.k, r.glicko, r.glicko_rd;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.get_standings((SELECT v FROM ids WHERE k='gcamp'))) <> 4 THEN
    RAISE EXCEPTION 'glicko camp size';
  END IF;
END $$;

-- 16. (0003) Wellness: own rows only for players; staff read all.
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');
INSERT INTO public.wellness (camp_id, person_id, sleep, soreness, energy, mood)
VALUES ((SELECT v FROM ids WHERE k='camp'), (SELECT v FROM ids WHERE k='p1'), 4, 2, 4, 5);
DO $$ BEGIN
  BEGIN
    INSERT INTO public.wellness (camp_id, person_id, sleep, soreness, energy, mood)
    VALUES ((SELECT v FROM ids WHERE k='camp'), (SELECT v FROM ids WHERE k='p2'), 1, 5, 1, 1);
    RAISE EXCEPTION 'player wrote someone else''s wellness';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.wellness SET person_id = (SELECT v FROM ids WHERE k='p2'), sleep = 3;
  IF (SELECT person_id FROM public.wellness) <> (SELECT v FROM ids WHERE k='p1') THEN
    RAISE EXCEPTION 'wellness owner changed';
  END IF;
  IF (SELECT sleep FROM public.wellness) <> 3 THEN RAISE EXCEPTION 'own wellness not editable'; END IF;
END $$;
SELECT pg_temp.as_user(:u_p2, 'p2@x.test');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.wellness) THEN RAISE EXCEPTION 'player read another''s wellness'; END IF;
  UPDATE public.wellness SET sleep = 1;
  DELETE FROM public.wellness;
END $$;
SELECT pg_temp.as_user(:u_coach, 'coach@x.test');
DO $$ BEGIN
  IF (SELECT sleep FROM public.wellness) <> 3 THEN RAISE EXCEPTION 'coach cannot read wellness, or p2 changed it'; END IF;
  BEGIN UPDATE public.wellness SET sleep = 1; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT sleep FROM public.wellness) <> 3 THEN RAISE EXCEPTION 'coach edited a player''s wellness'; END IF;
END $$;
SELECT pg_temp.as_user(NULL, NULL);
DO $$ BEGIN
  BEGIN PERFORM 1 FROM public.wellness; RAISE EXCEPTION 'anon read wellness';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public._glicko2_update(1500, 350, 0.06, 1500, 350, 1); RAISE EXCEPTION 'anon called glicko helper';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- 17. (0004) Shared camp features, on a fresh camp so earlier toggles don't interfere.
SELECT pg_temp.as_user(:u_admin, 'admin@x.test');
INSERT INTO ids SELECT 'scamp', public.create_camp('Shared', NULL, NULL, 2);
SELECT public.add_camp_person((SELECT v FROM ids WHERE k='scamp'), 'Coach', 'M', 'coach@x.test', 'coach');
SELECT public.add_camp_person((SELECT v FROM ids WHERE k='scamp'), 'Arjun', 'M', 'p1@x.test', 'player');
SELECT public.add_camp_person((SELECT v FROM ids WHERE k='scamp'), 'Bharat', 'M', 'p2@x.test', 'player');
INSERT INTO ids SELECT 'ocamp', public.create_camp('Other', NULL, NULL, 2);
INSERT INTO ids SELECT 'osess', public.ensure_session((SELECT v FROM ids WHERE k='ocamp'), current_date, 'Other', NULL, NULL);

-- 17a. ensure_session: concurrent check-ins share one session; bad days and outsiders refused.
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');
INSERT INTO ids SELECT 'ssess', public.ensure_session((SELECT v FROM ids WHERE k='scamp'), current_date, 'Today', 'Matchplay', 120);
DO $$ BEGIN
  IF public.ensure_session((SELECT v FROM ids WHERE k='scamp'), current_date, 'Again', NULL, NULL)
     IS DISTINCT FROM (SELECT v FROM ids WHERE k='ssess') THEN
    RAISE EXCEPTION 'ensure_session created a second session';
  END IF;
  IF (SELECT count(*) FROM public.sessions WHERE camp_id = (SELECT v FROM ids WHERE k='scamp')) <> 1 THEN
    RAISE EXCEPTION 'session count wrong';
  END IF;
  IF (SELECT created_by FROM public.sessions WHERE id = (SELECT v FROM ids WHERE k='ssess'))
     IS DISTINCT FROM (SELECT v FROM ids WHERE k='p1') THEN
    RAISE EXCEPTION 'ensure_session authorship not stamped';
  END IF;
  BEGIN
    PERFORM public.ensure_session((SELECT v FROM ids WHERE k='scamp'), current_date + 5, 'Future', NULL, NULL);
    RAISE EXCEPTION 'ensure_session accepted a far-off day';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'invalid_day' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.ensure_session((SELECT v FROM ids WHERE k='ocamp'), current_date, 'X', NULL, NULL);
    RAISE EXCEPTION 'ensure_session in a camp the player is not in';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- 17b. Announcements: staff post, everyone reads, receipts are personal.
DO $$ BEGIN
  BEGIN
    INSERT INTO public.announcements (camp_id, title, message) VALUES ((SELECT v FROM ids WHERE k='scamp'), 'Hi', 'Player post');
    RAISE EXCEPTION 'player posted an announcement';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT pg_temp.as_user(:u_coach, 'coach@x.test');
INSERT INTO public.announcements (camp_id, title, message, priority, created_by)
VALUES ((SELECT v FROM ids WHERE k='scamp'), 'Court change', 'Evening session on court 3', 'urgent', (SELECT v FROM ids WHERE k='p1'));
INSERT INTO ids SELECT 'ann', id FROM public.announcements WHERE camp_id = (SELECT v FROM ids WHERE k='scamp');
DO $$ BEGIN
  IF (SELECT created_by FROM public.announcements WHERE id = (SELECT v FROM ids WHERE k='ann'))
     IS DISTINCT FROM (SELECT v FROM ids WHERE k='coach') THEN
    RAISE EXCEPTION 'announcement author was taken from the client';
  END IF;
END $$;
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');
INSERT INTO public.announcement_reads (announcement_id, person_id)
VALUES ((SELECT v FROM ids WHERE k='ann'), (SELECT v FROM ids WHERE k='p1'));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.announcements WHERE id = (SELECT v FROM ids WHERE k='ann')) THEN
    RAISE EXCEPTION 'player cannot read announcement';
  END IF;
  BEGIN
    INSERT INTO public.announcement_reads (announcement_id, person_id)
    VALUES ((SELECT v FROM ids WHERE k='ann'), (SELECT v FROM ids WHERE k='p2'));
    RAISE EXCEPTION 'player acknowledged for someone else';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  DELETE FROM public.announcements;
  UPDATE public.announcements SET title = 'Hacked';
END $$;
SELECT pg_temp.as_user(:u_p2, 'p2@x.test');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.announcement_reads) THEN RAISE EXCEPTION 'player saw another''s read receipt'; END IF;
END $$;
SELECT pg_temp.as_user(:u_coach, 'coach@x.test');
DO $$ BEGIN
  IF (SELECT title FROM public.announcements WHERE id = (SELECT v FROM ids WHERE k='ann')) <> 'Court change' THEN
    RAISE EXCEPTION 'player changed or deleted an announcement';
  END IF;
  IF (SELECT count(*) FROM public.announcement_reads WHERE announcement_id = (SELECT v FROM ids WHERE k='ann')) <> 1 THEN
    RAISE EXCEPTION 'coach cannot see read receipts';
  END IF;
END $$;

-- 17c. Injury reports: private to the player and staff; status and staff note are coach-only.
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');
INSERT INTO public.injury_reports (camp_id, person_id, body_part, severity, notes, status, staff_notes)
VALUES ((SELECT v FROM ids WHERE k='scamp'), (SELECT v FROM ids WHERE k='p1'), 'Right Knee', 'mild', 'Sore after lunges',
        'cleared', 'Self-cleared');
INSERT INTO ids SELECT 'inj', id FROM public.injury_reports;
DO $$ BEGIN
  IF (SELECT status || coalesce(staff_notes, '-') FROM public.injury_reports) <> 'new-' THEN
    RAISE EXCEPTION 'player set coach-only injury fields';
  END IF;
  BEGIN
    INSERT INTO public.injury_reports (camp_id, person_id, body_part, severity, notes)
    VALUES ((SELECT v FROM ids WHERE k='scamp'), (SELECT v FROM ids WHERE k='p2'), 'Ankle', 'mild', 'Not mine');
    RAISE EXCEPTION 'player reported an injury for someone else';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT pg_temp.as_user(:u_p2, 'p2@x.test');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.injury_reports) THEN RAISE EXCEPTION 'player read another''s injury report'; END IF;
  UPDATE public.injury_reports SET notes = 'tampered';
  DELETE FROM public.injury_reports;
END $$;
SELECT pg_temp.as_user(:u_coach, 'coach@x.test');
UPDATE public.injury_reports SET status = 'reviewing', staff_notes = 'Ice, net drills only'
 WHERE id = (SELECT v FROM ids WHERE k='inj');
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');
UPDATE public.injury_reports SET notes = 'Better today', status = 'cleared', staff_notes = NULL;
DO $$ BEGIN
  IF (SELECT notes || '|' || status || '|' || staff_notes FROM public.injury_reports)
     <> 'Better today|reviewing|Ice, net drills only' THEN
    RAISE EXCEPTION 'injury report edit rules wrong: %', (SELECT notes || '|' || status || '|' || staff_notes FROM public.injury_reports);
  END IF;
  BEGIN
    UPDATE public.injury_reports SET person_id = (SELECT v FROM ids WHERE k='p2');
    RAISE EXCEPTION 'injury report moved to another person';
  EXCEPTION
    WHEN raise_exception THEN IF SQLERRM <> 'immutable_person' THEN RAISE; END IF;
    WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- 17d. Goals: the player owns them, coach feedback is coach-only.
INSERT INTO public.player_goals (camp_id, person_id, title, category, coach_feedback)
VALUES ((SELECT v FROM ids WHERE k='scamp'), (SELECT v FROM ids WHERE k='p1'), 'Faster split step', 'fitness', 'Self praise');
DO $$ BEGIN
  IF (SELECT coach_feedback FROM public.player_goals) IS NOT NULL THEN RAISE EXCEPTION 'player wrote coach feedback'; END IF;
END $$;
SELECT pg_temp.as_user(:u_coach, 'coach@x.test');
UPDATE public.player_goals SET coach_feedback = 'Good progress';
SELECT pg_temp.as_user(:u_p2, 'p2@x.test');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.player_goals) THEN RAISE EXCEPTION 'player read another''s goals'; END IF;
END $$;
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');
DO $$ BEGIN
  IF (SELECT coach_feedback FROM public.player_goals) IS DISTINCT FROM 'Good progress' THEN
    RAISE EXCEPTION 'player cannot see coach feedback';
  END IF;
END $$;

-- 17e. Next-session focus: who set it is stamped; ticking it off keeps the setter.
SELECT pg_temp.as_user(:u_coach, 'coach@x.test');
INSERT INTO public.next_session_focus (camp_id, person_id, focus_text, set_by, completed)
VALUES ((SELECT v FROM ids WHERE k='scamp'), (SELECT v FROM ids WHERE k='p1'), 'Racket up at the net',
        (SELECT v FROM ids WHERE k='p2'), true);
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');
DO $$ BEGIN
  IF (SELECT set_by FROM public.next_session_focus) IS DISTINCT FROM (SELECT v FROM ids WHERE k='coach')
     OR (SELECT completed FROM public.next_session_focus) THEN
    RAISE EXCEPTION 'focus setter or initial state wrong';
  END IF;
  UPDATE public.next_session_focus SET completed = true;
  IF (SELECT completed_at FROM public.next_session_focus) IS NULL
     OR (SELECT set_by FROM public.next_session_focus) IS DISTINCT FROM (SELECT v FROM ids WHERE k='coach') THEN
    RAISE EXCEPTION 'completing the focus lost its setter or time';
  END IF;
END $$;
INSERT INTO public.next_session_focus (camp_id, person_id, focus_text)
VALUES ((SELECT v FROM ids WHERE k='scamp'), (SELECT v FROM ids WHERE k='p1'), 'Watch the shuttle onto the strings')
ON CONFLICT (camp_id, person_id) DO UPDATE SET focus_text = EXCLUDED.focus_text, completed = false;
DO $$ BEGIN
  IF (SELECT set_by FROM public.next_session_focus) IS DISTINCT FROM (SELECT v FROM ids WHERE k='p1')
     OR (SELECT completed_at FROM public.next_session_focus) IS NOT NULL THEN
    RAISE EXCEPTION 'a new focus kept the old setter or completion';
  END IF;
END $$;
SELECT pg_temp.as_user(:u_p2, 'p2@x.test');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.next_session_focus) THEN RAISE EXCEPTION 'player read another''s focus'; END IF;
END $$;

-- 17f. Reflections: own only; the session must be from the same camp.
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');
INSERT INTO public.session_reflections (camp_id, person_id, session_id, went_well, to_work_on, effort_rpe, energy_level)
VALUES ((SELECT v FROM ids WHERE k='scamp'), (SELECT v FROM ids WHERE k='p1'), (SELECT v FROM ids WHERE k='ssess'),
        'Net kills', 'Rear-court recovery', 7, 'normal');
DO $$ BEGIN
  BEGIN
    INSERT INTO public.session_reflections (camp_id, person_id, session_id, went_well, to_work_on, effort_rpe, energy_level)
    VALUES ((SELECT v FROM ids WHERE k='scamp'), (SELECT v FROM ids WHERE k='p1'), (SELECT v FROM ids WHERE k='osess'),
            'x', 'y', 5, 'low');
    RAISE EXCEPTION 'reflection linked to another camp''s session';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT pg_temp.as_user(:u_coach, 'coach@x.test');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.session_reflections) <> 1 THEN RAISE EXCEPTION 'coach cannot read reflections'; END IF;
END $$;

-- 17g. Equipment, custom skills and the venue plan: staff write, everyone reads.
INSERT INTO public.equipment (camp_id, name, category, quantity, status, borrowed_by)
VALUES ((SELECT v FROM ids WHERE k='scamp'), 'Feather shuttles', 'shuttles', 10, 'borrowed', (SELECT v FROM ids WHERE k='p1'));
INSERT INTO public.custom_skills (camp_id, title, category, difficulty, description, key_cues)
VALUES ((SELECT v FROM ids WHERE k='scamp'), 'Net tumble', 'net', 'advanced', 'Spinning net shot', ARRAY['Soft grip']);
INSERT INTO public.venue_plans (camp_id, plan_type, venue_name, shuttle_speed)
VALUES ((SELECT v FROM ids WHERE k='scamp'), 'indoor_regular', 'Gymkhana courts 1-4', '77 (Medium)')
ON CONFLICT (camp_id) DO UPDATE SET venue_name = EXCLUDED.venue_name;
INSERT INTO public.court_allocations (camp_id, court_num, status, title)
VALUES ((SELECT v FROM ids WHERE k='scamp'), 2, 'match', 'MS: Arjun v Bharat');
DO $$ BEGIN
  BEGIN
    INSERT INTO public.equipment (camp_id, name, category, status, borrowed_by)
    VALUES ((SELECT v FROM ids WHERE k='scamp'), 'Racket', 'rackets', 'borrowed', (SELECT v FROM ids WHERE k='p3'));
    RAISE EXCEPTION 'equipment lent to someone outside the camp';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.equipment) <> 1 OR (SELECT count(*) FROM public.custom_skills) <> 1
     OR (SELECT count(*) FROM public.venue_plans) <> 1 OR (SELECT count(*) FROM public.court_allocations) <> 1 THEN
    RAISE EXCEPTION 'player cannot read camp-wide content';
  END IF;
  BEGIN
    INSERT INTO public.court_allocations (camp_id, court_num, status, title)
    VALUES ((SELECT v FROM ids WHERE k='scamp'), 3, 'drill', 'Player-assigned');
    RAISE EXCEPTION 'player assigned a court';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  DELETE FROM public.court_allocations;
  IF NOT EXISTS (SELECT 1 FROM public.court_allocations) THEN RAISE EXCEPTION 'player freed a court'; END IF;
  BEGIN
    INSERT INTO public.equipment (camp_id, name, category) VALUES ((SELECT v FROM ids WHERE k='scamp'), 'Cones', 'training_aids');
    RAISE EXCEPTION 'player added equipment';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.custom_skills (camp_id, title, category, difficulty, description)
    VALUES ((SELECT v FROM ids WHERE k='scamp'), 'X', 'net', 'fundamental', 'Y');
    RAISE EXCEPTION 'player added a skill';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.venue_plans SET venue_name = 'Hacked';
  DELETE FROM public.equipment;
  IF (SELECT venue_name FROM public.venue_plans) <> 'Gymkhana courts 1-4' OR NOT EXISTS (SELECT 1 FROM public.equipment) THEN
    RAISE EXCEPTION 'player changed camp-wide content';
  END IF;
END $$;

-- 17h. Hiding the camp from players hides camp-wide content but keeps their own records.
SELECT pg_temp.as_user(:u_admin, 'admin@x.test');
UPDATE public.camps SET visibility = 'staff' WHERE id = (SELECT v FROM ids WHERE k='scamp');
SELECT pg_temp.as_user(:u_p1, 'p1@x.test');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.announcements) OR EXISTS (SELECT 1 FROM public.venue_plans) THEN
    RAISE EXCEPTION 'hidden camp content visible to a player';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.injury_reports) THEN RAISE EXCEPTION 'player lost sight of own injury report'; END IF;
  BEGIN
    INSERT INTO public.injury_reports (camp_id, person_id, body_part, severity, notes)
    VALUES ((SELECT v FROM ids WHERE k='scamp'), (SELECT v FROM ids WHERE k='p1'), 'Wrist', 'mild', 'x');
    RAISE EXCEPTION 'player wrote into a hidden camp';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- 17i. Anonymous: nothing, and no access to the helpers.
SELECT pg_temp.as_user(NULL, NULL);
DO $$ BEGIN
  BEGIN PERFORM 1 FROM public.announcements; RAISE EXCEPTION 'anon read announcements';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM public.injury_reports; RAISE EXCEPTION 'anon read injury reports';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.ensure_session((SELECT v FROM ids WHERE k='scamp'), current_date, 'X', NULL, NULL);
    RAISE EXCEPTION 'anon called ensure_session';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SELECT 'ALL TRAINING CAMP ASSERTIONS PASSED' AS result;
