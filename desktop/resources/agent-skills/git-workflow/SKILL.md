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
6. For GitHub PRs use `mcp(server: "GitHub", tool: …)` if connected, else `gh` via terminal when the user asked to publish.
