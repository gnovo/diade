# Health: nutrition, targets and training blocks

Recipes get calories and protein, each member can set daily targets, and training lives on the calendar as
flexible blocks instead of fixed appointments. This folder is the single source of context so each PR can be
built in a fresh session: read this file, then the PR's section below. Wireframes: `design/health/index.html`.

## Goal

> Help the household lose weight without making the app feel like a diet app. Every recipe shows its calories
> and protein per serving; a member who wants it sets targets and sees the week's plan measured against them,
> with room for flexible meals. Training is planned as blocks that fit a chaotic day and a two-week work
> cycle, and it shows on the Díade calendar and in Google Calendar. Watch data (Pixel Watch 3 and a Samsung
> watch, both on Android) ticks the blocks off later.

## Who it is for (brainstorm, 2026-11-12)

The first user is Gonçalo: male, 38, 172 cm, 87 kg (BMI about 29.4), desk job from home, sedentary today.
He has a walking pad (up to 6 km/h), a yoga mat, a Pixel Watch 3, and may buy adjustable dumbbells and a smart
scale. His partner has a Samsung watch and no targets for now. Both phones are Android.

Starting numbers (Mifflin-St Jeor; estimates, not medical advice, and editable in the app):

| | Per day |
|---|---|
| Resting energy | about 1,760 kcal |
| Maintenance, sedentary (x 1.2) | about 2,100 kcal |
| **Target** | **1,750 kcal** (about -350 to -500 a day once walking is added; 0.4 to 0.5 kg a week) |
| **Protein** | **140 g** (about 1.6 g per kg; about 35 g per meal, 15 to 20 g per snack) |
| **Water** | **2.5 to 3 L** from drinks; more on training days |
| **Coffee** | up to 4 espressos (400 mg caffeine), the last before 15:00. Black is about 0 kcal; a galão about 100 |

**Flex budget, not cheat days.** About 1,000 kcal a week above the target, spent however the week goes:
two or three flexible meals (a homemade burger, the tortilla pizza: about +250 to +350 each over a normal meal)
or one free meal out (+1,000) and one flexible. Ordinary days then land near 1,650. Two free meals out a week
would cancel most of the weekly deficit, which is why the budget is in kcal, not in meals.

## Decisions (and why)

Settled in the brainstorm. Do not reopen them without a reason.

1. **Nutrition is computed from the ingredients, with an override** (option C of three; typed-only and
   computed-only were rejected). Typed values go stale when a recipe is edited; computed values need data
   for every ingredient. So the recipe computes, shows how much of it is covered, and a member can type the
   per-serving numbers when they trust a label more.
2. **Only calories and protein.** Fat, carbs and fibre are out of v1: they add columns and screen space and do
   not change what gets cooked.
3. **Nutrition values follow the catalog's own rules** (decisions 11 to 13 of `docs/plans/meal-prep`). A
   built-in table in code (`packages/domain/src/ingredientNutrition.ts`) gives kcal and protein per 100 g for
   a resolved match key, plus grams per `unit` for counted things (1 egg = 50 g). A household value lives on
   the catalog row and wins, and a row is created only when a member types one. Recipe lines stay as they
   are: no ids, no backfill. Raw and cooked are different keys ("frango cozido" is not "peito de frango").
4. **Units convert to grams by rule.** `g`, `kg` directly; `ml`, `l` at density 1 unless the table says
   otherwise (olive oil 0.91); `tbsp` 15 ml and `tsp` 5 ml; `unit` through grams per unit; `pinch` and
   "to taste" lines count as zero and do not lower coverage.
5. **Tracking is planned only.** The app measures the week's plan against the targets; nobody logs what they
   actually ate. A food diary may come later; it is out of this plan.
6. **Targets are per member, off by default.** A member who turns nutrition on sees the targets, the plan
   summary and the Today card; a member who leaves it off sees the app as it is today, except the kcal and
   protein line on recipes, which is household information. Targets live on the member, not the space.
7. **A plan is still a weekly pool** (meal-prep decision 5). With no days, "per day" means the plan's total
   for one person divided by seven: the plan's servings are household servings, so the summary divides by the
   number of members who eat (the plan's servings / the recipe's servings, split evenly for v1).
8. **Training is blocks with weekly goals, not appointments.** A block is a window in which one session fits
   ("Strength · 18:00 to 19:30 · 40 min"). The week has a goal per kind (3 strength in week 1). A session done
   in any block counts; a missed block is not a failure and the goal does not move. There are always more
   blocks than the goal, so a chaotic day never breaks the week.
9. **The two-week work cycle is an anchor plus `INTERVAL=2`.** A member stores the Monday of a week 1
   (2026-11-09). Blocks that differ between the weeks are two recurring events, `FREQ=WEEKLY;INTERVAL=2`,
   one starting on the week-1 Monday and one on the week-2 Monday. No new recurrence concept.
10. **Blocks are personal events with category `workout`.** They need no new table. They show as free
    (transparent) in Google Calendar so they never block a meeting.
11. **Dog walks stay where they are.** They are already in Google Calendar and reach Díade through the
    existing sync. They are reserved household blocks; either member may take one, and a walk the partner takes
    frees the block for the walking pad or yoga. They count towards steps, not training.
12. **Google Calendar gets write access only for blocks**, into one dedicated calendar ("Díade · Treino") so
    it is easy to hide or remove. The current sync is read-only, so this is a scope change and a new consent.
13. **Watch data comes from Health Connect** on the phone: both watches already write to it (Fitbit and
    Samsung Health). One Android integration covers both. It needs a native module and an APK release.

## The default week

Fixed points, from the work rhythm and the dog. All times are Europe/Lisbon.

| Time | Every weekday |
|---|---|
| 07:00 to 08:00 | Dog walk (20 to 30 min, reserved) |
| 08:00 to 09:15 | Focus |
| 09:15 to 12:00 | Standup, then calls: **walking pad block** (30 to 60 min at 4 to 5 km/h) |
| 12:00 to 13:00 | Lunch, or a spare strength block |
| 13:00 to 14:00 | Dog walk (reserved) |
| 14:00 to 17:00 | Focus |
| 17:00 to 18:00 | Dog walk (reserved) |
| 18:00 to 19:30 | **Strength block** (40 min) |
| 20:15 to 21:00 | **Yoga block** (20 min) |
| 21:00 to 22:00 | Dog walk (reserved) |

What changes between the weeks of the cycle:

| | Week 1 (implementation) | Week 2 (freezes, release) |
|---|---|---|
| Strength goal | **3** | **2** |
| Strength blocks | Mon 18:00, Wed 18:00, Fri 15:00 (the learning slot), Sat 10:00 | Mon 18:00, Sat 10:00, Sun 10:00 |
| Yoga goal | 2 | 3 (wind down during the crunch) |
| Yoga blocks | Tue, Thu 20:15; Sun 18:00 | Tue, Wed, Thu 20:15; Sun 18:00 |
| Walking pad | every weekday morning | every weekday morning, and Wed and Thu afternoons (QA and waiting) |
| Batch prep | Sun 10:00 to 12:00 | Sun 15:00 to 17:00 (Sun morning may be a strength block) |

The strength sessions are full body with adjustable dumbbells: goblet squat, Romanian deadlift, floor
press, one-arm row, overhead press, lunges, plank, three sets of 8 to 12. Until the dumbbells arrive the saved
bodyweight workouts (`wiki/health/workouts` in the personal vault) fill the same blocks.

## PRs

Each one ships on its own and leaves the app working. Order is by value: H1 and H2 help this week.

| PR | Scope | Status |
|---|---|---|
| H1 | Nutrition table, recipe kcal and protein, coverage, override | planned |
| H2 | Prod content: values for every ingredient in use, 15 new recipes | planned (after H1) |
| H3 | Member profile: nutrition on or off, targets; plan summary; Today card | planned |
| H4 | Training blocks: `workout` category, cycle anchor, weekly goals | planned |
| H5 | Write blocks to Google Calendar | planned (after H4) |
| H6 | Health Connect: done sessions, steps, weight | planned (APK release) |

### H1 · Recipe nutrition

- `packages/domain/src/ingredientNutrition.ts`: the built-in table, keyed by the resolver's match key, with
  `kcalPer100g`, `proteinPer100g`, optional `gramsPerUnit` and `mlDensity`. Sources: INSA's Tabela da
  Composição de Alimentos first (Portuguese foods), USDA FoodData Central second. A test checks every entry is
  in range (kcal 0 to 900, protein 0 to 100 per 100 g).
- `recipeNutrition(recipe, catalog)`: per-serving kcal and protein, and coverage (the share of the recipe's
  grams that had data). Pure and tested.
- Catalog rows gain `kcal_per_100g`, `protein_per_100g`, `grams_per_unit` (nullable). Recipes gain
  `nutrition_override jsonb` (`{ kcal, protein }` per serving, nullable). Additive migration, no backfill.
- Recipe detail: a "Per serving" card (kcal, protein, coverage, "Edit"). Library cards: `520 kcal · 38 g`.
  A **High protein** chip: at least 8 g of protein per 100 kcal. Ingredients screen: the values per row,
  editable.
- Markdown import and export read and write `kcal:` and `protein:` (per serving) as the override.

### H2 · Prod content

Not code: a reviewed data change, applied through the API as a member, never in a migration.

- Values for all 64 ingredient names in use, checked by hand where the name is ambiguous (cooked or raw,
  drained or not). What the table covers ships in H1; what it cannot know goes on the catalog.
- Set a type on "Peixe assado em papelote" (meal).
- About 15 new recipes as markdown, imported through the app: mostly **prep** (4 to 6 servings, Sunday batch)
  and **snacks** (the library has 1 and 2), plus lighter versions of six saved in the vault (healthy kebab
  wrap, shredded chicken, shakshuka, mayonnaise chicken, arroz de peixe, bulgur salad). Targets: a meal 450 to
  550 kcal with at least 35 g protein; a snack 150 to 250 kcal with at least 15 g.

### H3 · Targets and the Today card

- `space_members` gains `nutrition_enabled boolean default false` and `nutrition_targets jsonb`
  (`{ kcal, protein, waterMl, flexKcalPerWeek }`). Profile → You → **Nutrition**: the toggle, the targets
  (prefilled from the numbers above when the member enters age, height, weight, sex and activity once; the
  inputs are not stored, only the targets), and the flex budget.
- Plan screen: a summary under the week, per person per day, against the targets, with the flex budget
  ("Flexible meals use 640 of 1,000 kcal"). A recipe marked flexible (by name today, "(flexível)"; a flag later)
  draws from the budget.
- Today, for a member with nutrition on: one card with today's planned kcal and protein against target, the
  water and coffee reminders (no logging), and the week's training goals.

### H4 · Training blocks

- Event category `workout`, with a kind (`strength`, `yoga`, `walk`, `other`) and a duration in minutes. Personal
  by default. Calendar shows blocks as dashed windows, so they read as optional.
- `space_members.cycle_anchor date` (a week-1 Monday). A "Set up my training week" sheet writes the default
  week above as recurring events, which the member then edits like any event.
- Weekly goals per kind and per cycle week, on the member (`training_goals jsonb`). Marking a block done is a
  tap until H6; the Today card and the week show "2 of 3 strength".

### H5 · Google Calendar

- Ask for `calendar.events` (or `calendar.app.created`, which only reaches calendars the app made: check
  which Google offers to this client first) and create the "Díade · Treino" calendar.
- Push `workout` events one way, with `transparency: transparent`. Edits in Google to these events are read
  back by the existing sync.

### H6 · Health Connect

- A native module (`react-native-health-connect` or a current equivalent, with its Expo config plugin): read
  exercise sessions, steps and weight. **Changes the native fingerprint, so it needs an APK release**
  (see `docs/architecture/environments.md`).
- A session inside a block's window (or overlapping it) marks the block done. Steps feed the Today card.
- Weight: weekly weigh-ins from a smart scale that writes to Health Connect, or typed in; the chart shows the
  7-day trend, not the daily number.
- Check the state of the Fitbit Web API and Google Health API before deciding whether anything also needs a
  server-side integration. Health Connect is on-device and needs none.

## Open questions

- **Lunch time.** The plan puts a spare strength block at 12:00 to 13:00 and assumes lunch fits round it.
- **Per-member servings in a plan.** Decision 7 splits servings evenly; a member who eats more would want
  their own share. Wait for real use.
- **Which flexible meals.** A `flexible` flag on a recipe or on a plan entry, instead of the name suffix.
- **Dog walk ownership.** Marking who takes a walk would let the app suggest the freed block; it needs an
  assignee on events, which they do not have.
