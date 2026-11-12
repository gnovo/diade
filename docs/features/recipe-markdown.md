# Recipes as markdown

How Díade reads recipes from markdown (Recipes → + → "Importar") and writes them back ("Partilhar em markdown").
Code: `packages/domain/src/recipeMarkdown.ts` (reading, writing), `recipes.ts` (one ingredient line),
`recipeSections.ts` (the steps / notes / source inside a recipe's notes), `ingredientNames.ts` (typo detection). Tests and example notes: `packages/domain/src/recipeMarkdown.test.ts`,
`packages/domain/src/__fixtures__/recipes/`.

Reading never fails and never saves by itself: it produces drafts that the import sheet shows for review.

## Template

Copy this into a note (Obsidian or any app) and paste it into the import sheet.

```md
# Spaghetti carbonara
servings: 4
type: meal
tags: pasta, quick

A Roman classic. Anything written here ends up in the recipe's notes.

## Ingredients
- 400 g spaghetti
- 200 g guanciale
- 4 eggs
- 1 tsp salt
- 1/2 cup grated pecorino
- black pepper to taste

## Steps
1. Boil the pasta.
2. Fry the guanciale.
```

The Portuguese template reads the same way:

```md
# Bacalhau com natas
doses: 6
tipo: refeição

## Ingredientes
- 800 g de bacalhau demolhado
- 2 colheres de sopa de azeite
- 3 dentes de alho
- sal q.b.

## Preparação
1. Coza as batatas.
```

One note can hold several recipes. Each starts at a `# ` heading.

## What is read

| Part | Rule |
|---|---|
| Recipe | A top-level `# ` heading starts one and gives its name (120 characters). Text before the first heading counts only if it has an ingredient list; then the name comes from front matter `title:`, or is asked for. |
| Servings | `servings:`, `serves:`, `doses:` or `porções:` (any case). `4-6` reads as 4. Missing or below 1 gives 4, above 50 gives 50. Front matter `servings:` is used when the recipe has none. |
| Type | `type:` or `tipo:`: `breakfast` / `pequeno-almoço`, `meal` / `refeição`, `snack` / `lanche`, `prep` / `preparação` (any case, accents optional). A word that is none of them is dropped. Sharing writes it back as `type: meal`. |
| Nutrition | `kcal:` (or `calories:`, `calorias:`) and `protein:` (or `proteína:`), per serving, in the text before the first section. Both are needed; then they become the recipe's own values, which win over the ones worked out from the ingredients. `512,5` reads as 512.5; a trailing `g` is ignored. Calories above 5000 or protein above 500 are dropped. Sharing writes them back only when the recipe has its own values. |
| Tags | `tags:` is read and ignored. |
| Ingredients | The lines under a heading (any level `##`–`######`) or label (`Ingredients:`, `**Ingredientes**`) that contains "ingredient" or "ingrediente". Up to 100. |
| Steps, Notes, Source | A heading (or label) named Steps, Method, Instructions, Directions, Preparation, Passos, Preparação, Modo de preparo opens the **steps**; Notes / Notas the **notes**; Source / Fonte the **source**. Whatever the heading level or language, they are stored as `## Steps`, `## Notes`, `## Source` (see below). |
| Everything else | Becomes the notes, with the author's own headings kept (up to 5000 characters in all). |
| Inside Notes or Source | Everything is text, exactly as written, until a `## Steps`, `## Notes` or `## Source` heading (level 2). Ingredients, labels and fields are not read there. |

Bullets of any kind are accepted: `-`, `*`, `+`, `•`, `1.`, `1)`, and Obsidian checkboxes (`- [ ]`). Markup is stripped from
ingredient lines: `**bold**`, `[[wiki links]]` (an alias wins), `[links](url)`, backticks. A group label inside the list ("For
the sauce:") is dropped. Headings inside a code fence are ignored.

## Steps, notes and source (what is stored)

A recipe's `notes` column is one markdown text, written in sections the app edits (`recipeSections.ts`):

```md
## Steps
1. Boil the pasta.
2. Fry the guanciale.

## Notes
Never add cream.

## Source
https://example.test/carbonara
```

- Only the sections that have something are written. A step is one paragraph (line breaks become spaces).
- Text with no known heading (every recipe saved before sections existed) reads as notes, and is written back under `## Notes` the next time it is saved.
- Only these three level-2 headings are structure. Any other heading stays inside the free text.
- A line of free text that would read as one of them is written with a leading backslash and read back without it (`\## Steps`), so nothing a member types is lost.
- The recipe form shows the steps as a list, notes as free text and the source as a line; the share text and the import use the same sections.

## One ingredient line

`<amount> <unit> <name>`, English or Portuguese, converted to metric and stored as a number.

| Written | Stored |
|---|---|
| `400 g spaghetti`, `1 kg batata` | 400 g, 1 kg |
| `1 lb beef`, `1/2 cup milk`, `5 cl rum` | 454 g, 120 ml, 50 ml ("from 1 lb" is shown in the review) |
| `2 colheres de sopa de azeite`, `1½ tsp salt` | 2 tbsp, 1.5 tsp |
| `2 eggs`, `2 x eggs`, `3× tomatoes` | counted: 2, 2, 3 |
| `sal q.b.`, `black pepper to taste`, `pepper` | no amount ("to taste") |

Units: g, kg, ml, l, tbsp, tsp, pinch, and counted things. Imperial and other metric spellings convert (oz, lb, cup, mg, cl, dl).
A number counts as an amount only when it stands apart from the name: `7up` and `2% milk` stay names.

Pantry staples (salt, olive oil, azeite, sal, …) come from a built-in en/pt-PT list. A trailing `#pantry` or `#fresh` overrides it
for that line: `- 1 tbsp Truffle oil #pantry`.

## The review step: flagged lines

Every line is shown as it was read. A line the parser can only guess at is outlined with "?", a reason and a Fix action.

| Flag | When | On import |
|---|---|---|
| `looseMeasure` | a non-metric measure word: knob, handful, bunch, dash, splash, can, tin, slice, packet, clove, sprig, stick, molho, lata, fatia, ramo, punhado, dente, pacote, fio… | imported as written (`1 knob butter` is 1 of "Knob butter") until fixed |
| `unknownUnit` | a unit-looking token the table does not know: `2 pcs chicken`, `1 jar of pesto`, `3 pkt. noodles` | imported as written |
| `similarName` | one typo away from a name used more often in your recipes or in the same import ("meet" for "meat"); offers "Use Meat" | imported as written |
| `noName` | an amount with nothing to count: `400 g`, `2` | **left out** unless fixed |
| `outOfRange` | an amount that cannot be stored: `0 eggs`, over 100000 | **left out** unless fixed |

Fix opens the line as text. Confirming it clears the flag, unless the line still cannot be saved. Emptying it removes the line.
Each recipe has a tick: a recipe already in the library (same name) starts unticked, and one with no ingredients or no name
cannot be ticked until it has them.

## What is written

"Partilhar em markdown" on a recipe opens the system share sheet (it has Copy) with:

```md
# Spaghetti carbonara
servings: 4

## Ingredients
- 400 g Spaghetti
- 1500 g Guanciale
- 4 Eggs
- 1 tsp Salt
- 1 tbsp Truffle oil #pantry
- 2 g Salt #fresh

## Steps
1. Boil.
2. Toss.

## Notes
Anything in the recipe's notes, as is.
```

Amounts are written as stored (1500 g, not 1.5 kg) so reading it back gives the same numbers. Importing this text gives the
recipe back: name, servings, notes, every ingredient's name, amount and unit, and its pantry flag (`parse(format(r))` is tested
for that, including the cases below).

To keep it exact:

- `#pantry` / `#fresh` is written only where the built-in list would not give the flag back (salt flagged fresh, truffle oil flagged
  pantry), so ordinary lines stay clean.
- A name that starts with a digit and has no amount is written `\1000 Island dressing`.
- A counted item whose name starts with a unit word is written `2 x Cup noodles` (plain `2 Cup noodles` would read as 480 ml).
- A `# ` line inside steps, notes or source is written `\# ` so it does not start another recipe; reading removes the backslash.

Not preserved: ingredient ids (new ones are made on import), and a name containing `*`, `__`, `~~`, a backtick or `[[`, which
reading treats as markup.

## Not in v1

- Choosing a `.md` file or sharing one to the app: both need a native module (a new APK, no OTA).
- Tags, photos, nutrition.
