# Dev notes: things that cost time in this work

Read before the first device test or commit.

## Environments (see also docs/architecture/environments.md)

- The user's **production** app (`com.diade.app`) is installed on their phone and their partner's.
  Never install a same-id debug build and never run release or OTA scripts to test.
- The dev variant is `com.diade.app.dev` ("Díade Dev"), JavaScript from Metro, API `diade-api-dev`
  (`npx wrangler deploy --env dev`; a plain `wrangler deploy` is PRODUCTION) and the Neon `dev` branch.
- A new migration must be applied to the dev branch before the dev app can sync the new entity:
  `cd apps/api && DATABASE_URL="$(neon connection-string dev)" npx drizzle-kit migrate`. An assistant
  session may be denied running this; the user can run it with the `!` prefix. The dev branch endpoint is
  different from production's: check with `neon connection-string production` if unsure (redact the
  credentials when printing).
- Auth is Google-only. An assistant cannot sign in; the dev app on the user's Pixel 6 is already signed in.
- `runtimeVersion` is the native fingerprint. Native dependency or config changes break OTA for installed
  apps. `app.config.ts` must stay self-contained.

## Testing on the device (argent, Android)

- Metro is usually already running (started by the user). The phone reaches it through
  `adb reverse tcp:8081 tcp:8081`; if the app shows "Unable to load script", check
  `adb reverse --list` and re-add it.
- **React Native's dev shortcut reloads the app on a double "R"** (two r key events within about 200 ms).
  The test tool types quickly, so a string like "carbonara" reloads the app mid-test. Use test strings
  without two r's close together ("Spaghetti bolognese").
- After every reload a LogBox warning banner covers the bottom of the screen and swallows taps and the
  keystrokes then go to nowhere. Dismiss it (small x at about x 0.9655, y 0.9205) before interacting, and
  take a screenshot to confirm the field really has focus before typing.
- Interaction tools return the screen and the element tree: take tap coordinates from the tree, not from
  pixels.
- Jank measurement: `adb shell dumpsys gfxinfo com.diade.app.dev reset`, perform the interaction, then
  `dumpsys gfxinfo` and read "Janky frames" and the percentile lines.
- Pixel 6 serial `22231FDF6004XF`; port 8081.

## Repo conventions

- Prettier has no config file in the repo but the code is single-quoted and about 120 columns. When
  formatting new files use `npx prettier --single-quote --print-width 120 --write <files>`. The default
  (double quotes) produces large noisy diffs.
- English and Portuguese catalogs (`packages/i18n/src/locales`) must have the same keys; a test checks
  it. Portuguese is European (pt-PT), formal tone ("Adicione", not "Adiciona").
- Two `@diade/i18n` tests (`catalog.test.ts`: the auth tagline copy) already fail on `main` because the
  strings have a trailing period. Unrelated to this work; do not "fix" them as part of a feature PR.
- `TextField` accepts a `ref` (a plain prop in React 19).
- Commit trailers per the session: `Co-Authored-By: Claude ...` on commits, the "Generated with Claude
  Code" line on PR bodies.

## GitHub

`git remote` is `git@github.com-personal:gnovo/diade.git` (an SSH alias). The `gh` CLI has been logged in
as a different account (`c-gnovo`) that is not a collaborator, so `gh pr create` fails with "must be a
collaborator". Pushing works. Either run `gh auth login` for the owning account, or open the PR in the
browser (`https://github.com/gnovo/diade/pull/new/<branch>`).
