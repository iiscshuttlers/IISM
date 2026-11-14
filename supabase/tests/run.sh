#!/usr/bin/env bash
# Runs the SQL assertions on a fresh database inside a throwaway Supabase Postgres container.
#   CONTAINER=camp-test-pg MIGRATION=supabase/migrations/0001_camp.sql bash supabase/tests/run.sh
# Start a container first, e.g.:
#   docker run -d --name camp-test-pg -e POSTGRES_PASSWORD=postgres public.ecr.aws/supabase/postgres:17.6.1.141
set -euo pipefail
export MSYS_NO_PATHCONV=1
CONTAINER="${CONTAINER:-camp-test-pg}"
MIGRATION="${MIGRATION:-supabase/migrations/0001_camp.sql}"
DB="camp_t_$$"
cd "$(dirname "$0")/../.."
psql() { docker exec -i "$CONTAINER" psql -U postgres -h localhost -q -v ON_ERROR_STOP=1 "$@"; }
psql -c "create database $DB" >/dev/null
trap 'psql -c "drop database if exists $DB" >/dev/null' EXIT
psql -d "$DB" < supabase/tests/bootstrap.sql
psql -d "$DB" < "$MIGRATION"
psql -d "$DB" < supabase/tests/assertions.sql | grep -E "PASSED|ERROR" || true
