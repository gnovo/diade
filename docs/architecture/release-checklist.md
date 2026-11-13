# Production release checklist (Android, through Obtainium)

How to roll `main` out to the two phones when native code has changed, so an over-the-air update cannot reach them (see
[environments.md](environments.md) for why, and `apps/mobile/scripts/release-android.sh` for what the scripts do). Nothing here has been run for the
current batch of changes (v0.1.0-3 to the health work, #49 to #63): it is the order to follow and the things to check at each step.

The order matters: **database migration, then the Worker, then the APK.** A Worker that queries a table the database does not have fails every
request, and an app that pushes an entity a Worker does not know gets a 400 that blocks its whole sync.

## 0. Before anything

- [ ] `main` is the commit you mean to ship, CI green, and `apps/api/package.json` has `postgres` on `^3.4.9`. **Do not ship `postgres` 4.x**: on the Worker it makes
      every request that reaches the database use about 1 s of CPU, so sign-in and sync fail with 503 (found on the dev Worker; the pin and a Dependabot ignore are in #41).
- [ ] Is an APK needed? Compare the runtime version on `main` with the installed build's (`assets/fingerprint` inside its APK):
      `cd apps/mobile && unset APP_VARIANT && npx expo-updates runtimeversion:resolve --platform android | jq -r .runtimeVersion`. Do not grep the first
      `"hash"` out of `pnpm fingerprint`: that is a single file's hash, not the fingerprint. If they differ, an OTA never reaches the phones and you need the APK.
      v0.1.0-4 (13 Nov 2026) is `6fafe24e4babed067585417793fd5f5c68b0927b`; the over-the-air update `ace3140d` (#66) went to it.
- [ ] Both phones can update at the same time (a recipe saved with sections on one phone shows its `## Steps` text as raw notes on a phone still on the old build).

## 1. Production database

Migrations are additive (new tables and columns), so the old Worker and the old app keep working against the migrated database.

```bash
cd apps/api
# How many are applied? Compare with the files in drizzle/migrations (16 on 13 Nov 2026, 0000 to 0015; production was at 12 before the health
# rollout: 0011 was applied earlier, with #51). Check each pending one adds columns or tables only.
DATABASE_URL="$(neon connection-string production)" psql "$DATABASE_URL" -At -c "select count(*) from drizzle.__drizzle_migrations"
DATABASE_URL="$(neon connection-string production)" npx drizzle-kit migrate
```

- [ ] The ledger count equals the number of migrations afterwards (16), and `space_members` has `nutrition_targets`, `training` and `training_google`.
- Use the branch **by name** (`production`); never `neon branches reset`. Look at the target before running: this is the real data.

## 1b. Google consent screen

Only when the release adds a Google scope. The training calendar (#60) asks for `https://www.googleapis.com/auth/calendar.app.created`.

- [ ] Google Cloud console → the production OAuth client's project → Data access: add `calendar.app.created`. Without it, turning on "Mostrar no Google
      Calendar" fails at Google's consent step; nothing else is affected.

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

`main` is protected, so the script bumps `android.versionCode`, builds the signed production APK, commits `chore(mobile): release v<version>-<code>` on a
`chore/release-v<version>-<code>` branch, pushes it and creates a **draft** GitHub Release (Obtainium ignores drafts). Then:

```bash
# open and merge the PR from that branch (squash is fine), then:
bash scripts/release-android.sh publish v<version>-<code>
```

`publish` finds the merged bump commit on `main` and publishes the draft with the tag on that commit, which is when Obtainium starts offering it. Requires the signing setup `build-android-prod.sh` needs, and `gh` signed in as **`gnovo`** (`gh auth status`; `gh auth switch -u gnovo`). Another
account can only read the repo, so `gh release create` fails with a misleading `"workflow" scope may be required` after the branch is already pushed. If
that happens, do not run `apk` again (it bumps `versionCode` again): switch accounts and create the draft by hand from the APK already built:
`gh release create v<version>-<code> android/app/build/outputs/apk/release/diade-<version>-<code>.apk --repo gnovo/diade --title v<version>-<code> --draft --notes "…"`.
The script also leaves you on the release branch then; `git switch main`.

- [ ] The release exists on GitHub with the APK attached.
- [ ] Obtainium offers it on both phones; update both. The APK is release-signed, so it installs over the existing app (a debug build with the same id never would).
- [ ] The production app is `com.diade.app`; the dev app (`com.diade.app.dev`) is separate and untouched.

## 3b. Content and first run (health, #55 to #63)

- [ ] Import the new recipes in the production app: Listas → Receitas → + → Importar, and paste `docs/plans/health/recipes/new.md` (one `#` title per recipe, as done in dev). Their kcal and protein come from
      the built-in table; no catalog values are needed (dev has none either). Set the type of "Peixe assado em papelote" to meal.
- [ ] Profile → Nutrição and Treino: set targets and the training week on each phone (per member; nothing is copied from dev). Set the weekly goals **before** "Criar a minha semana de treino": a kind at 0 gets no blocks (#66).
- [ ] Profile → Relógio e balança: turn on, allow the four permissions. Needs the APK (Health Connect is native).
- [ ] Optional: Treino → "Mostrar no Google Calendar". Needs step 1b.

## 4. After

- [ ] Open the app on a phone: sign in works, "Sincronizado" shows, a change made on one phone appears on the other.
- [ ] `wrangler tail` shows no `exceededCpu` while you use it.
- [ ] If sync fails after the Worker deploy and tail shows `exceededCpu` or 503: roll the Worker back (step 2), then investigate.
- [ ] An APK cannot be rolled back through Obtainium (Android refuses a lower `versionCode`); fix forward with a new build.

## Keeping the next release boring

- `pnpm fingerprint` before and after any dependency change; if it moves, say so in the PR (it means an APK release).
- Do not merge Dependabot bumps of `postgres` majors; smoke-test a Worker deploy on dev (`wrangler deploy --env dev`, then sign in and sync from the dev app) after any
  change to `apps/api` dependencies.
