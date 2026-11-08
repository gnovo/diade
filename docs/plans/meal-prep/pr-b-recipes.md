# PR B: recipes (in review)

Wireframes 01 and 02. Branch `feat/recipes`.

## What it adds

- Recipes as a synced, shared entity (see the checklist in README.md).
- The Lists tab gets a Lists | Recipes switch. Recipes shows a searchable library (search matches
  ingredient names too), a detail screen and a bottom-sheet form (same pattern as adding a list).
- `packages/domain/src/recipes.ts`:
  - `parseIngredientLine(text)`: reads English and Portuguese, converts to metric. `400 g de esparguete`,
    `2 colheres de sopa de azeite`, `1 lb beef` (454 g), `1½ tsp salt`, `sal q.b.` (null quantity).
    A number counts as a quantity only when it stands apart from the name or is glued to a unit, so
    `7up` and `2% milk` stay names.
  - `formatAmount` / `formatIngredient` (1500 g reads as 1.5 kg; decimal separator is `,` for pt).
  - `isLikelyStaple(name)` and `ingredientFromLine(id, line)`.
  - `normalizeIngredientName` (lowercase, strip diacritics): the key PR C merges on.
- Migration `0007_recipes`.

## Behaviour worth remembering

- The form accepts a half-typed ingredient on Save, so nobody loses a line by tapping Save first.
- Editing an ingredient keeps the member's staple choice unless the ingredient became a different thing.
- Updates send only changed fields, so a partner's concurrent edit to another field survives.
- Servings 1 to 50, up to 100 ingredients per recipe, notes up to 5000 characters.

## Known gaps (deliberate)

- No tags, photos or steps field: `notes` holds steps. No per-ingredient note.
- `clove`/`dente` are not units: `3 cloves garlic` parses as a count of 3 with the name "Cloves garlic".
  Revisit in PR E when real recipes show how often it matters.
- English plural vs singular (egg/eggs) is not normalised yet. PR C needs it for merging; see there.

## Verified

Domain 93 tests, validation, authz and mapping tests; on a Pixel 6 against the dev API: create with
mixed ingredient styles, pantry auto-flag, edit, search, delete, sync reported "Sincronizado".

## Before production

Apply `0007_recipes` to the production database, then deploy the production Worker. Never the other
way round (see README.md).
