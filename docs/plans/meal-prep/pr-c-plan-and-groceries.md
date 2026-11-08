# PR C: plan and grocery generation

Wireframes 03, 04, 05. Depends on PR B. This is the heart of the feature and the riskiest logic, so
the merge rules live in `@diade/domain` as pure functions with heavy tests.

## Scope

1. **Plan** (third segment of the Lists switch): a period (default this week, chips This week / Next
   week / Custom) and a pool of recipes, each with its own servings.
2. **Pick recipes** component: multi-select with search (names and ingredients), a ticked row reveals a
   servings stepper. PR D reuses it, so build it as a standalone component, not inside the screen.
3. **Generate a grocery list** from the plan: creates a list (category groceries) and its items.
4. **Provenance and "Update from plan"** on the generated list.
5. **Staples** handling (below).

## Data

- `meal_plans(id, space_id, creator_id, starts_on date, ends_on date, recipes jsonb, created_at, updated_at, deleted_at)`
  where `recipes = [{ recipeId, servings }]`. Same reasoning as recipe ingredients: one entity, edited
  whole. Shared across the space. Plain date columns (`YYYY-MM-DD`), like important dates.
- `lists.plan_id uuid null`: which plan a list was generated from.
- On `list_items`, so an item can be recomputed and edited safely:
  - `contributions jsonb null`: `[{ recipeId, recipeName, quantity, unit }]`, what each recipe asked for.
  - `edited_by_hand boolean default false`: set when a member changes quantity or name.
  The existing `quantity` and `unit` text columns stay for display and for ordinary list items.
- Follow the entity checklist in README.md for `meal_plans`; the `lists` and `list_items` changes need
  their validation, apply and pull code extended too (the local SQLite columns need `addColumn`
  migrations in `migrateLocalSchema`, like `position`).

## Merge rules (pure functions in `packages/domain`)

Input: a plan's recipes with servings, plus the recipes. Output: merged rows with contributions.

1. **Scale** each ingredient by `servings / recipe.servings`.
2. **Group** by `normalizeIngredientName(name)` and unit family:
   - mass: g and kg, summed in g
   - volume: ml and l, summed in ml
   - spoons: tsp and tbsp, summed in tsp (1 tbsp = 3 tsp)
   - count: `unit`
   - pinch: its own family
   Rows in different families stay separate: `1 onion` and `200 g onion` are two rows. We do not guess.
3. **Quantity null** ("to taste") merges with anything of the same name and adds nothing.
4. **Display** with `formatAmount` (1500 g reads 1.5 kg) and round sensibly (no 333.3333 g).
5. **Names:** normalise plural vs singular before grouping (`egg`/`eggs`, `ovo`/`ovos`): a conservative
   rule, trailing `s` only, with a test table. Decide the exact rule here and record it.
6. **Staples** (`staple: true`) are excluded by default, collected separately, and returned so the UI can
   show "Pantry staples · N left out". Option `includeStaples` for the "add what I need" action.

## Update from plan

Explicit, with a diff, never silent:

- Recompute the desired items from the current plan.
- Compare with the list's items that came from the plan (`contributions` not null):
  - new recipe or higher servings: add or increase the row
  - recipe removed or lower servings: subtract only that recipe's share; remove the row at zero
  - `edited_by_hand` rows are never overwritten: show them as "kept as you edited"
  - checked-off rows stay checked; quantity changes are applied and the row is shown as changed
- Show the diff in a sheet, apply on confirm.

## Staples: the open design question

One binary flag may not be enough. Rice, pasta and tinned goods last a while but are not salt. Decide in
this PR whether a middle tier is wanted. Suggested path: ship the binary flag, add a "Pantry staples ·
N left out" group with one-tap add, and see whether the middle tier is missed in use. A true pantry
("I have this") that clears when you tick "need salt" is explicitly not in v1.

## Tests to write first (domain)

Scaling (4 to 6 servings), mass/volume/spoon sums across units, separate rows across families, null
quantities, plural normalisation, staple exclusion and `includeStaples`, update diff cases (added,
removed, scaled, hand-edited, checked).

## UI notes

- Plan lives in the Lists switch; `ListsScreen` already keeps the header and switch mounted and fades
  only the content (`entering={FadeIn...}`). Add a third section the same way.
- Period: store dates, show a localised range ("Mon 9 to Sun 15 Nov"). Open question: default start
  today, or the coming Monday?
- Create-list action navigates into the new list.

## Decisions taken in the build (what shipped)

- **Plural rule:** `singularWord` drops one trailing `s` from each word, for matching only (the shown name
  is the first spelling). Words of 3 letters or fewer and words ending in `ss`, `us` or `is` are left alone.
  Irregular plurals (`tomato`/`tomatoes`, `peach`/`peaches`, `pão`/`pães`) are deliberately not merged: two
  rows beat a wrong merge. The test table is in `mealPlan.test.ts`.
- **Staples:** one binary flag, as suggested. A merged row is a staple only if every ingredient feeding it is
  flagged, so a recipe where you do need the olive oil wins. The "Pantry staples · N left out" group adds a
  staple with one tap; it stays tied to its recipes, so "Update from plan" scales it instead of removing it.
  Revisit a middle tier (rice, pasta) only if it is missed in use.
- **Period default:** the Monday on or after today (a plan made on a Sunday is for the week that starts
  tomorrow). "This week" is one tap away. Storage is `YYYY-MM-DD` dates.
- **Plan shown:** the one running today, else the next to start, else the latest. Other plans are listed
  below it. A plan generates one list; after that the plan offers "Open list" (no second list).
- **Contributions** carry a `key` (`ingredientMatchKey|family`) beside what the brief listed, so an item is
  matched back to its row even if its name was edited. Amounts are stored in the family's base unit (g, ml,
  tsp, unit, pinch), already scaled to the plan.
- **Display:** list quantities are written with a `.` decimal whichever language wrote them, so both members
  compare the same text. 6 tsp reads as 2 tbsp only when it comes out even.
- **Hand edits:** there is no item editor yet. `edited_by_hand` is set when a quantity is typed over a
  checked plan item (the re-add path). When an item editor arrives it must set the flag too.
- **Update from plan** also refreshes provenance silently when the text is already right, and a hand-edited
  row no recipe asks for any more keeps its text but stops being a plan row.

## Verified on the device (Pixel 6, dev build)

Plan created (Sunday defaults to next week), recipe picked with servings 6, list generated with scaled amounts and
source recipes, staple added by one tap, plan raised to 8, diff showed 600 to 800 g, 3 to 4 and 750 g to 1 kg
(checked row stays checked), applied, and everything synced. Not exercised on a device: two recipes sharing an
ingredient (covered by the domain tests); the recipe form reset the app twice while typing a second recipe, cause
not found (no crash in logcat), so it is worth watching.
