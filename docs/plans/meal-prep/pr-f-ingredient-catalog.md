# PR F: ingredient catalog (data, sync, resolver)

Read [v2-ux-and-catalog.md](v2-ux-and-catalog.md) first; this brief only lists what F does. **Built** (branch `feat/ingredient-catalog`).

## As built

- Domain: `ingredientDictionary.ts` (about 45 en/pt-PT synonym groups, plurals included), `ingredientCatalog.ts` (`Ingredient`, `createIngredientResolver`,
  `DEFAULT_RESOLVER`, `ingredientId`) and `ingredientKeys.ts` (`ingredientMatchKey` and `singularWord`, moved out of `mealPlan.ts` to avoid an import cycle).
  A name resolves through the household catalog, then the dictionary, then the catalog again (two passes, merges followed up to 8 hops). A name nothing knows
  keeps its old match key, so existing lists keep their keys.
- `buildGroceryList`, `diffPlanAgainstList` and `missingStaples` take a resolver (the dictionary alone by default). Stored row keys are resolved before the diff, so a list
  made before a synonym was known still matches its rows. So `tomato`/`tomatoes` and `aubergine`/`eggplant` now share a row, with or without a catalog.
- Entity `ingredients` (migration `0009_ingredients`): `id, space_id, creator_id, name, match_key, aliases jsonb, merged_into_id (no foreign key), timestamps`, and a unique
  index on `(space_id, match_key)` for live rows. The id is derived from the space and the match key (`ingredientId`), so two phones that add the same ingredient make the same
  row and the second insert is a no-op (`ON CONFLICT DO NOTHING`). Checked on a scratch Postgres: a repeated id and a different id with the same live key are both ignored.
- Mobile: `local_ingredients`, repository, pull section, `useIngredientCatalog()` feeding the resolver to the plan, the new-list wizard and "Update from plan".
- **No rows are written yet.** Nothing in the app inserts into `ingredients` until G (merge, rename, staple default). The table, the sync and the resolver are ready for it.

## Why rows are not made on first use

The first version made a row for every ingredient when a recipe was saved or imported, and stamped an `ingredientId` on each line. On the dev backend a save of a
three-ingredient recipe pushed four mutations (three catalog inserts and the recipe) and the Worker answered 503 `exceededCpu`, with the CPU capped at 10 ms and the
Worker's other per-request CPU unchanged. A recipe with ten ingredients would push eleven mutations, and an import of several recipes dozens, so the approach does not
fit the Worker's CPU limit. Rows are now made only when a member acts on an ingredient, which is one or two mutations. (The cause was inferred, not confirmed from
the Cloudflare side: check the plan and CPU limit of `diade-api-dev` in the dashboard.)

## Moved to G

The staple default (with a line override), the typing help and the import resolving through aliases wait for G: they need the screen that edits the catalog. Nothing writes
aliases or `merged_into_id` until G's merge does.

## Rollout order

Migration on the Neon dev branch, then the Worker with `--env dev`, then the app. A client that pushes `ingredients` to a Worker that does not know it gets a 400, which blocks
that client's whole sync, so the Worker goes first (production too, before any OTA). While nothing writes `ingredients`, an app update does not push the entity at all.
