# PR F: ingredient catalog (data, sync, resolver)

Read [v2-ux-and-catalog.md](v2-ux-and-catalog.md) first; this brief only lists what F does. Not started.

## Scope

- Synced `ingredients` entity per the checklist in `README.md` ("How to add a synced entity"). Unique `(space_id, match_key)`.
- Built-in en/pt-PT dictionary in `packages/domain` (synonyms, staple defaults, optional aisles). Pure and tested.
- Resolver: name -> ingredient (exact match key, then alias, then dictionary), creating the row on first use with an upsert.
- `RecipeIngredient` gains optional `ingredientId`; `staple` becomes an override (null = inherit). Existing recipes keep working with no id.
- Lazy backfill on read or save. `buildGroceryList` uses the resolved canonical name for its key and falls back to the match key.
- Stored contribution keys resolved through the alias map in `diffPlanAgainstList`.
- Typing help and import use the catalog (`ingredientNames.ts`).

## Not in F

The Ingredients management screen and merge UI (G), aisle grouping (H), any change to the markdown format.

## Checks

Migration applied to the dev branch first, Worker `--env dev` only. `scripts/check-migrations.sh` against a throwaway localhost database.
Tests: resolver, dictionary, backfill idempotence, grocery keys with aliases, diff with old stored keys. A device pass on the dev app,
including an existing list updated from its plan.
