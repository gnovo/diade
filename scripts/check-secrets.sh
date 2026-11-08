#!/usr/bin/env bash
# Scans commits about to be pushed (vs origin/main) for secrets. Skips with a warning if gitleaks is missing (CI enforces it).
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v gitleaks >/dev/null; then
  echo "gitleaks not installed - skipping (brew install gitleaks). CI still scans." >&2
  exit 0
fi
base=$(git merge-base HEAD origin/main 2>/dev/null || echo "")
gitleaks git --no-banner --redact ${base:+--log-opts="$base..HEAD"}
