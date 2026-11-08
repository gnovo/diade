# PR E: markdown import and export

Wireframes 10 and 11. Depends on B only, so it can ship before C and D if wanted.

## The constraint that shapes it

`apps/mobile/package.json` has no `expo-document-picker`, `expo-file-system` or `expo-clipboard`. Adding
any native module changes the native fingerprint, which silently stops over-the-air updates reaching
installed apps until a new APK is released (see `docs/architecture/environments.md`). So:

- **Ship paste first.** A text area needs no native code and reaches both phones by OTA.
- **A file picker means a new APK.** Treat it as a separate decision: either accept an APK release for it,
  or skip it. The Android share sheet ("share a .md file to Díade") is also native config.
- **Export** can use React Native's built-in `Share.share({ message })`, no native dependency.

Check `pnpm fingerprint` before and after any dependency change.

## Format (start narrow)

```md
# Spaghetti carbonara
servings: 4
tags: pasta, quick        (read and ignored in v1: there are no tags)

## Ingredients
- 400 g spaghetti
- 200 g guanciale

## Steps
1. ...
```

- A top-level `# ` heading starts a recipe, so one file can hold many.
- `servings:` (also `doses:`, `porções:`); default 4.
- The ingredient list is under a heading matching `ingredients|ingredientes` (case and accent
  insensitive). Everything after, or under other headings, becomes `notes`.
- Bullets (`-`, `*`, `•`, `1.`) are stripped by `parseIngredientLine` already.
- You have two Obsidian-style vaults in the working directories, so real notes will be the test input.

## Review step (never import silently)

For each recipe, show every line as read. A line is **flagged** (outlined, "?", Fix action) when the
parser cannot be sure. `parseIngredientLine` never fails today, so add a strictness signal:

- a leading number followed by a word that looks like a measure but is not a metric unit: `knob, handful,
  bunch, dash, splash, can, tin, slice, packet` and `molho, lata, fatia, ramo, punhado, dente, pacote`;
- a number with no name, or text that is only a quantity;
- a unit-looking token the table does not know.

Conversions are shown ("454 g, from 1 lb"). Recipes with no flagged lines collapse.

## Export

"Copy recipe as markdown" in the detail screen, using the same format, so a recipe survives a round trip.
A formatter in domain next to the parser, with a round-trip test (parse(format(r)) equals r).

## Tests

A fixture folder of realistic markdown (English, Portuguese, mixed bullets, several recipes per file,
missing sections), the parser's flagged cases, and the round trip.
