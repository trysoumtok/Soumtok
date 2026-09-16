---
name: verify-ui
description: Look at the running localhost page after npm run dev. Use when building a website, landing, 3D app, or when the user asks if it works / looks right.
---
# Verify the running UI

Terminal logs are not a screenshot.

After `read_terminal` shows `http://localhost:PORT`:

1. `browser({ action: "snapshot", url: "http://localhost:PORT" })`
2. If the snapshot shows a Vite/TS overlay or blank body, `diff` the src/ files, then snapshot again.
3. Click a primary control with `browser({ action: "click", selector: "button" })` when the feature is interactive.
4. Tell the user what is on the page (title, headings, errors) plus the URL.
