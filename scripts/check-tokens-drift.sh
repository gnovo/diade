#!/usr/bin/env bash
# Fails if regenerating design tokens changes tracked files (generated output out of date).
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm --filter @diade/design-tokens generate >/dev/null
if ! git diff --quiet -- packages/design-tokens/src apps/mobile/global.css; then
  echo "Design tokens are out of date. Run: pnpm --filter @diade/design-tokens generate" >&2
  git diff --stat -- packages/design-tokens/src apps/mobile/global.css >&2
  exit 1
fi
