# Díade

pnpm + Turbo monorepo: `apps/mobile` (Expo/React Native), `apps/api` (Cloudflare Worker), `packages/*`.

## Checks (hooks via Lefthook; CI mirrors them)
- `pnpm lint` / `pnpm format` (Biome, zero warnings allowed), `pnpm typecheck`, `pnpm test`
- `pnpm i18n:check` — every `t('key')` must exist in `packages/i18n/src/locales/en.ts`, and every key must be used. Add/remove keys in both `en.ts` and `pt-PT.ts`.
- `pnpm knip` — unused files, exports and dependencies (CI only, blocking). Don't `export` what nothing imports.
- `scripts/check-migrations.sh` (CI, blocking) applies all migrations to a scratch Postgres, applies them again (must be a no-op) and checks `schema.ts` has no change without a migration. Run it locally against a throwaway `localhost` database only; it refuses anything else.
- Commit messages are conventional (`feat:`, `fix:`, `chore:` …).

## UI changes need wireframes
When a change adds or alters a screen, component layout or navigation in `apps/mobile`, use the `wireframe` skill to add or update the wireframes in `design/<feature>/` (`index.html` + `wireframes/`) before pushing. Pre-push prints a non-blocking reminder if UI files changed and `design/` did not; skip it for changes with no visible effect (refactors, copy-only, bug fixes).

## Database migrations
Drizzle runs each migration once (its ledger), so schema statements stay as generated. Any hand-written data statement (`UPDATE`, `INSERT` backfills) must be safe to re-run: guard it (`WHERE ... IS NULL`, `ON CONFLICT DO NOTHING`), because a dev branch can end up with a copied ledger (see `docs/architecture/environments.md`). Never edit a migration that has already been applied; add a new one.
