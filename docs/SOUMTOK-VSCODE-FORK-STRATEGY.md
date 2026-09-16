# Soumtok × VS Code fork strategy (Cursor-class IDE)

Cursor is a **fork of [microsoft/vscode](https://github.com/microsoft/vscode)** (MIT) with proprietary AI, extension marketplace wiring, and product shell. Soumtok Desktop today is **Electron + Monaco + custom workbench** — same *shape* as an IDE, not the full VS Code extension host.

This document is the **deep plan** to reach “top Cursor replica” for everything that can be forked or integrated legally.

---

## 1. Three layers (what Cursor actually ships)

| Layer | Upstream | Soumtok today | Target |
|--------|-----------|---------------|--------|
| **Workbench shell** | VS Code UI (Activity Bar, panels, commands) | Custom HTML/CSS (`workbench.js`) | Keep custom UI **or** migrate to vscode workbench API over time |
| **Editor** | Monaco (same engine as VS Code) | Monaco ✅ | + LSP bridge, inline diff, Tab model |
| **Extension host** | Node process running VS Code extension API | ❌ | **Required** for marketplace extensions to *run* |
| **AI agent** | Proprietary harness + tools | Soumtok harness + API ✅ | Parity doc `CURSOR-PARITY-MASTER.md` |

You cannot get “full VS Code extensions” with Monaco alone. You need either:

- **A)** Embed **OpenVSCode Server** / **code-server** (GPL/code-server license — check compliance), or  
- **B)** Fork **vscode** and ship Soumtok product.json (Cursor path), or  
- **C)** Hybrid: Soumtok shell + **spawn official VS Code/Codium** for extension-heavy work (bridge).

---

## 2. Recommended path for Soumtok (phased)

### Phase 1 — Marketplace + storage (✅ started)

- **Open VSX** search & VSIX install → `%APPDATA%/Soumtok/extensions/`  
- UI: Activity Bar **Extensions** view  
- Read `.vscode/extensions.json` recommendations  
- Files: `desktop/src/main/extensionsMarket.js`, workbench Extensions sidebar  

Extensions are **on disk**; activation is Phase 2.

### Phase 2 — Extension host (8–16 weeks eng)

1. Fork `microsoft/vscode` at a pinned tag (same major as Cursor’s base when possible).  
2. Apply **product.json** branding: `nameShort: Soumtok`, `applicationName`, update URLs, extension gallery → Open VSX.  
3. Build with `yarn gulp vscode-win32-x64` (see vscode wiki).  
4. Replace Electron `main` entry OR ship **second binary** `Soumtok Code.exe` launched from Desktop (“Open in full IDE”).  
5. Wire **shared auth** (Soumtok session cookie) via custom URI protocol `soumtok://`.

Reference repos:

- [microsoft/vscode](https://github.com/microsoft/vscode) — MIT, extension host source of truth  
- [VSCodium](https://github.com/VSCodium/vscodium) — build scripts without Microsoft telemetry  
- [Eclipse Open VSX](https://open-vsx.org) — marketplace API (used by VSCodium, Gitpod)  
- [gitpod-io/openvscode-server](https://github.com/gitpod-io/openvscode-server) — server build of vscode  

### Phase 3 — Single binary (Cursor-like)

- Merge Soumtok Agent sidepane into vscode workbench via **patch layer** (Cursor does this privately).  
- Contribute upstream-compatible patches in `desktop/vscode-fork/patches/` when you fork.  
- Agent IPC: vscode extension `soumtok-agent` talks to existing `agentHarness` or Soumtok API.

### Phase 4 — Tab + Ctrl+K

- Tab: separate fast model + monaco inline completions API (or vscode’s inline completion provider).  
- Ctrl+K: editor action → Soumtok API → apply edits (same as Cursor inline edit).

---

## 3. Open VSX vs Microsoft Marketplace

Microsoft’s Marketplace **Terms** restrict use to Visual Studio products. Cursor/VSCodium use **Open VSX** for community extensions.

Soumtok must use **Open VSX** (already wired in `extensionsMarket.js`) unless you sign a Microsoft marketplace agreement.

---

## 4. What Soumtok Desktop adds beyond a raw VS Code fork

| Soumtok-only | Why keep it |
|--------------|-------------|
| Soumtok account + billing | Business model |
| Multi-model agent API | Not in stock VS Code |
| Platform skills / MCP via cloud | Connectors in `server/studioTools.ts` |
| Desktop local tools harness | Real PC terminal |
| Neon / project backend | Your stack |

Fork VS Code for **editor + extensions**; keep Soumtok for **agent + account**.

---

## 5. Build checklist (when you start the fork)

```bash
# Prerequisites: Node 22+, Python, Visual Studio Build Tools (Windows), yarn
git clone https://github.com/microsoft/vscode.git soumtok-vscode
cd soumtok-vscode
git checkout <pin-tag>
# Copy product.json from desktop/vscode-fork/product.json.template (future)
yarn
yarn gulp vscode-win32-x64
```

Track fork in **separate repo or submodule** `soumtok-vscode/` — do not bloated single commit in main app repo until CI exists.

---

## 6. Connection map (full experience)

```
User
  → Soumtok Desktop (Electron)
       → Monaco editor (now)
       → Agent panel → agentHarness → soumtok.com API
       → Extensions view → Open VSX → VSIX on disk
       → [Phase 2] Soumtok Code (vscode fork) OR extension host process
       → Terminal (xterm) → local shell
       → Git panel → git CLI
  → Soumtok Web Studio
       → Same agent API, cloud sandbox tools
```

---

## 7. Legal / licensing notes (not legal advice)

- **vscode** — MIT, includes Microsoft trademarks; use your own branding in product.json.  
- **Extension IP** — each extension has its own license in VSIX.  
- **Cursor** — not open source; replicate **behavior**, not their code or assets.

---

## 8. Status tracker

| Item | Status |
|------|--------|
| Open VSX search/install UI | In Desktop |
| Installed extensions list | In Desktop |
| Workspace recommendations | In Desktop |
| vscode clone (MIT) | `E:\\soumtok-vscode` via `npm run vscode:fork-bootstrap` (pin **1.130.0** for Agent Host) |
| product.json Open VSX + Soumtok names | Bootstrap merges overlay into vscode `product.json` |
| Extension host / gulp binary | Next: `yarn` then `yarn gulp vscode-win32-x64` in the clone (needs VS Build Tools) |
| Agent inside vscode workbench | Planned Phase 3 — Soumtok harness over AHP (`src/vs/platform/agentHost`) |

Pin 1.130+ for Agent Host; 1.96 is too old. Cursor source is not cloned.
