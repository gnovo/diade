# Secrets (1Password)

Local secrets live in the 1Password **Employee** vault, in items tagged `diade`. The repo only holds
`op://` references (`apps/api/.dev.vars.tpl`, `apps/mobile/.env.local.tpl`); `op run` resolves them into the
child process's environment, so nothing is written to disk and nothing needs to be pasted.

Requires the 1Password CLI with the desktop-app integration (Settings > Developer > Integrate with 1Password CLI).

| Item (Employee vault) | Fields |
| --- | --- |
| `diade-api-dev` | `DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| `diade-mobile` | `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` (release builds only) |

Field names match the env var names. Production values are not read locally: set them on the Worker with
`op read op://Employee/<item>/<FIELD> | npx wrangler secret put <FIELD>`.

## Commands

- `pnpm --filter @diade/api dev` runs `wrangler dev` with the secrets injected (`CLOUDFLARE_INCLUDE_PROCESS_ENV`
  makes Wrangler accept process env as bindings). `dev:plain` is the old `.dev.vars` flow.
- `db:migrate` and `db:studio` use the same injection, so they hit the DB in `diade-api-dev`.
- `pnpm --filter @diade/mobile start` injects `EXPO_PUBLIC_SENTRY_DSN`.
- The release scripts (`build-android-prod.sh`, `release-android.sh`) read `EXPO_PUBLIC_SENTRY_DSN` and
  `SENTRY_AUTH_TOKEN` through `scripts/op-secrets.sh`; an exported env var overrides 1Password.

CI needs no 1Password: its only credentials are a throwaway Postgres.
