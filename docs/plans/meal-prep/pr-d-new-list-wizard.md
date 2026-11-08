# PR D: new-list wizard

Wireframes 06 to 09. Depends on B and C. Replaces `NewListSheet` with a multi-step wizard in the same
family as `ImportantDateWizard` (a bottom sheet, progress bar, a footer that folds away on step 1).

## Steps

1. **Type**: the existing templates (groceries, pharmacy, packing, household, blank). Tapping one
   advances after about 260 ms (`ADVANCE_MS` in the date wizard).
2. **Name and start**: name field, and for Groceries only a "Start from: Empty | Meal plan" segmented
   control. Empty makes the footer read "Create list" and ends the flow here. Starter items from the
   template still apply on the Empty path (that is what `NewListSheet` does today).
3. **Recipes** (Meal plan path): the pick-recipes component from PR C plus period chips. Pre-selects
   recipes already in the plan for that period.
4. **Review**: the generated rows, each untickable (what you already have). Staples collapsed. Create.

Path length differs: Empty is 2 steps, Meal plan is 4. Show "Step n of N" with the right N.

## Hard part: a variable number of steps

`StepPager` (PR A) keeps height bookkeeping sized from `steps.length` at mount. Either key the pager by
path (`key={path}`) so it remounts when the path changes (simplest; the change happens on step 2, where
a remount is invisible if the step is kept) or make the bookkeeping dynamic. `StepProgress` already takes
`total` as a prop, so the bar can animate its segment count.

## Reuse, do not rebuild

- Motion: `StepPager`, `StepProgress`, `FoldingFooter`, `useReduceMotion` from `components/StepPager.tsx`.
- Sheet: `BottomSheet`. Pattern: `ImportantDateWizard.tsx` (state, `reset` after close, `advanceTimer`).
- Generation: the PR C domain functions. The wizard calls them for the preview, and creates the list
  and items in one go on Create (in a transaction if possible, so a failure leaves no half list).
- `ListsScreen.createList` currently takes `NewListRequest` from `NewListSheet`; extend or replace it.

## Detail

- Back keeps selections. Going back past step 2 and choosing another type resets path-dependent state.
- Keyboard: name field on step 2 submits to Continue.
- The Lists | Recipes | Plan switch should not remount (PR B already fixed that for two sections).
- Accessibility: progress announced as "Step n of N"; tiles are radios.

## Tests

Pure logic (which steps a path has, review row selection to items) in a small helper with unit tests.
Check the flow on device both ways (Empty and Meal plan) and with reduce motion.

## Decisions taken in the build (what shipped)

- **The Meal plan path makes a plan.** It inserts a `meal_plans` row (or, if a plan for exactly those dates has no
  list yet, puts the chosen recipes on it) and the list gets `plan_id`, all in one `writeBatch` with the plan first so
  it reaches the server before the list. So "Update from plan", provenance and the left-out staples group work with no
  change to `PlanListSection`. A plan already holding a list is never reused (one plan, one list): the wizard makes a
  second plan for the same dates, which the Plan tab shows under "Other plans". No schema change.
- **Step 3 pre-selects from the plan for the chosen dates** until the member picks or changes a recipe; after that the
  selection is theirs and a period change leaves it alone.
- **`RecipePicker` as a wizard step:** a `BottomSheet` is a `Modal`, so it would stack a sheet on the wizard sheet. The
  body was extracted as a controlled `RecipeChoiceList` (search, ticks, servings) that the sheet and step 3 both use.
- **Variable steps: no remount.** The pager always has four steps and steps 3 and 4 are empty until the plan path is
  chosen. Keying the pager by path would remount it, and the name field with its keyboard, whenever the Empty / Meal
  plan switch is toggled on step 2. `StepProgress` takes `total` (2 or 4); "Step n of N" is a live region.
- **Type step shows "Step 1 of 2"** (the path is not known yet). Choosing another type resets path-dependent state
  (start, recipes, review ticks); choosing the same one again keeps it. Back keeps everything.
- **Review:** untick = left off the list. Staples are a collapsed group, off by default; ticking one adds it, still tied
  to its recipes (as in PR C). Create is disabled with nothing ticked. Starter items apply only on the Empty path.
- **No recipes in the library:** the Empty / Meal plan switch is replaced by a hint to add recipes.
- Logic lives in `apps/mobile/src/data/newListFlow.ts` (tests: `newListFlow.test.ts`); writes in `newListActions.ts`.
  `NewListSheet` is gone; `ListsScreen` opens `NewListWizard` and gets the new list's id back.

## Known gap (follow-up, needs a schema change)

A row left off in the review is not remembered, so the list's "Update from plan" proposes it again under "To add".
The same already happens when a member deletes a plan item by hand. Fix: remember dismissed rows on the list (for
example a `dismissed_keys` column) and have `diffPlanAgainstList` skip them.

## Verified on the device (Pixel 6, dev build)

Meal plan path end to end (type, name, switch to plan, period chips, pre-selection from the 9 to 15 Nov plan, selection
cleared on a week with no plan, review, untick a row, add a staple, create): list opened with the plan banner and
sources, and synced to the dev Worker. Empty path with Pharmacy (no switch, starter untick). Back keeps the type; picking
another type resets Start from. Animation scales set to 0 (reduce motion) with a restart: the flow completes. Test
data was deleted afterwards. Not exercised: custom dates in the wizard, an iOS device.
