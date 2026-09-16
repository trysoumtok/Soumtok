# Why Claude opens inside a VS Code–compatible host

## How VS Code runs Claude Code (same as Cursor)

| Piece | Role |
|--------|------|
| **Workbench** | Activity bar, editors, panels (the “IDE shell”) |
| **Extension host** | Node process that loads `anthropic.claude-code` |
| **Webview** | Claude’s sign-in and chat UI (not a separate desktop app) |

Anthropic ships **a VS Code extension**, not a standalone Soumtok window. Real VS Code and Cursor are forks of [microsoft/vscode](https://github.com/microsoft/vscode) that embed that stack.

## What Soumtok uses today

Soumtok Desktop is a **custom workbench** (Monaco + our UI). It does **not** include Microsoft’s extension host.

To run Claude/Cline/etc. **inside** Soumtok we embed **code-server** (VS Code in the browser) via Electron `BrowserView`:

- Extensions install to `~/.soumtok/ide/extensions` (same VSIX as marketplace).
- Host data: `~/.soumtok/soumtok-code-host/`.
- Platform workspace (extensions always open here): `~/.soumtok/ide/extension-host-workspace/` — not your project folder.
- We hide the welcome page and auto-trigger **Claude Code: Open in Primary Editor** (Ctrl+Shift+Escape) after load.

You may still see brief VS Code chrome; the **Claude login/chat** is the extension webview (second step after load).

## Long-term: Soumtok Code fork

For a single branded app (no “code-server” welcome, deeper Soumtok integration):

1. `npm run vscode:fork-bootstrap` → clone/build [vscode](https://github.com/microsoft/vscode) with `desktop/vscode-fork/product.json.template`.
2. Ship **Soumtok Code.exe** and point `codeBridge.js` at it.

See `docs/SOUMTOK-VSCODE-FORK-STRATEGY.md`.

## External VS Code

Optional fallback: **Run in VS Code** uses your installed VS Code with `--extensions-dir` pointing at Soumtok’s extension folder.
