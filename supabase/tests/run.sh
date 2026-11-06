#!/usr/bin/env bash
# Roda os testes de permissão do banco num Postgres local descartável.
# Uso: PGHOST=... PGPORT=... PGUSER=postgres ./supabase/tests/run.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
psql -q -c "drop database if exists mhub_test" -c "create database mhub_test"
psql -q -d mhub_test -v ON_ERROR_STOP=1 -f "$here/00_supabase_stub.sql"
for m in "$here"/../migrations/*.sql; do psql -q -d mhub_test -v ON_ERROR_STOP=1 -f "$m"; done
for t in "$here"/1*.sql; do echo "### $t"; psql -q -d mhub_test -f "$t"; done
