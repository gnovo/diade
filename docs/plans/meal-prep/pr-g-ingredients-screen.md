# PR G: Ingredients screen and remembered merges

Built on the catalog from [PR F](pr-f-ingredient-catalog.md). Wireframes 17 and 18, and a note on 09.

## As built

- **Remembered merges.** A merge confirmed at the grocery review is written to the catalog when the list is created (`rememberMerges`): later lists add the two
  names up without asking. A failure to write it does not undo the list.
- **Ingredients screen** (Recipes tab, a row above the search; full screen like the cooking view): each kept name with the names merged into it, **Merge two names**
  (pick the name lists should use, then the name that is also it, then confirm), **Separate** (undo one merge) and **Rename** (the name lists use; recipes keep what was written).
- **Catalog names on grocery rows.** A row shows the household's name for the ingredient when it has one (`resolver.name`), else the name the first recipe wrote.
- Domain (`ingredientMerges.ts`, pure and tested): `planMerge`, `planSeparate`, `planRename`, `mergedGroups`. A merge is one or two writes, merging into the end of a chain when the
  kept name is itself merged, and refused when the two names already resolve to one ingredient (including through the dictionary).
- Rows are made only here and at the review, never when a recipe is saved. Nothing in this PR changes the schema.

## Not in G

- **Staple default** (decision 12, a catalog default with a recipe-line override). It needs a column on `ingredients` (a migration) and a change to how a recipe line stores its
  flag, so it is its own PR.
- Free-typed aliases (merging covers the cases so far), and merge suggestions inside the "Update from plan" sheet.
- Typing help and import resolving through the catalog.
- Aisle grouping (PR H).

## Checked on a device (dev backend)

Merge two names, see it on the screen and on the server (two catalog rows from a two-mutation push), restart the app (it stays), rename, separate, and confirm a merge at the
review and create the list (the catalog row is updated; a push of nine mutations succeeded). With the merge in place the review shows one row and no suggestion.

## G2: pantry staples on the catalog

- Migration `0010_ingredient_staple`: a nullable `staple` boolean on `ingredients` (true, false, or null for "not decided"). Synced like the other columns; locally `local_ingredients.staple` is added to
  existing installs by `migrateLocalSchema`, and `null` survives the round trip (`NULLABLE_BOOLEAN_KEYS` in the row mapping).
- **The household's call wins.** `buildGroceryList` treats an ingredient as a staple when its catalog entry says so, else by the flag on the recipe line; a name merged into another shares its setting.
  (Decision 12 as first written, a catalog default with a per-line override, was dropped: every existing recipe line already carries an explicit flag, so the default would have done nothing.)
- The Ingredients screen gets a **Pantry staples** section: every ingredient the recipes use once, with a Pantry switch; one tap is one write (`planSetStaple`, tested). Nothing is rewritten in recipes.
- Rollout: migration 0010 before the Worker, the Worker before the app. An old Worker rejects the `staple` field (zod strips it), so a staple change would be silently dropped until the Worker is updated.
