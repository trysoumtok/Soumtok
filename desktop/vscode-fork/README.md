# Soumtok VS Code fork (Phase 2)

Templates and bootstrap for forking [microsoft/vscode](https://github.com/microsoft/vscode) (MIT) — the same editor Cursor is built on. **Do not copy Cursor.**

Agent Host (AHP) lives in vscode **1.129+**. Bootstrap pins **1.130.0**.

```bash
npm run vscode:fork-bootstrap
```

That clones or updates `E:\soumtok-vscode`, merges `product.json.template` (Soumtok names + Open VSX), and writes `SOUMTOK-README.md`.

Build (Windows — VS Build Tools, Python, Yarn, Node 20):

```bash
cd E:\soumtok-vscode
yarn
yarn gulp vscode-win32-x64
```

Then Soumtok Desktop “Open in Soumtok Code” (`codeBridge.js`) looks for that binary.

AHP client: [`@microsoft/agent-host-protocol`](https://www.npmjs.com/package/@microsoft/agent-host-protocol). Spec: [microsoft/agent-host-protocol](https://github.com/microsoft/agent-host-protocol).

Strategy: [`../../docs/SOUMTOK-VSCODE-FORK-STRATEGY.md`](../../docs/SOUMTOK-VSCODE-FORK-STRATEGY.md).
