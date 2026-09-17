---
name: git-workflow
description: Git status, diff, commit, branch, and PR-safe habits. Use when the user mentions git, commit, branch, merge, push, PR, or source control.
---
# Git workflow

Prefer the `git` tool over `terminal("git …")`.

1. `git({ action: "status" })` before changing branches or committing.
2. `git({ action: "diff" })` to see unstaged work; `staged: true` after add.
3. Commit **only** when the user asked. Message: `git({ action: "commit", message: "…" })` — imperative, what/why.
4. Never `git push --force` to main/master. Never rewrite published history unless they said to.
5. Stay in the open folder. Do not clone into a new sibling folder unless they asked.
6. To push the open folder to GitHub: `github({ action: "publish" })` or `git({ action: "push", message: "…" })` (uses Soumtok GitHub OAuth). For PRs/issues use `mcp(server: "GitHub", tool: …)` when the GitHub connector is connected.
