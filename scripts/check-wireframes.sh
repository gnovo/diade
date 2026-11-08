#!/usr/bin/env bash
# Non-blocking reminder: mobile UI changed but nothing under design/ did.
# Always exits 0. Update wireframes with the `wireframe` skill (design/<feature>/index.html).
#
# Changes that cannot alter what a screen looks like are ignored: formatting, import statements and
# comments. Each changed file's base version and current version are run through Biome, stripped of
# imports and comments, and compared.
cd "$(dirname "$0")/.." || exit 0
base=$(git merge-base HEAD origin/main 2>/dev/null) || exit 0
changed=$(git diff --name-only "$base"..HEAD)
echo "$changed" | grep -q '^design/' && exit 0

BIOME=node_modules/.bin/biome
[ -x "$BIOME" ] || exit 0

normalize() {
  "$BIOME" check --write --stdin-file-path="$1" 2>/dev/null |
    perl -0pe 's{/\*.*?\*/}{}gs; s{^\s*//.*\n}{}gm; s{^import\b.*?;\n}{}gms; s{\n\s*\n}{\n}g'
}

ui=""
for f in $(echo "$changed" | grep -E '^apps/mobile/src/(screens|components|design|navigation)/' | grep -vE '\.test\.'); do
  if [ -f "$f" ] && git cat-file -e "$base:$f" 2>/dev/null; then
    before=$(git show "$base:$f" | normalize "$f") || before="?"
    after=$(normalize "$f" < "$f") || after="??"
    [ "$before" = "$after" ] && continue # nothing visual changed
  fi
  ui="$ui$f"$'\n'
done

if [ -n "$ui" ]; then
  echo "⚠️  Mobile UI files changed but no wireframes under design/ were added or updated:"
  echo "$ui" | sed '/^$/d' | head -8 | sed 's/^/     /'
  echo "   If the change is visible, run the wireframe skill and add/update design/<feature>/."
  echo "   (Reminder only, not blocking this push. Formatting, import and comment changes are ignored.)"
fi
exit 0
