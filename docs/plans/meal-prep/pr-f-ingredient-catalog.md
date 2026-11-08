# PR F: ingredient catalog (data, sync, resolver)

Read [v2-ux-and-catalog.md](v2-ux-and-catalog.md) first; this brief only lists what F does. **Built** (branch `feat/ingredient-catalog`).

## As built

- Domain: `ingredientDictionary.ts` (about 45 en/pt-PT synonym groups, plurals included), `ingredientCatalog.ts` (`Ingredient`, `createIngredientResolver`,
  `DEFAULT_RESOLVER`, `ingredientId`, `missingIngredients`, `withIngredientIds`) and `ingredientKeys.ts` (`ingredientMatchKey` and `singularWord`, moved out of
  `mealPlan.ts` to avoid an import cycle). A name resolves through the household catalog, then the dictionary, then the catalog again (two passes, merges
  followed up to 8 hops). A name nothing knows keeps its old match key, so existing lists keep their keys.
- `buildGroceryList`, `diffPlanAgainstList` and `missingStaples` take a resolver (the dictionary alone by default). Stored row keys are resolved before the diff, so a list
  made before a synonym was known still matches its rows. So `tomato`/`tomatoes` and `aubergine`/`eggplant` now share a row, with or without a catalog.
- Entity `ingredients` (migration `0009_ingredients`): `id, space_id, creator_id, name, match_key, aliases jsonb, merged_into_id (no foreign key), timestamps`, and a unique
  index on `(space_id, match_key)` for live rows. The id is derived from the space and the match key, so two phones that add the same ingredient make the same row and the
  second insert is a no-op (`ON CONFLICT DO NOTHING`). Checked on a scratch Postgres: a repeated id and a different id with the same live key are both ignored.
- Mobile: `local_ingredients`, repository, pull section, `useIngredientCatalog()`. An entry is made on first use: saving or importing a recipe calls `stampIngredients`,
  which inserts the missing entries and stamps each line's `ingredientId` (so a recipe saved before the catalog gets its ids the next time it is saved).

## Moved to G

The brief above said F would also make the staple a catalog default with a line override, and have typing help and import resolve through aliases. Both wait for G:
the staple default needs the screen that sets it, and the typing help should use the catalog once members can edit it. Nothing writes aliases or `merged_into_id` yet;
G's merge does.

## Rollout order

Migration on the Neon dev branch, then the Worker with `--env dev`, then the app. A client that pushes `ingredients` to a Worker that does not know it gets a 400, which blocks
that client's whole sync, so the Worker goes first (production too, before any OTA).


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
