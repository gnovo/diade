---
name: branch-workflow
description: How to handle git branches in this repo. Use whenever you are about to change code, commit, push, or finish a task. Branch from origin/main, commit with conventional commits, push, never open a PR, and hand the user a PR title and description.
---

# Branch workflow

The user opens and merges every PR. Your job ends at a pushed branch plus PR text.

## 1. Start from origin/main

Always branch from the freshly fetched remote main, never from the current branch or a stale local `main`:

```bash
git fetch origin
git checkout -b <type>/<short-kebab-name> origin/main --no-track
```

- Branch name prefix matches the commit type: `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`.
- If you are already on a feature branch that is unrelated to the new task, do not reuse it; start a new branch from `origin/main`.
- If there are uncommitted changes that belong to another task, stop and ask before switching.

## 2. Commit

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, with an optional scope (`chore(deps):`). Lefthook's commit-msg hook rejects anything else.
- One logical change per commit. Keep the subject under about 72 characters, imperative, no trailing period.
- Run the gate relevant to the change first (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm i18n:check`, `pnpm knip`). Never skip hooks with `--no-verify`.
- Never commit `android/`, `.env*` or secrets.

## 3. Push

```bash
git push -u origin <branch>
```

Push after committing so the work is never only local. Never force-push a branch the user may already have opened a PR from without asking. Never push to `main`.

## 4. Never open a PR

Do **not** run `gh pr create`, use the GitHub API to create a PR, or merge anything. The `gh` account here cannot do it and the user does it themselves.

## 5. Tell the user what to write

After pushing, finish with:

1. The compare link: `https://github.com/gnovo/diade/pull/new/<branch>`
2. **PR title**: the same conventional-commit style as the commit (for a multi-commit branch, a summary in that style).
3. **PR description** in a fenced markdown block ready to paste, containing:
   - **What**: what changed and why, in a few lines.
   - **Verification**: which checks ran and passed, and anything **not** run, stated plainly.
   - **Risk / rollout**, when relevant:
     - Native fingerprint (`cd apps/mobile && pnpm fingerprint`) before and after for dependency or native changes. If it changed, say it cannot ship over the air and needs an APK release.
     - Migrations: new migration file, and that data statements are safe to re-run.
   - **Follow-ups**, if any.

Do not add attribution lines inside the title. Keep the description factual; do not claim something was tested if it was not.
