#!/usr/bin/env bash
# Races a coach's selection edit against the admin's lock_selection() on a fresh database.
# Expected: the two serialise on the camp row; a locked squad always has exactly
# selection_target 'selected' rows.
set -euo pipefail
export MSYS_NO_PATHCONV=1
CONTAINER="${CONTAINER:-camp-test-pg}"
DB="camp_c_$$"
cd "$(dirname "$0")/../.."
psql() { docker exec -i "$CONTAINER" psql -U postgres -h localhost -q -v ON_ERROR_STOP=1 "$@"; }
psql -c "create database $DB" >/dev/null
trap 'psql -c "drop database if exists $DB" >/dev/null' EXIT
psql -d "$DB" < supabase/tests/bootstrap.sql
for m in $(ls supabase/migrations/*.sql | sort); do psql -d "$DB" < "$m"; done
psql -d "$DB" -c "INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@x.test', now()),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'coach@x.test', now())" >/dev/null

AS='SELECT set_config($$request.jwt.claim.sub$$, :sub, false), set_config($$request.jwt.claim.email$$, :email, false); SET ROLE authenticated;'
ADMIN="-v sub='aaaaaaaa-0000-0000-0000-000000000001' -v email='admin@x.test'"
COACH="-v sub='aaaaaaaa-0000-0000-0000-000000000002' -v email='coach@x.test'"

setup() {
  psql -d "$DB" -tA $ADMIN <<SQL >/dev/null
TRUNCATE public.selection, public.selection_events;
UPDATE public.camps SET selection_locked_at = NULL, selection_locked_by = NULL;
SQL
  psql -d "$DB" -tA $COACH <<SQL >/dev/null
$AS
INSERT INTO public.selection (camp_id, person_id, decision)
SELECT cm.camp_id, cm.person_id, CASE WHEN p.full_name IN ('P1','P2') THEN 'selected' ELSE 'standby' END
  FROM public.camp_members cm JOIN public.people p ON p.id = cm.person_id WHERE cm.role = 'player';
SQL
}

psql -d "$DB" -tA <<'SQL' >/dev/null
SELECT public.bootstrap_site_admin('admin@x.test', 'Admin');
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false),
       set_config('request.jwt.claim.email', 'admin@x.test', false);
SET ROLE authenticated;
SELECT public.claim_my_profile();
SELECT public.create_camp('Race', NULL, NULL, 2);
SELECT public.add_camp_person((SELECT id FROM public.camps), 'Coach', 'M', 'coach@x.test', 'coach');
SELECT public.add_camp_person((SELECT id FROM public.camps), 'P' || g, 'M', NULL, 'player') FROM generate_series(1, 3) g;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', false),
       set_config('request.jwt.claim.email', 'coach@x.test', false);
SELECT public.claim_my_profile();
SQL

check() {
  psql -d "$DB" -tA -c "SELECT CASE WHEN c.selection_locked_at IS NULL THEN 'unlocked'
           WHEN (SELECT count(*) FROM public.selection s WHERE s.camp_id = c.id AND s.decision = 'selected') = c.selection_target
           THEN 'locked-valid' ELSE 'LOCKED-INVALID' END FROM public.camps c"
}

# Race A: coach edit holds its transaction open; admin locks meanwhile.
setup
( psql -d "$DB" $COACH <<SQL >/dev/null 2>&1 ) &
$AS
BEGIN;
UPDATE public.selection SET decision = 'standby' WHERE person_id = (SELECT id FROM public.people WHERE full_name = 'P2');
SELECT pg_sleep(3);
COMMIT;
SQL
sleep 1
LOCK_OUT=$( psql -d "$DB" $ADMIN 2>&1 <<SQL || true
$AS
SELECT public.lock_selection((SELECT id FROM public.camps));
SQL
)
wait
echo "race A (edit first): lock -> $(echo "$LOCK_OUT" | grep -o 'selected_count_mismatch[^,]*' || echo locked); state -> $(check)"

# Race B: admin lock holds its transaction open; coach edits meanwhile.
setup
( psql -d "$DB" $ADMIN <<SQL >/dev/null 2>&1 ) &
$AS
BEGIN;
SELECT public.lock_selection((SELECT id FROM public.camps));
SELECT pg_sleep(3);
COMMIT;
SQL
sleep 1
EDIT_OUT=$( psql -d "$DB" $COACH 2>&1 <<SQL || true
$AS
UPDATE public.selection SET decision = 'standby' WHERE person_id = (SELECT id FROM public.people WHERE full_name = 'P2');
SQL
)
wait
echo "race B (lock first): edit -> $(echo "$EDIT_OUT" | grep -o 'selection_locked' || echo applied); state -> $(check)"
