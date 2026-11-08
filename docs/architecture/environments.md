# Environments

Status: development environment in place (Android). Production is unchanged.

| | Production | Development |
|---|---|---|
| App id (Android) | `com.diade.app` | `com.diade.app.dev` ("Díade Dev") |
| URL scheme | `diade://` | `diade-dev://` |
| API | `diade-api` Worker | `diade-api-dev` Worker (`wrangler --env dev`) |
| Database | Neon `production` branch | Neon `dev` branch (schema only, no real data) |
| Over-the-air updates | EAS channel `production` | off (JavaScript comes from Metro) |
| Sentry `environment` | `production` | `dev` |

## The one rule: do not change the production native config

The app's `runtimeVersion` is the native fingerprint, a hash of the resolved Expo config, the config
plugins and the native files. An over-the-air update only reaches builds with the same fingerprint, so
anything that changes the production config (a new plugin in `app.json`, an icon, a permission) silently
cuts installed apps off from updates until a new APK is released.

The dev variant therefore lives in `apps/mobile/app.config.ts`, driven by `APP_VARIANT`. With it unset
the config is returned untouched, and a unit test pins that. Before publishing an update, check:

```bash
cd apps/mobile && pnpm fingerprint     # must equal the installed build's runtime version
```

The installed build's value is in its APK at `assets/fingerprint`, and `eas update` prints the runtime
version it publishes under.

## Running the dev app

```bash
cd apps/mobile
pnpm android:dev          # deployed dev API
pnpm android:dev:local    # wrangler dev on this Mac, through adb reverse
```

`android/` is generated and holds one variant at a time, so the script runs a clean prebuild when it is
not the dev variant. Before building the release app again, regenerate it for production
(`npx expo prebuild --platform android --clean --no-install` with `APP_VARIANT` unset). The release
scripts refuse to run with `APP_VARIANT` set or while `android/` is the dev variant.

An EAS `development` profile builds the same variant in the cloud (`eas build --profile development`).

## Dev API and database

```bash
cd apps/api
npx wrangler deploy --env dev          # deploys diade-api-dev only. A plain `wrangler deploy` is production.
npx wrangler secret put NAME --env dev # DATABASE_URL, BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID/SECRET, SENTRY_DSN
```

- `DATABASE_URL` is the pooled connection string of the Neon `dev` branch.
- The dev Worker has no cron, so it never syncs anything on its own.
- Migrations: `DATABASE_URL=<dev string> npx drizzle-kit migrate`. The branch was created schema-only, so
  its migration ledger was copied from production once; a new migration applies on top as usual.
- To start the dev data over, delete the branch and recreate it schema-only, then copy the migration ledger
  as described above: `neon branches delete dev`, then
  `neon branches create --name dev --parent production --schema-only`. Do not use `neon branches reset`:
  it resets to the parent's current state, which would copy production data into dev.
- Sign-in is Google only, restricted to the two allowed emails. The Google OAuth client needs
  `https://diade-api-dev.diade.workers.dev/api/auth/callback/google` as an authorised redirect URI.
- Connecting Google Calendar in the dev app copies that calendar into the dev database.

The API trusts `diade-dev://` for sign-in callbacks only outside production, so a dev build can never
complete a production sign-in.

## Scratch mode

For throwaway or destructive tests, run the API locally against a local Postgres
(`wrangler dev --var DATABASE_URL:...`) and use `pnpm android:dev:local`.
