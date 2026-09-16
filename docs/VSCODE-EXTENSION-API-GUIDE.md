# VS Code Extension API — where it lives and how Soumtok uses it

Soumtok Desktop **Monaco workbench** is not a full VS Code fork. The **Extension API** only runs inside Microsoft’s **extension host** (from `microsoft/vscode`). This guide maps every API surface and what Soumtok ships today.

---

## 1. Official Extension API (for extension authors)

| Resource | URL / package | Purpose |
|----------|----------------|---------|
| **API reference** | [code.visualstudio.com/api](https://code.visualstudio.com/api) | `vscode.*` namespace docs |
| **Type definitions** | npm [`@types/vscode`](https://www.npmjs.com/package/@types/vscode) | TypeScript types for extension `package.json` `engines.vscode` |
| **Extension samples** | [microsoft/vscode-extension-samples](https://github.com/microsoft/vscode-extension-samples) | Hello world, LSP, debuggers |
| **Extension manifest** | `contributes`, `activationEvents`, `main` | Declared in each extension’s `package.json` |

Extensions call **`import * as vscode from 'vscode'`** in their extension entry. That module is **provided at runtime by VS Code**, not installable as a standalone npm runtime in Soumtok Monaco.

---

## 2. Extension host runtime (where `vscode` is implemented)

| Source | Location | License |
|--------|----------|---------|
| **[microsoft/vscode](https://github.com/microsoft/vscode)** | `src/vs/workbench/api/` (main thread + extension host protocol) | MIT |
| **Built product** | `Code.exe` / `code` CLI after `yarn gulp vscode-*` | MIT + bundled assets |

Cursor, VSCodium, and Gitpod OpenVSCode Server all use this tree (or a fork) to **spawn the extension host process** and wire `vscode.*` to the workbench.

Soumtok templates: `desktop/vscode-fork/product.json.template`  
Strategy: `docs/SOUMTOK-VSCODE-FORK-STRATEGY.md`

**Bootstrap clone (Windows / cross-platform):**

```bash
node desktop/vscode-fork/bootstrap.mjs
```

---

## 3. Marketplace APIs (install extensions — no host required)

| Marketplace | Gallery API | Soumtok usage |
|-------------|-------------|---------------|
| **Open VSX** | `https://open-vsx.org/api` | `desktop/src/main/extensionsMarket.js` — search, download VSIX |
| **Microsoft Marketplace** | Restricted to Visual Studio products | **Do not use** for Soumtok unless you have a Microsoft agreement |

Open VSX gallery URLs for a VS Code–compatible product (in `product.json`):

```json
"extensionsGallery": {
  "serviceUrl": "https://open-vsx.org/vscode/gallery",
  "itemUrl": "https://open-vsx.org/vscode/item",
  "resourceUrlTemplate": "https://open-vsx.org/vscode/asset/{publisher}/{name}/{version}/{path}"
}
```

Installed VSIX path (Desktop): `%APPDATA%/../.soumtok/ide/extensions/` (Electron `userData/extensions`).

---

## 4. What Monaco gives you (without the fork)

| Capability | Monaco | Full VS Code extensions |
|------------|--------|-------------------------|
| Syntax highlighting | ✅ | ✅ (often via TextMate grammars bundled in extension) |
| **LSP** (diagnostics, completion) | Via [`monaco-languageclient`](https://github.com/TypeFox/monaco-languageclient) + language server | Via extension host + LSP extension |
| **Inline Tab completions** | ✅ `registerInlineCompletionsProvider` | ✅ same provider API in vscode |
| **Inline edit (Ctrl+K)** | Custom UI + model (Soumtok `editorAi.js`) | Native in Cursor fork |
| Debug adapters, test explorers | ❌ | ✅ |

---

## 5. Soumtok bridges (use extensions **today**)

Until **Soumtok Code** (vscode fork) ships:

1. **Extensions sidebar** — install from Open VSX to Soumtok’s extensions directory.  
2. **“Open in VS Code / VSCodium”** — `desktop/src/main/codeBridge.js` launches `code` / `codium` with:
   - workspace folder  
   - `--extensions-dir` pointing at Soumtok’s installed extensions (when compatible)  
3. **Fork build** — run `bootstrap.mjs`, build vscode, rename to Soumtok Code per `product.json.template`.

Command palette: **Open in VS Code for Extensions (LSP)**.

---

## 6. Parity items and where they are built

| Missing vs Cursor | Build location | Status |
|-------------------|----------------|--------|
| Extension host | `microsoft/vscode` fork + CI | Phase 2 — bootstrap + docs |
| Tab ghost text | `desktop/src/renderer/editorAi.js` | Implemented (Monaco inline completions) |
| Ctrl+K inline edit | `editorAi.js` + `inlineEditorAi.js` | Implemented |
| Checkpoints | `desktop/src/main/checkpoints.js` | Implemented |
| Agent tools / MCP | `agentHarness.js`, `server/studio.ts` | Implemented |
| Cloud agents / BugBot | Platform + GitHub | Roadmap |

Master checklist: `docs/CURSOR-PARITY-MASTER.md`.

---

## 7. Quick reference commands

```bash
# Unit tests (agent + shared)
npm test
npm run test:desktop

# Prepare vscode fork tree (does not compile — see vscode wiki for build)
node desktop/vscode-fork/bootstrap.mjs

# Run Soumtok Desktop
cd desktop && npm start
```

VS Code build (after bootstrap, inside clone):

```bash
cd ../soumtok-vscode
yarn
yarn gulp vscode-win32-x64
```
