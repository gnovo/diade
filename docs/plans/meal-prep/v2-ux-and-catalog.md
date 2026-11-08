# Meal prep, next round: UX and the ingredient catalog

Decided in a brainstorm on 2026-11-08 after walking the app on a device. Each step below starts with wireframes in
`design/meal-prep/` (edit `build_wireframes.py`), and nothing here is built yet.

## Order

1. **Quick wins**
   - A new Compras list starts empty. Today "Empty" still shows pre-ticked starter items (milk, eggs, bread...). Remove them for
     the groceries template only; the list already has a "frequently added" row. Pharmacy and travel keep their checklists.
   - Step 2 of the new-list wizard becomes two clear tiles: **Empty list** and **From a plan** (this week, next week, or pick
     recipes). Choosing a plan there selects or creates it. Replaces the small "Start from" switch.
   - **Import** leaves the bottom of the New recipe sheet. The + in Recipes opens a chooser: **Write a recipe** or **Import**
     (paste text; later a link or a photo). The label never says "markdown".
2. **Plano redesign** (below).
3. **Recipe sections and cooking view** (below).
4. **Catalog**: PR F, G, H (below).

## Plano

What was wrong: nine elements in one column with no hierarchy. The period chips look like tabs but are a "which week" parameter.
"New plan" is plain text next to a full-weight red "Delete plan". "Update from plan" lives on another screen. "Plan", "period"
and "shopping list" are used loosely.

Direction (weekly pool, decision 14):
- A week header with `‹ 9-15 Nov ›` pages between weeks. A plan exists for every week; the first recipe added creates it. Clearing a
  week moves to an overflow menu. No "New plan" and no "Delete plan".
- One primary action, "Add recipes". Recipes are compact cards with a servings stepper; remove by swipe or overflow.
- A shopping card below: "6 items, 2 bought" with Open, or Create list when there is none. A "plan changed, list out of date" badge
  sits there and opens the existing update diff (replacing the buried action).
- Per-day slots stay out (decision 5).

## Recipe sections

- Storage: the `notes` column stays one markdown body (decision 15). No migration. `recipeMarkdown.ts` import and export are unchanged
  apart from reading the known headings.
- Editor: **Steps** (a list, add, remove, reorder; written as a numbered list under `## Steps`), **Notes** (free text), **Source**
  (a link or an author). A section the app does not know is kept as free text.
- Reading: a proper detail view and a **cooking view** (large step text, tick off ingredients, screen kept awake).

## Ingredient catalog

Model:
- `ingredients` per space, synced like recipes: `id, space_id, creator_id, name, match_key, aliases (jsonb), staple (default),
  aisle (nullable), default_unit_family (nullable), merged_into_id (nullable), created_at, updated_at, deleted_at`.
  Unique `(space_id, match_key)`.
- Built-in en/pt-PT dictionary in code (synonyms, staples, aisles). A space's row is created on first use, from the dictionary
  when it matches; so there is no per-space seed and the dictionary improves over the air.
- A recipe line: `{ id, name (as written), ingredientId?, quantity, unit, staple (override, null = inherit) }`. Display and markdown stay
  name-based; no id marker in the markdown. Import resolves a name through aliases to an id.
- Merging is first-class: set `merged_into_id`, add the alias, repoint recipe lines. The duplicate suggestion in the grocery review
  (follow-up 2) becomes "merge and remember".

Traps:
1. **Stored list keys.** Items store contribution keys like `meet|mass`. Keep the row key derived from the canonical *name*, and resolve
   stored keys through the alias map before the diff, or every existing list breaks on its next "Update from plan".
2. **Backfill is lazy** (decision 13): resolve a line without an id by name on read or save, with an upsert on
   `(space_id, match_key)` so two phones cannot create duplicates. The grocery builder falls back to the match key until resolved.
3. **Deploy order**: migration to the Neon dev branch first (`cd apps/api && DATABASE_URL="$(neon connection-string dev)" npx drizzle-kit migrate`),
   Worker with `--env dev` only, migration before Worker. Any data statement must be safe to re-run.
4. **Conflicts**: aliases are a set (add or remove), so two people editing at once rarely collide; last write wins per entry.

Slicing:
- **PR F**: entity, sync (checklist in `README.md`), resolver, typing help and import resolution. Little visible change.
- **PR G**: an Ingredients screen (rename, aliases, merge, staple) and the merge from the grocery review remembered.
- **PR H**: group the grocery list by aisle.
