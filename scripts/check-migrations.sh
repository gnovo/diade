#!/usr/bin/env bash
# Verifies the Drizzle migrations against a real, throwaway Postgres:
#   1. they apply cleanly from an empty database
#   2. applying them again is a no-op (succeeds, ledger unchanged)
#   3. schema.ts and the migrations agree (`generate` produces nothing new)
# Usage: DATABASE_URL=postgres://postgres:pw@localhost:5432/scratch bash scripts/check-migrations.sh
# Refuses non-local databases so it can never run against Neon.
set -euo pipefail
cd "$(dirname "$0")/../apps/api"

: "${DATABASE_URL:?set DATABASE_URL to a scratch local Postgres}"
case "$DATABASE_URL" in
  *@localhost[:/]* | *@127.0.0.1[:/]*) ;;
  *) echo "Refusing to run: DATABASE_URL must point at localhost." >&2; exit 1 ;;
esac

expected=$(grep -c '"tag"' drizzle/migrations/meta/_journal.json)
ledger() {
  node --input-type=module -e "
    import postgres from 'postgres';
    const sql = postgres(process.env.DATABASE_URL);
    const [{ n }] = await sql\`select count(*)::int as n from drizzle.__drizzle_migrations\`;
    console.log(n);
    await sql.end();"
}

echo "1/3 apply from empty database"
pnpm exec drizzle-kit migrate
first=$(ledger)

echo "2/3 apply again (must be a no-op)"
pnpm exec drizzle-kit migrate
second=$(ledger)
if [ "$first" != "$expected" ] || [ "$second" != "$expected" ]; then
  echo "Ledger mismatch: journal has $expected migrations, ledger has $first then $second." >&2
  exit 1
fi

echo "3/3 schema.ts matches the migrations"
before=$(git status --porcelain -- drizzle)
pnpm exec drizzle-kit generate --name ci_drift_check
after=$(git status --porcelain -- drizzle)
if [ "$before" != "$after" ]; then
  echo "schema.ts has changes with no migration. Run: pnpm --filter @diade/api db:generate" >&2
  echo "(a ci_drift_check migration was just generated in apps/api/drizzle; delete it if you did not mean to keep it)" >&2
  exit 1
fi
echo "Migrations OK ($expected applied, re-run is a no-op, no drift)"
