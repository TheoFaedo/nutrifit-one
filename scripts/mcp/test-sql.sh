#!/usr/bin/env bash
set -euo pipefail
# Uses a NEW, dedicated PostgreSQL container. Never points to a linked project.
cd "$(dirname "$0")/../.."
container="nutrifit-mcp-sql-${RANDOM}"
docker run --name "$container" -e POSTGRES_PASSWORD=local-test-only -d postgres:17 >/dev/null
trap 'docker rm -f "$container" >/dev/null' EXIT
for attempt in {1..30}; do
  if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/bootstrap.sql
for migration in supabase/migrations/*.sql; do
  echo "Applying $migration"
  docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 --single-transaction < "$migration"
done
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/mcp_permissions.sql
