# Authentication v1

Status: email and password sign-in works end to end against a local Postgres
(`wrangler dev` + Docker Postgres). Google sign-in is configured on the server but not used
by the app yet.

## Decisions

- **Email and password first.** Google sign-in needs OAuth client ids and native packages
  that are not set up yet. Email and password works now and does not block sync work.
- **Invitation-only accounts.** `emailAndPassword.disableSignUp` is on unless
  `ALLOW_SIGN_UP=true`. Díade has exactly two members (handover §2). Set the flag only to
  create the two accounts, then remove it.
- **Bearer tokens on mobile.** The Better Auth `bearer()` plugin returns a session token in
  the sign-in body. The app stores it in the platform keychain (expo-secure-store) and sends
  `Authorization: Bearer <token>`.
- **Sessions are checked on launch.** A stored token is validated with
  `/api/auth/get-session`. An invalid token signs the device out and wipes local data.
  Offline launches keep the stored session.
- **Sign-out revokes the session** on the server, then clears the device.

## Schema fix found during testing

Better Auth 1.7 expects `account.id_token`. The original migration did not create it.
Migration `0001_better_auth_id_token` adds the column. Without it, every auth call returns
"Drizzle schema mismatch".

## Known gaps

- **Origin check.** Better Auth rejects auth requests that carry an `Origin` or
  `Sec-Fetch-*` header unless the origin is trusted. Native clients send neither, so the
  app is unaffected. The browser preview (react-native-web) will need `trustedOrigins`.
- **Password hashing in Workers** is not yet measured against the Workers CPU limit. Tests
  ran under workerd via `wrangler dev`, not on Cloudflare.
- **Development secret.** The API falls back to a built-in `BETTER_AUTH_SECRET` when none
  is set. Production must fail to start without one.
