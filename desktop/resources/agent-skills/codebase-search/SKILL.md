---
name: codebase-search
description: Find files by meaning in a real repo. Use when the folder already has source and the user asks where something lives, how auth works, or to fix a feature.
---
# Codebase search

On a non-empty project, do **not** start with list_dir of the whole tree.

1. `codebase_search({ query: "the feature in the user's words" })`
2. `read` the top 1–3 hits.
3. `grep` only if you need an exact symbol.
4. Then `diff` those files. Do not create a parallel copy of the app.
