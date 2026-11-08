# Meal prep: plan and reasoning

Five PRs that turn Lists into a place to plan meals and build a grocery list from recipes. This folder
is the single source of context so each PR can be built in a fresh session: read this file, then the
brief for the PR, then `dev-notes.md`. Wireframes: `design/meal-prep/index.html` (open it in a browser).

## Goal

> Start a "groceries" list by selecting one or more recipes. Recipes (meal prep) is a feature of its
> own: create, read, update and delete recipes, pick the ones to prepare for a period (default a
> week), and their ingredients land on the list, where they can be added and removed. Ingredients are
> metric, and recipes can be imported from markdown. Adding a list becomes a multi-step wizard, like
> adding a special date, with calmer animation.

## Status

| PR | Scope | Brief | Status |
|---|---|---|---|
| A | Wizard motion on the UI thread | [pr-a](pr-a-wizard-motion.md) | merged (#15) |
| B | Recipes: library, CRUD, metric parser, pantry flag | [pr-b](pr-b-recipes.md) | merged (#16) |
| C | Plan + grocery generation + merge rules | [pr-c](pr-c-plan-and-groceries.md) | merged (#17) |
| D | New-list wizard | [pr-d](pr-d-new-list-wizard.md) | merged (#18) |
| E | Markdown import and export | [pr-e](pr-e-markdown-import.md) | merged (#22); format in [recipe-markdown](../../features/recipe-markdown.md) |
| F | Ingredient catalog: data, sync, resolver | [pr-f](pr-f-ingredient-catalog.md) | built, awaiting the dev rollout |

Follow-ups after E, in order. Full detail, process notes and a starting prompt: [follow-ups-handover.md](follow-ups-handover.md).

1. **Expo and dependency update**, its own quick PR (check `pnpm fingerprint` before and after: expo-updates and Sentry are native, so it may need an APK release).
2. **Possible duplicates at the grocery review:** "Meat ↔ Meet, merge?" on the new-list wizard review and "Update from plan", every merge
   confirmed. E already offers known names while typing and flags near-miss names on import (`packages/domain/src/ingredientNames.ts`);
   this catches what those miss.
3. **Ingredient catalog** (a synced entity with aliases, so aubergine = eggplant and cebola = onion). The proper fix, but it revisits
   decision 2 (ingredients as JSON on the recipe): brainstorm and lock before building.
4. "Update from plan" re-proposes rows left off in the wizard review (needs a dismissed-keys column on lists).
5. A `.md` file picker / share target (new native module, needs an APK release).

Order for the next round: quick wins (empty Compras, Import chooser), Plano redesign, recipe sections and cooking view, then the
catalog in three PRs (F, G, H). See [v2-ux-and-catalog.md](v2-ux-and-catalog.md).

Dependencies: C needs B. D needs B and C (it reuses the recipe picker and the generator). E needs B
only, so it can move earlier if wanted. Update this table when a PR merges.

## Decisions (and why)

These were settled in conversation. Do not reopen them without a reason.

1. **Recipes are shared across the space**, like lists and important dates. Two people, one kitchen.
2. **Ingredients live as one JSON array on the recipe**, not as child rows. A recipe is edited and read
   whole, and sync stays one entity. Cost: if two people edit the same recipe at the same moment, last
   write wins on the whole array. Acceptable for a two-person household.
3. **Quantities are numeric and metric.** Units: `g, kg, ml, l, tbsp, tsp, pinch`, and `unit` for counted
   things (2 eggs). A quantity of `null` means "to taste". Imperial (oz, lb, cup) converts on entry
   (1 lb becomes 454 g). Numeric storage is what makes merging possible; the lists' existing free-text
   `quantity` column cannot be added together.
4. **pt-PT and English both.** Recipe and ingredient text is never translated; the parser and the staple
   dictionary understand both languages.
5. **A plan is a pool of recipes for a period, not a calendar.** No per-day slots in v1. The goal is
   "what are we prepping this week". Days can be added later as an additive column.
6. **One-way link from plan to list.** Generate once. After that the list is an ordinary list, and
   "Update from plan" is an explicit action that shows a diff. Silent two-way sync was rejected: it is
   the kind of magic that deletes things you added by hand.
7. **Pantry staples are a flag per ingredient** (salt, olive oil), pre-filled from a built-in en/pt-PT
   dictionary and overridable. Generated lists leave staples out by default and offer them in a
   collapsed group, so salt is not bought every week. PR C kept the single flag (see the brief).
8. **Navigation: the Lists tab gets a switch** (Lists | Recipes | Plan). Five tabs are already full.
9. **Out of v1:** nutrition, prices, photos, per-day slots, recipe tags.
10. **Shared motion.** Wizards use `StepPager`, `StepProgress`, `FoldingFooter` from
    `apps/mobile/src/components/StepPager.tsx`: Reanimated, UI thread, 460 ms, curve
    `bezier(0.32, 0.72, 0, 1)`, reduce-motion respected. The previous curve (0.2, 0, 0, 1) front-loaded
    nearly all travel into the first tenth of the duration and read as a snap followed by a stall.

## Decisions for the next round (locked in a brainstorm, 2026-11-08)

These extend the list above. Full reasoning and the slicing are in [v2-ux-and-catalog.md](v2-ux-and-catalog.md).

11. **An ingredient catalog is a synced entity per space.** The ingredients array stays on the recipe (decision 2 holds: a
    recipe is still edited and read whole) and each line keeps only the name as written. A built-in en/pt-PT dictionary in code
    joins synonyms and plurals for everyone; the household's own aliases and merges live in the synced catalog. **A catalog row is made
    only when a member does something that needs one** (a merge, a rename, a staple default), never on every recipe save: each row is one
    sync mutation, so a recipe with ten ingredients would push eleven for no visible benefit. (An earlier version of this note blamed the
    Worker's CPU limit; that failure was actually the `postgres` 4.0 bump, fixed by pinning 3.x. The decision stands on its own.)
    Brief: [pr-f-ingredient-catalog.md](pr-f-ingredient-catalog.md).
12. **Staples live on the catalog entry** (a default), and a recipe line may override it. This revises decision 7.
13. **Recipe lines carry no ingredient id** (revised from "lazy ids"). A line is matched to its ingredient by name, through the resolver, so no backfill and no rewrite of the JSON is needed.
14. **A plan stays a weekly pool** (decision 5 holds). A plan always exists for a week; there is no "New plan" or "Delete plan".
15. **Recipe structure is markdown in `notes`**: `## Steps`, `## Notes`, `## Source`, with a structured editor over it. Unknown
    sections are kept as free text so the round trip is lossless.
16. **A new Compras list starts empty.** Starter items stay only for the pharmacy and travel templates.

## Data model (current and planned)

Shipped in PR B:

- `recipes(id, space_id, creator_id, name, servings int default 4, notes, ingredients jsonb, created_at, updated_at, deleted_at)`
- `RecipeIngredient = { id, name, quantity: number | null, unit, staple: boolean }`
- Domain: `packages/domain/src/recipes.ts` (parser, formatter, staple dictionary). Validation:
  `createRecipeSchema` / `updateRecipeSchema` in `packages/validation`.

Shipped in PR C:

- `meal_plans(id, space_id, creator_id, starts_on date, ends_on date, recipes jsonb [{recipeId, servings}], created_at, updated_at, deleted_at)`
- `lists.plan_id` (nullable, FK with `ON DELETE SET NULL`); `list_items.contributions jsonb` (null for ordinary
  items) and `list_items.edited_by_hand boolean`.
- Domain: `packages/domain/src/mealPlan.ts` (merge rules, diff, periods). Writes for generate and update:
  `apps/mobile/src/data/mealPlanWrites.ts`.

Planned (details in the briefs): nothing else is added to the schema; D and E reuse these.

## How to add a synced entity (what PR B touched)

The same checklist applies to `meal_plans`:

1. `packages/domain/src/index.ts`: add the name to `SyncEntityName`, the field to `SyncPullResult`.
2. `packages/validation/src/index.ts`: schemas, `syncEntityNameSchema`, `syncPayloadSchemas`.
3. `apps/api/src/db/schema.ts` + `pnpm db:generate` in `apps/api` (rename the migration to something
   readable and fix the tag in `drizzle/migrations/meta/_journal.json`).
4. `apps/api/src/routes/sync.ts`: `authorizeMutation`, `applyMutation`, the pull query and response.
5. `apps/mobile/src/storage/sqlite.ts`: `CREATE TABLE`, `LOCAL_TABLES`; `data/repository.ts`:
   `ENTITY_TABLES`, `OWNED_ENTITIES`; `sync/engine.ts`: `PULL_SECTIONS`; `data/mapping.ts`: `JSON_KEYS`
   or `BOOLEAN_KEYS` if the new columns need it; `data/queries.ts`: a `getActive...` reader.
6. i18n in both `packages/i18n/src/locales/en.ts` and `pt-PT.ts` (a parity test enforces the same keys).
7. Tests: validation, authorisation (`sync.authz.test.ts`), mapping.

**Deploy order matters:** apply the migration to the database before deploying the Worker. A client that
pushes an entity an old Worker does not know gets a 400, which blocks that client's whole sync.

## Starting a session for a PR

1. Read this file, the PR's brief, and `dev-notes.md`.
2. Branch from an up-to-date `main`: `git checkout main && git pull && git checkout -b feat/<name>`.
3. Open `design/meal-prep/index.html` for the screens involved. To change a wireframe, edit
   `design/meal-prep/build_wireframes.py` and re-run it.
4. When the PR merges, update the status table above.
