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
