# Meal prep: handover after PR E

PRs A to E are merged (E is #22, squash commit `adbcbec`). This is the starting point for a fresh session on the
follow-ups. Read this file, then `README.md` (decisions, data model), `dev-notes.md` and
`docs/features/recipe-markdown.md`. Where they disagree, this file is newer on process and the code is newer on behaviour.

## What E shipped (so you do not rebuild it)

- Paste markdown into **Recipes → + (New recipe) → "Importar de markdown"** (under the notes, "or" separator, new recipes only), review
  every line, import the ticked recipes in one `writeBatch`. "Partilhar em markdown" on the recipe detail uses `Share.share`.
- Domain: `packages/domain/src/recipeMarkdown.ts` (parse, format, round trip), `recipes.ts` (`assessIngredientLine` and its flags,
  `2 x eggs` counts), `ingredientNames.ts` (`knownIngredientNames`, `suggestIngredientNames`, `similarKnownName`, `applyNameSuggestion`).
- UI: `ImportRecipesSheet.tsx`, name-suggestion chips in `RecipeForm.tsx`, `data/recipeImportActions.ts`.
- Spelling help already in place: names in use are offered while typing, and a name one typo from a more common one is flagged on import
  ("meet" for "meat", offers "Use Meat"). Nothing merges anything on its own. The typo rule is deliberately narrow: 4 to 5 letter
  words only match on a vowel slip or a swap of neighbours, so pear is not peas. Thresholds live in `isTypoOf`.
- CodeQL flagged three polynomial regexes in the parser; they are fixed with linear string steps and a hostile-input timing test.
  Keep that in mind: no new unanchored regex with adjacent or unbounded repeats on user text, and lines are cut at 5000 characters.

## Process rules for this repo (learned the hard way)

- **Biome:** never `npx biome` (it resolves to an unrelated npm package). Use `pnpm lint` / `pnpm format`; add a script to the root
  `package.json` if a narrower one is needed. (Also saved in memory: `feedback-biome-scripts`.)
- **Gate before pushing** (the pre-push hook runs the same): `pnpm typecheck`, `pnpm lint`, `pnpm i18n:check`, `pnpm knip`, and
  `npx vitest run --no-cache` in `packages/domain`, `packages/i18n`, `packages/validation`, `apps/mobile`. Everything passes on main now.
- macOS `sed -i` needs a backup suffix argument (`sed -i ''`); use a small Python script for multi-line edits.
- Commits: conventional (`feat:`, `fix:`, `chore:`), trailer `Co-Authored-By: Claude ...`; PR bodies end with the "Generated with Claude Code" line.
- **GitHub:** `gh` is logged in as `c-gnovo`. It can read PRs and comments and run `gh pr checks`, but the code-scanning alerts API returns
  403 (needs `admin:repo_hook`). Read the bot's review comments with
  `gh api repos/gnovo/diade/pulls/<n>/comments` instead. Pushing works through the SSH alias remote.
- New UI needs wireframes (`design/meal-prep/build_wireframes.py`, then `python3 design/meal-prep/build_wireframes.py`) and both locale
  catalogs (`en.ts`, `pt-PT.ts`, formal pt-PT).
- Do not publish OTA updates or run release scripts to test. Dev app only (`com.diade.app.dev`), dev Worker only (`--env dev`).

## Running and testing on the device

- Pixel 6, serial `22231FDF6004XF`, dev app `com.diade.app.dev`, Metro on 8081 (`adb reverse tcp:8081 tcp:8081` is in place).
- A Metro session started during E may still be running (log: the session scratchpad `metro.log`). If the app shows a red screen about an
  unresolvable module, Metro's cache is stale (this happened after a dependency install): stop it and start it again with a cleared cache:
  ```
  cd apps/mobile && APP_VARIANT=dev EXPO_PUBLIC_APP_ENV=dev EXPO_PUBLIC_API_URL=https://diade-api-dev.diade.workers.dev npx expo start --clear --port 8081
  ```
  The assistant's harness may deny `kill`; if so, ask the user to run it with the `!` prefix.
- After any `package.json` change run `pnpm install --frozen-lockfile` so `node_modules` matches the lockfile (it did not once, and Metro served the wrong versions).
- Typing on the device: avoid two r's close together in test text (React Native's reload shortcut); the Android keyboard autocorrects ("Sopa" became
  "Soap"); multi-line text is typed with one `keyboard` text step per line and an `enter` key step between. After a reload dismiss the LogBox
  banner (x 0.9655, y 0.9205). Take coordinates from the element tree, and do not chain a tap near the sheet header after a keyboard closes: a stray
  tap on the backdrop closes the sheet. Dismiss the keyboard and sheets with the `back` button. Never tap a contact in the system share sheet.
- Dev database now holds three test recipes from the device pass: **Bife, Guisado, Soap** (Meat/Meet/Butter/eggs lines). Delete them or reuse them as
  known ingredient names. Production is untouched.
- An Argent update (0.30.0 to 0.32.0) is pending; it needs the user's explicit consent, do not apply it unasked.

## Follow-ups, in the agreed order

### 1. Expo and dependency update (quick PR, branch from main)

The user wants Expo and its dependencies updated in a separate quick PR. During E someone ran an Expo update in the working tree (it was then
reverted; none of it is in main). That diff is a good starting list, but regenerate it, do not trust it:

| Package | main | the reverted diff |
|---|---|---|
| expo | ~58.0.22 | ~58.0.23 |
| expo-asset | ~58.0.19 | ~58.0.20 |
| expo-constants | ~58.0.14 | ~58.0.15 |
| expo-linking | ^58.0.15 | ^58.0.16 |
| expo-updates | ~58.0.20 | ~58.0.21 |
| react-native-safe-area-context | 5.10.1 | 5.11.1 |
| @sentry/react-native | ^8.33.0 | ^8.28.0 (**a downgrade**: that is Expo's pinned range; ask the user which they want) |

Metro also prints "6 other packages may need updating"; `cd apps/mobile && npx expo install --check` lists them.

Steps and traps:
1. `cd apps/mobile && pnpm fingerprint` before and after. `runtimeVersion` is the native fingerprint (`docs/architecture/environments.md`): expo-updates and
   Sentry are native, so expect it to change. If it does, this PR **cannot reach installed phones by OTA**; it needs an APK release. Say so in the PR description, do not publish it OTA,
   and do not merge without the user deciding on the release. Compare against the installed build's value (APK `assets/fingerprint`).
2. Keep it to dependencies (no feature work). `pnpm install` to refresh the lockfile, then the full gate.
3. `android/` is generated per variant: do not commit it; a dev build after the update may need `scripts/run-android-dev.sh` (it re-prebuilds for the dev variant).
4. Test on the dev app (Metro with `--clear`, then a real dev build if native modules changed). Never install a same-id debug build over production.
5. GitHub reported 5 Dependabot vulnerabilities on the default branch (1 high, 4 moderate); see
   https://github.com/gnovo/diade/security/dependabot and say in the PR which ones the update closes.

### 2. Possible duplicates at the grocery review (follow-up PR)

Goal: "Meat ↔ Meet, merge?" at the point where rows are about to be written, every merge confirmed by the user. Typing help and import flags (E) already
prevent most of it; this catches the rest. Never auto-merge (fuzzy matching also links unrelated words).

How rows work today (`packages/domain/src/mealPlan.ts`):
- `buildGroceryList` groups ingredients by `ingredientMatchKey(name)|unitFamily`. Key = lowercase, accent-free, trailing "s" dropped; tomato/tomatoes, aubergine/eggplant and
  cebola/onion do **not** merge; `1 kg meat` and `2 pcs meat` stay two rows by design.
- A `GroceryRow` carries `contributions` (one per recipe, each with its `key`). A stored list item keeps them in `list_items.contributions`.
- `diffPlanAgainstList` (used by "Update from plan") matches items to rows by `item.contributions[0].key`.

The trap to design around: if the review merges two rows into one item, the item's `contributions[0].key` is only the first row's key, so the next "Update from plan" sees the
second key as a brand-new row and proposes it again. Either make the diff treat **every** contribution key of an item as seen, or persist the merge so that
`buildGroceryList` produces the merged row itself next time. The second option is an alias map, which is the catalog's job (item 3); decide with the user whether a one-off merge
(first option, a small and safe change) is enough for this PR.

Where it goes: the wizard review step (`NewListWizard.tsx`, `reviewStep`, rows come from `buildGroceryList`) and the "Update from plan" diff sheet (`PlanListSection.tsx`, `data/mealPlanActions.ts`, writes in `data/mealPlanWrites.ts`). Reuse `similarKnownName`/`isTypoOf` for candidate pairs (pairs within the build, same unit family), show them as a
suggestion under the rows, merge sums quantities in the family's base unit. Needs wireframes (screens 05 and 09), both locales, domain tests for the pairing and the merge,
and a device pass.

**Status (branch `feat/grocery-possible-duplicates`):** done for the wizard review: `findPossibleDuplicates` and `mergeGroceryRows` in the domain, `applyMerges` in `newListFlow.ts`, a suggestion card with Merge, Keep separate and Undo, both locales, wireframe 09. The one-off option was chosen: `diffPlanAgainstList` now treats every contribution key of an item as seen and compares against the merged row, so "Update from plan" does not re-propose an absorbed row (verified on the dev app). **Not done:** suggesting merges for rows the "Update from plan" sheet proposes as new (wireframe 05 unchanged), and remembering a merge for the next list (the alias map, item 3).

### 3. Ingredient catalog (brainstorm and lock before any code)

The proper root fix for spelling and synonyms: a synced entity of ingredients with aliases, so recipes point at an ingredient instead of holding a free-text name.
It revisits **README decision 2** (ingredients live as a JSON array on the recipe) and decision 7 (staple flag per ingredient). Questions to settle with the user first:
- Per space (like recipes) or built in plus per-space overrides? Seed with the en/pt-PT staple dictionary and a synonym table?
- Does a recipe keep the written name and gain an `ingredientId`, or does the name move to the catalog? What happens to existing recipes (migration/backfill, must be re-runnable, see CLAUDE.md)?
- Where do aliases come from: user merges (item 2 feeding it), import, or a shipped list? Who can edit, and what is the conflict rule for two people editing it?
- Where does the staple flag and a unit-family/default unit live: catalog or recipe?
- Sync: a new synced entity (checklist in `README.md`), migration applied to the Neon dev branch first (`cd apps/api && DATABASE_URL="$(neon connection-string dev)" npx drizzle-kit migrate`), Worker deployed with `--env dev` only, and the deploy order matters (migration before Worker).
- Effect on markdown: `recipeMarkdown.ts` and the round trip stay name-based or gain an id marker?
Output of the brainstorm should be a decision section appended to `README.md`, then a brief `pr-f-ingredient-catalog.md`.

### 4. Smaller items already on the list

- "Update from plan" re-proposes rows the user left off in the wizard review: needs a dismissed-keys column on `lists` (a schema change: migration, dev branch first).
- A `.md` file picker or share target for the import: needs a native module (for example `expo-document-picker`), so a new APK; ask before adding any native dependency and run `pnpm fingerprint` before and after.
- Not done, by choice: names containing `*`, `__`, `~~`, backticks or `[[` are read as markup on import.

## Suggested first message for the next session

> Read docs/plans/meal-prep/follow-ups-handover.md, README.md and dev-notes.md in that folder. Start with follow-up 1 (the Expo and dependency update PR): list what `npx expo install --check` wants, run
> `pnpm fingerprint` before and after, and tell me whether it changes before you commit anything. Do not publish an OTA update.
