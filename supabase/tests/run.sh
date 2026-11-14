#!/usr/bin/env bash
# Runs the SQL assertions on a fresh database inside a throwaway Supabase Postgres container.
#   bash supabase/tests/run.sh
# Override the schema for break tests:  MIGRATIONS="path/a.sql path/b.sql" bash supabase/tests/run.sh
# Start a container first, e.g.:
#   docker run -d --name camp-test-pg -e POSTGRES_PASSWORD=postgres public.ecr.aws/supabase/postgres:17.6.1.141
set -euo pipefail
export MSYS_NO_PATHCONV=1
CONTAINER="${CONTAINER:-camp-test-pg}"
cd "$(dirname "$0")/../.."
MIGRATIONS="${MIGRATIONS:-$(ls supabase/migrations/*.sql | sort)}"
DB="camp_t_$$"
psql() { docker exec -i "$CONTAINER" psql -U postgres -h localhost -q -v ON_ERROR_STOP=1 "$@"; }
psql -c "create database $DB" >/dev/null
trap 'psql -c "drop database if exists $DB" >/dev/null' EXIT
psql -d "$DB" < supabase/tests/bootstrap.sql
for m in $MIGRATIONS; do psql -d "$DB" < "$m"; done
psql -d "$DB" < supabase/tests/assertions.sql | grep -E "PASSED|ERROR" || true
