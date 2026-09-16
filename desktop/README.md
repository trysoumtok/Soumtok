# Soumtok Desktop IDE

Electron-based agent IDE — Monaco editor, local tools, Soumtok account sign-in.

## Requirements

- Node.js **22+**
- npm
- Windows: build tools for `node-pty` (installed via `postinstall`)

## Quick start

From the repo root:

```bash
# 1. Configure API (repo root .env)
cp .env.example .env
# Set SOUMTOK_API=https://soumtok.com (or your dev server)

# 2. Install
npm install
cd desktop && npm install && cd ..

# 3. Run
cd desktop && npm run dev
```

Sign in when prompted, open a folder, use **Agent** (Ctrl+I) or the side panel.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Launch Electron (dev) |
| `npm run start` | Same as dev |
| `npm run pack:win` | Windows NSIS installer → `desktop/release/` |
| `npm run pack:mac` | macOS DMG |
| `npm run pack:linux` | Linux AppImage |
| `npm run test:desktop` | From **repo root** — harness & integration tests |

## Environment

| Variable | Purpose |
|----------|---------|
| `SOUMTOK_API` | Backend URL (default `https://soumtok.com`) |
| `OPENAI_API_KEY` | Optional — voice transcription fallback |
| `SOUMTOK_UPDATE_URL` | Optional — auto-update feed base URL |

User data: `~/.soumtok/ide` (settings, extensions) and `~/.soumtok/workspaces` (per-project cache).

## Features

- **Agent** — multi-round tools: read, write, diff, grep, terminal, git, browser, MCP
- **Modes** — Agent, Ask (read-only), Plan (inspect only), Debug (runtime evidence)
- **Editor** — Monaco, Tab completions, Ctrl+K inline edit, inline agent diffs (optional)
- **Terminal** — xterm + node-pty
- **Git** — status, commit, publish
- **Extensions** — Open VSX; optional code-server extension host
- **Test Hub** — direct model chat + live preview

## Known limits (v0.1)

- **TypeScript/JavaScript** diagnostics in Monaco; Python, Rust, Go, etc. show an **Open LSP** banner → extension host
- Agent requires network + Soumtok sign-in
- Tab model configurable in **Settings → Editor** (default DeepSeek V4 Flash)
- Public release: sign installers + host `release/` on `SOUMTOK_UPDATE_URL` (see [docs/RELEASE.md](docs/RELEASE.md))
- Debug panel UI is minimal; use **Debug** agent mode for systematic debugging

## Production release

```bash
cd desktop
npm run pack:win          # or pack:mac / pack:linux
npm run release:verify    # checks latest.yml + prints upload steps
```

See [docs/RELEASE.md](docs/RELEASE.md) for signing and CDN upload.

## Architecture

```
desktop/src/main/     IPC, agent harness, tools, terminal
desktop/src/preload/  window.soumtok API
desktop/src/renderer/ workbench UI + Monaco
desktop/src/shared/   prefs, model catalog (mirrors repo shared/)
```

See also: [docs/CURSOR-PARITY-MASTER.md](../docs/CURSOR-PARITY-MASTER.md), [docs/EXTENSION-HOST-ARCHITECTURE.md](docs/EXTENSION-HOST-ARCHITECTURE.md).
