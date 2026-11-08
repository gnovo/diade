# Production release checklist (Android, through Obtainium)

How to roll `main` out to the two phones when native code has changed, so an over-the-air update cannot reach them (see
[environments.md](environments.md) for why, and `apps/mobile/scripts/release-android.sh` for what the scripts do). Nothing here has been run for the
current batch of changes: it is the order to follow and the things to check at each step.

The order matters: **database migration, then the Worker, then the APK.** A Worker that queries a table the database does not have fails every
request, and an app that pushes an entity a Worker does not know gets a 400 that blocks its whole sync.

## 0. Before anything

- [ ] `main` is the commit you mean to ship, CI green, and `apps/api/package.json` has `postgres` on `^3.4.9`. **Do not ship `postgres` 4.x**: on the Worker it makes
      every request that reaches the database use about 1 s of CPU, so sign-in and sync fail with 503 (found on the dev Worker; the pin and a Dependabot ignore are in #41).
- [ ] Is an APK needed? `cd apps/mobile && pnpm fingerprint` and compare the `hash` with the installed build's `assets/fingerprint` (inside its APK; the last
      value recorded for the installed build was `37f35f74905761cd55abac1a528446196f719db1`). If they differ, an OTA never reaches the phones and you need the APK.
      The current value on `main` is `0d8f04a382c9e42a66b781a68145e87c6e59f6f6` (the Expo 58.0.23 and Sentry bumps changed it).
- [ ] Both phones can update at the same time (a recipe saved with sections on one phone shows its `## Steps` text as raw notes on a phone still on the old build).

## 1. Production database

Migrations are additive (new tables and columns), so the old Worker and the old app keep working against the migrated database.

```bash
cd apps/api
# How many are applied? The repo has 10 (0000 to 0009); recipes, meal plans and the ingredient catalog are 0007 to 0009.
DATABASE_URL="$(neon connection-string production)" psql "$DATABASE_URL" -At -c "select count(*) from drizzle.__drizzle_migrations"
DATABASE_URL="$(neon connection-string production)" npx drizzle-kit migrate
```

- [ ] The ledger count equals the number of migrations afterwards, and `ingredients`, `meal_plans` and `recipes` exist.
- Use the branch **by name** (`production`); never `neon branches reset`. Look at the target before running: this is the real data.

## 2. The Worker (production)

- [ ] Note the current version first, so there is something to roll back to: `pnpm exec wrangler deployments list` (the production Worker is `diade-api`; a plain
      `wrangler deploy` is production, `--env dev` is the dev Worker).
- [ ] `cd apps/api && pnpm exec wrangler deploy`
- [ ] Watch it: `pnpm exec wrangler tail --format json` and open the app. Look for `"outcome": "exceededCpu"` or 503s. A healthy authenticated request is a few
      hundred ms of wall time and well under 100 ms of CPU; the sign-in check (`/api/auth/get-session`) is the one to look at.
- Rollback: `pnpm exec wrangler rollback <previous-version-id>`. The database changes do not need undoing.

## 3. The APK

```bash
cd apps/mobile
git status                       # must be clean: the script refuses otherwise
unset APP_VARIANT                # a dev variant must never be released
bash scripts/release-android.sh apk "Notes for the release"
```

It bumps `android.versionCode`, builds the signed production APK, commits `chore(mobile): release v<version>-<code>`, tags, pushes and publishes a GitHub Release.
Obtainium follows that release. Requires `gh auth login` and the signing setup `build-android-prod.sh` needs.

- [ ] The release exists on GitHub with the APK attached.
- [ ] Obtainium offers it on both phones; update both. The APK is release-signed, so it installs over the existing app (a debug build with the same id never would).
- [ ] The production app is `com.diade.app`; the dev app (`com.diade.app.dev`) is separate and untouched.

## 4. After

- [ ] Open the app on a phone: sign in works, "Sincronizado" shows, a change made on one phone appears on the other.
- [ ] `wrangler tail` shows no `exceededCpu` while you use it.
- [ ] If sync fails after the Worker deploy and tail shows `exceededCpu` or 503: roll the Worker back (step 2), then investigate.
- [ ] An APK cannot be rolled back through Obtainium (Android refuses a lower `versionCode`); fix forward with a new build.

## Keeping the next release boring

- `pnpm fingerprint` before and after any dependency change; if it moves, say so in the PR (it means an APK release).
- Do not merge Dependabot bumps of `postgres` majors; smoke-test a Worker deploy on dev (`wrangler deploy --env dev`, then sign in and sync from the dev app) after any
  change to `apps/api` dependencies.
