#!/usr/bin/env bash
# Non-blocking reminder: mobile UI changed but nothing under design/ did.
# Always exits 0. Update wireframes with the `wireframe` skill (design/<feature>/index.html).
cd "$(dirname "$0")/.." || exit 0
base=$(git merge-base HEAD origin/main 2>/dev/null) || exit 0
changed=$(git diff --name-only "$base"..HEAD)
ui=$(echo "$changed" | grep -E '^apps/mobile/src/(screens|components|design|navigation)/' | grep -vE '\.test\.')
if [ -n "$ui" ] && ! echo "$changed" | grep -q '^design/'; then
  echo "⚠️  Mobile UI files changed but no wireframes under design/ were added or updated:"
  echo "$ui" | head -8 | sed 's/^/     /'
  echo "   If the change is visible, run the wireframe skill and add/update design/<feature>/."
  echo "   (Reminder only, not blocking this push.)"
fi
exit 0
