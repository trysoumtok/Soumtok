# Soumtok × Cursor — full parity master document

**Purpose:** Single source of truth for “make Soumtok (Desktop + platform) behave like Cursor” — every major and minor capability, what we have, what’s missing, and where to build it.

**Method (not a rushed checklist):**

1. **Cursor official docs** — Agent overview, Tab, Rules, modes, queue/steer, checkpoints, tools ([cursor.com/docs](https://cursor.com/docs)).
2. **Cursor Agent runtime** — tool surface used by the in-IDE agent (Task subagents, SwitchMode, ReadLints, Shell, parallel tools, MCP, goals, todos, browser, etc.).
3. **Soumtok repo audit** — `desktop/src/renderer/workbench.js`, `desktop/src/main/agentHarness.js`, `desktop/src/main/desktopTools.js`, `server/studio.ts`, `shared/desktopAgent*.ts`, web `StudioDashboard` / `AgentWorkbench`.

**Important:** We are not copying Cursor’s proprietary UI or code. This document defines **functional parity** — same workflows, reliability, and power for **any project, any question**, on Soumtok’s stack (Neon, billing, multi-model routing).

**Last updated:** 2026-03-24 (session: tool-chain fixes, task/glob/read_lints/MCP wiring started on Desktop).

---

## 1. Cursor mental model (how the product is layered)

Cursor is **not** “one chat box.” It is several products sharing one editor:

| Layer | What it is | User-facing |
|--------|------------|-------------|
| **Editor shell** | VS Code fork | Files, tabs, terminal, SCM, palette, keybindings |
| **Tab** | Inline autocomplete model | Gray ghost text, multi-line, cross-file jumps |
| **Inline Edit (⌘/Ctrl+K)** | Selection-scoped edit | Patch selection in place |
| **Chat / Agent sidepane (⌘/Ctrl+I)** | Multi-step agent | Tools, terminal, edits, queue |
| **Modes (toolset axis)** | Ask, Agent, Plan, Debug | Changes **what tools** the agent may use |
| **Models (engine axis)** | Composer, Claude, GPT, … | Changes **which model** runs; independent of mode |
| **Subagents (`Task`)** | explore, generalPurpose, bugbot, … | Parallel workers, optional cloud + worktree |
| **Rules** | `.cursor/rules`, AGENTS.md, team rules | Persistent instructions (Agent only, not Tab) |
| **MCP + Plugins** | Connectors, skills, marketplace | Extend agent tools |
| **Agents Window / Cloud** | cursor.com/agents, mobile, Slack | Same sessions across devices; cloud VMs |
| **Checkpoints** | Local snapshots per session | Undo agent file changes without Git |
| **BugBot / PR** | Review on GitHub | Automated review loops |

Soumtok today is strongest on **“signed-in IDE + agent sidepane + local tools + Soumtok API routing.”** It is weakest on **Tab, Inline K, checkpoints, parallel/cloud agents, browser, and deep VS Code parity.**

---

## 2. Executive parity score (honest)

Rough **functional** parity vs Cursor (March 2026):

| Area | Score | Notes |
|------|-------|--------|
| Agent multi-round loop | **~75%** | Harness + rounds; was broken on tool messages (fixed) |
| Local terminal + sandbox | **~70%** | Real shell; sandbox prefs; not unlimited like Cursor “run everything” UX |
| File tools (read/grep/edit) | **~80%** | glob/read_lints/task added recently on Desktop |
| Subagents (Task) | **~35%** | Basic `task()` sub-loop; no resume, parallel Task, cloud, bugbot |
| Modes (Ask/Plan/Agent/Debug) | **~50%** | UI modes; no model `SwitchMode` tool; no Debug mode |
| Rules / AGENTS.md | **~25%** | Soumtok **doctrine** injected; no `.cursor/rules` or nested AGENTS.md |
| MCP / plugins | **~40%** | Web connectors + desktop proxy; not one-click plugin marketplace |
| Tab / Ctrl+K | **~5%** | Monaco only; no Tab model; no inline AI edit |
| Checkpoints | **~0%** | Git + thread history only |
| Agents Window / cloud handoff | **~15%** | Web studio + bot driver; no cloud VM worktrees |
| Browser / Design Mode | **~5%** | “Open Browser” stub in agent menu |
| PR / BugBot | **~10%** | Shared review concepts; not Cursor BugBot |
| IDE chrome (tasks, debug, extensions) | **~30%** | Palette, terminal, git panel; many menu items disabled/stub |

**Overall:** ~**45%** of Cursor’s **full product**; ~**65%** of **“Agent on local repo”** alone.

---

## 3. Agent — tools comparison

### 3.1 Cursor Agent tools (representative)

From Cursor docs + in-agent runtime:

| Tool / capability | Cursor behavior |
|-------------------|-----------------|
| Read | Files + images for vision models |
| Write / StrReplace / Delete | Edits; delete with guards |
| Grep / Glob | Search content and paths |
| Shell | Run commands; **Await** polls background shell |
| ReadLints | Workspace diagnostics (ESLint, TS, etc.) |
| Task | Subagents: explore, generalPurpose, bugbot, ci-investigator, … |
| SwitchMode | Request Plan ↔ Agent (user approves) |
| TodoWrite | Structured todo list in UI |
| WebSearch / WebFetch | Web research |
| Browser | Control browser, screenshots, E2E |
| GenerateImage | UI assets to `assets/` |
| MCP tools | Per-connector |
| FetchMcpResource | MCP resources → disk or context |
| EditNotebook | Jupyter cells |
| AskQuestion | Clarifying questions while agent continues |
| Rules fetch | Pull rule content by type/description |
| Goals (`/goal`, CreateGoal) | Long-lived objectives |
| **No hard cap** | Docs: no limit on tool calls per task |

### 3.2 Soumtok Agent tools (platform)

Defined in `shared/nativeTools.ts`, executed on Desktop in `desktop/src/main/desktopTools.js`, orchestrated by `desktop/src/main/agentHarness.js`, model round in `server/studio.ts` (`/api/desktop/agent/round`).

| Tool | Soumtok status | Where |
|------|----------------|--------|
| read | ✅ | desktopTools |
| grep | ✅ | ripgrep + walk fallback |
| glob | ✅ | Added (Desktop) |
| list_dir | ✅ | |
| write | ✅ | |
| diff | ✅ | (+ str_replace aliases) |
| terminal | ✅ | Sandbox: strict / standard / permissive |
| read_lints | ✅ | npm run lint + tsc (Desktop) |
| task | ⚠️ Partial | Sub-harness explore/generalPurpose; no resume/parallel/cloud |
| fetch | ✅ | Optional prefs |
| mcp | ⚠️ Partial | POST `/api/studio/tools/mcp` from Desktop |
| github | ✅ | Studio cloud workspace |
| delete | ❌ | Not exposed |
| SwitchMode | ❌ | UI mode only |
| TodoWrite | ❌ | Activity steps only |
| WebSearch | ⚠️ | fetch + DuckDuckGo HTML when enabled |
| Browser | ❌ | Stub UI |
| GenerateImage | ❌ | |
| Await (background shell) | ⚠️ | Dev servers background only |
| AskQuestion | ❌ | |
| Semantic codebase index | ❌ | Grep/walk only |

---

## 4. Agent — harness & behavior

| Behavior | Cursor | Soumtok today | Gap |
|----------|--------|---------------|-----|
| Multi-round until done | Yes, uncapped | 36 IDE / 48 bot rounds | Raise or dynamic cap; “continue” note |
| Parallel tool calls | Yes | read/grep/glob/list_dir/fetch parallel | Extend to safe sets |
| Queue while busy | Enter queue; ⌘Enter send now | `agentOutbox`, queue UI | **Steer at next tool** (Enter twice) not full parity |
| Follow-up without interrupt | Deliver at next tool call | Partial (harness user nudges) | Wire explicit steer message into API round |
| Checkpoints | Auto snapshot; restore in timeline | ❌ | **P0 for trust** — local snapshot store |
| Plan mode gate | Editable plan then Agent | plan UI; tools read-only | Plan approval UI + `SwitchMode` |
| Debug mode | Runtime evidence loop | ❌ | New mode + prompts |
| Anti-refusal | Product-tuned | Harness retry on “I can’t / run manually” | Expand patterns |
| Model-specific tool JSON | Cursor-tuned per model | Soumtok server streaming | Keep investing in `nativeTools` + DSML fallback |
| Thread memory | Full chat + tools | `modelMessages` + doctrine | OK |
| Platform skills | Plugins marketplace | `/api/studio/tools/context` injected on Desktop | Also inject on **web** agent every turn |
| User rules | Global + project | Soumtok doctrine only | Optional AGENTS.md / `.soumtok/rules` |
| Voice input | — | Whisper desktop (`agentVoice.js`) | **Ahead of Cursor** for local STT |
| Attachments / vision | Images in chat | Yes via API wrap | OK |

**Key files to extend:** `agentHarness.js`, `shared/soumtokAgentDoctrine.ts`, `shared/desktopAgent.ts`, `server/studio.ts`.

---

## 5. IDE shell — feature matrix

### 5.1 Core editor

| Feature | Cursor (VS Code) | Soumtok Desktop | Status |
|---------|------------------|-----------------|--------|
| Monaco / VS Code editor | Full VS Code | Monaco in `workbench.js` | Partial |
| Multi-tab | Yes | Yes | ✅ |
| Tab scroll / chevrons | Yes | Yes (CSS) | ✅ |
| Split editor | Yes | ❌ | Missing |
| Breadcrumbs | Yes | ❌ | Missing |
| Minimap | Yes | Monaco default | ⚠️ |
| Format on save | Yes | Pref `autoFormatOnFinish` (agent) | Partial |
| Find in file | Yes | Monaco built-in | ✅ |
| Global search sidebar | Yes | `showSide('search')` | ⚠️ Verify depth |
| Replace | Yes | ⚠️ | Audit |
| Multi-root workspace | Yes | Single folder | ❌ |
| Remote SSH | Yes | `connectSsh` home entry | ⚠️ Early |

### 5.2 AI editor features

| Feature | Cursor | Soumtok Desktop |
|---------|--------|-----------------|
| **Cursor Tab** (autocomplete) | Core product | ❌ (`agentAutocomplete` pref only) |
| **Ctrl+K inline edit** | Core | ❌ |
| Agent applies edits | Yes | write/diff on disk | ✅ |
| Inline diffs in editor | Yes | Pref saved; “in progress” copy | ❌ |
| Jump to next diff | Yes | Pref only | ❌ |
| Codebase-wide refactor | Agent | Agent multi-round | ⚠️ |
| @-mentions (files, docs, rules) | Yes | Partial attachments | ⚠️ |

### 5.3 Terminal

| Feature | Cursor | Soumtok Desktop |
|---------|--------|-----------------|
| Integrated terminal | xterm, profiles | `terminalPanel.js` | ✅ |
| Ctrl+` / Ctrl+J | Yes | Yes (`onKeys`) | ✅ |
| Split terminal | Yes | Menu **disabled** | ❌ |
| Default shell profile | Settings | ⚠️ | Missing |
| Agent runs commands | Shell tool | `terminal()` tool | ✅ |
| Background / Await | Await tool | Dev server background only | ⚠️ |

### 5.4 Run / tasks / debug

| Feature | Cursor | Soumtok Desktop |
|---------|--------|-----------------|
| tasks.json | Yes | Stub messages | ❌ |
| Run Build Task | Ctrl+Shift+B | `runBuildTask()` basic | ⚠️ |
| Run Task / terminate / restart | Yes | Menu disabled | ❌ |
| Debug panel | Yes | ❌ | Missing |
| Run active file / selection | Yes | Implemented | ✅ |

### 5.5 Git / SCM

| Feature | Cursor | Soumtok Desktop |
|---------|--------|-----------------|
| Source control view | Yes | Git side panel | ⚠️ |
| Commit (Ctrl+Enter) | Yes | Yes in git UI | ✅ |
| Diff / stage / branch | Full | Partial | ⚠️ |
| Agent + git push | Yes | Sandbox-limited git | ⚠️ |

### 5.6 UI chrome

| Feature | Cursor | Soumtok Desktop |
|---------|--------|-----------------|
| Command palette | Ctrl+Shift+P | Yes | ✅ |
| Settings | Full | Settings screen (models, agents, keys) | ✅ |
| Account / billing | Cursor account | Soumtok sign-in + browser billing | ✅ |
| Agents Window | Cursor 3 tabbed UI | `openAgentsWindow()` layout toggle | ⚠️ Not full Cursor 3 |
| Status bar (errors/warnings) | Yes | Counters → problems panel | ⚠️ |
| Problems panel | Yes | `showPanel('problems')` | ⚠️ |
| Extensions marketplace | VS Code | Open VSX install UI | **Partial** — host Phase 2 |
| Themes | Yes | light/dark | ✅ |

---

## 6. Models & routing

| Feature | Cursor | Soumtok |
|---------|--------|---------|
| Composer (house model) | Yes, fast default | Multi-vendor via `shared/models.ts` | Different strategy |
| Auto model pick | Yes | `auto` + `pickAutoModel` | ✅ |
| Per-chat model | Yes | Agent model picker | ✅ |
| Per-subagent model | Yes | Settings “Task Models” → harness | ⚠️ Wired recently |
| BYOK | Yes | Dashboard keys + desktop settings | ✅ |
| Usage / billing | Cursor plans | Soumtok trial/platform billing | ✅ |
| Max mode / thinking | Model-specific | Depends on provider | ⚠️ |

---

## 7. Context & rules

| Feature | Cursor | Soumtok |
|---------|--------|---------|
| `.cursor/rules` (.mdc) | Yes | ❌ |
| AGENTS.md nested | Yes | ❌ (doctrine says don’t require it) |
| User rules global | Yes | ❌ |
| Team rules | Enterprise | Could map to org policies | ❌ |
| @file @folder @codebase | Yes | Open files + grep | ⚠️ |
| Codebase indexing (semantic) | Strong | ❌ | **Major gap** |
| `.cursorignore` | Yes | workspace boundary prefs | ⚠️ |
| Memories | Product feature | Thread + harness scan | ⚠️ |

**Soumtok choice:** Platform-owned doctrine (`shared/soumtokAgentDoctrine.ts`) so **any repo works without setup**. Parity option: **also** load optional `AGENTS.md` / `.soumtok/rules/` when present.

---

## 8. Ecosystem integrations

| Feature | Cursor | Soumtok |
|---------|--------|---------|
| MCP connectors | Native | `server/connectors.ts`, `studioTools` mcp | ⚠️ |
| Plugin marketplace | Cursor 3 | `shared/plugins.ts`, user_plugins | ⚠️ |
| Skills in agent prompt | Yes | DB skills + plugin skills via context API | ⚠️ Desktop only injected |
| Slack / Linear / GitHub agents | Cursor 3 | GitHub app pieces in repo | ❌ |
| Cloud agents + worktree | Yes | ❌ | **Large project** |
| Mobile agent | Yes | Web dashboard | ⚠️ |
| CLI agent | cursor agent | ❌ | Optional later |
| BugBot on PRs | Yes | ❌ | Could use subagent type `bugbot` |

---

## 9. Soumtok platform (web) vs Desktop

Soumtok is **one product**: account, models, skills, connectors, usage — **any project**.

| Capability | Web Studio (`StudioDashboard`) | Desktop IDE |
|------------|-------------------------------|-------------|
| Agent chat | ✅ | ✅ |
| Local folder tools | ❌ (sandbox files) | ✅ |
| Speech | Browser | Whisper + IPC |
| MCP | ✅ | Proxy via API |
| GitHub workspace | ✅ | Clone/open folder |
| Same harness doctrine | ✅ | ✅ |

**Parity rule:** Anything added to Desktop agent tools should appear in `shared/nativeTools.ts` and be honored on **web** where applicable (cloud sandbox vs local).

---

## 10. What we wired recently (same initiative)

- `messageHasBody` / `normalizeChatMessagesForAgent` — fix tool-round crashes.
- Higher round limits (36/48).
- Harness anti-refusal retry.
- Tools: **glob**, **read_lints**, **task** (subagent loop), **MCP** bridge on Desktop.
- Platform context from `GET /api/studio/tools/context` on agent run.
- Defaults: web fetch/search + MCP prefs on for new installs.
- **Checkpoints** before agent edits (`.soumtok/checkpoints/` + Restore in thread).
- **Steer at next tool** (`agent:steer`, Enter=queue / Ctrl+Enter=steer while busy).
- **Project rules**: `AGENTS.md`, `.soumtok/rules/`, `.cursor/rules/`.
- Tools: **delete**, **switch_mode**, **todo_write** (UI todo list).
- **Ctrl+I** agent focus; **tasks.json** build task runner.
- Parity spec: this document.

---

## 11. Parity roadmap (recommended build order)

### P0 — Trust + “never dead agent” (1–2 weeks)

1. Checkpoint snapshots before agent edits (local JSON + restore UI in thread).
2. Steer-at-next-tool (match Cursor “Send now” / double-Enter semantics).
3. Web agent: same `normalizeChatMessagesForAgent` + platform context every run.
4. Real **ReadLints** via LSP/diagnostics API when Monaco has markers (not only npm/tsc).
5. Optional **AGENTS.md** + `.soumtok/rules/` loader (does not replace doctrine).

### P1 — Cursor-class agent power (2–4 weeks)

1. **Task** parity: resume, parallel Task calls, subagent types (explore, generalPurpose, bugbot, security-review).
2. **SwitchMode** tool + user approval card in UI.
3. **TodoWrite** → agent activity UI.
4. **Delete** tool with prefs guard.
5. Semantic index (embeddings or ripgrep + symbol graph) — start with `@codebase` UX.
6. Background shell + **Await** for long commands.

### P2 — IDE depth (4–8 weeks)

1. Inline diffs in Monaco (pref already exists).
2. **Ctrl+K** inline edit (selection → model → apply).
3. **Tab** autocomplete (separate model endpoint, ghost text).
4. tasks.json runner, split terminal, debug adapter stub.
5. Multi-root workspaces.

### P3 — Cursor 3 class platform (8+ weeks)

1. Cloud agents + git worktree isolation.
2. Agents Window parity (all sessions sidebar, cloud ↔ local handoff).
3. Browser tool for agent (Playwright in Electron).
4. BugBot / PR review integration.
5. Team rules + marketplace UX.

---

## 12. File map (where to implement)

| Concern | Primary files |
|---------|----------------|
| Tool schemas | `shared/nativeTools.ts` |
| Tool execution (local) | `desktop/src/main/desktopTools.js` |
| Agent loop | `desktop/src/main/agentHarness.js` |
| Subagents | `runSubagentTask` in agentHarness (split to `subagentRunner.js` later) |
| Server model round | `server/studio.ts` (`desktopAgentRound`) |
| Prompt / doctrine | `shared/desktopHarness.ts`, `shared/soumtokAgentDoctrine.ts`, `shared/desktopAgent.ts` |
| Prefs / defaults | `shared/desktopAgentPrefs.ts`, `desktop/src/renderer/workbench.js` |
| MCP | `server/studioTools.ts`, `server/connectors.ts` |
| Skills/plugins context | `server/studioTools.ts` `/api/studio/tools/context` |
| Web studio agent | `src/components/dashboard/StudioDashboard.tsx`, `server/studio.ts` |
| UI agent panel | `desktop/src/renderer/workbench.js`, `workbench.css` |
| Tests | `shared/tools.test.ts`, `shared/desktopAgent.test.ts`, `desktop/scripts/test-agent-harness.mjs` |

---

## 13. Acceptance criteria (“works like Cursor for any project”)

Use this checklist before claiming parity:

- [ ] Open **any** folder → agent answers “what is this project” without asking user to run commands.
- [ ] Agent runs **npm run dev** (or equivalent) and reports URL from terminal output.
- [ ] Multi-step task (read → edit → test) completes in **one thread** without protocol errors.
- [ ] User can **queue** and **send now** while agent runs.
- [ ] User can **restore** pre-agent file state from checkpoint.
- [ ] **task(explore)** returns useful map of unknown monorepo in &lt;2 min.
- [ ] **MCP** connector works from Desktop when connected on account.
- [ ] **Plan** mode: no writes until user confirms.
- [ ] Same account skills/rules apply on **web + desktop**.

---

## 14. VS Code fork & extensions

Deep plan: **[SOUMTOK-VSCODE-FORK-STRATEGY.md](./SOUMTOK-VSCODE-FORK-STRATEGY.md)**  
Desktop **Open VSX** marketplace UI: Activity Bar → Extensions, `extensionsMarket.js`.

---

## 15. References

- [Cursor Agent overview](https://cursor.com/docs/agent/overview)
- [Cursor Tab](https://cursor.com/docs/tab/overview)
- [Cursor Rules](https://cursor.com/docs/context/rules)
- [Cursor 3 blog](https://cursor.com/blog/cursor-3)
- Soumtok: `shared/soumtokAgentDoctrine.ts`, `docs/` (this file)

---

*This document should be updated whenever a parity item ships or Cursor ships a major feature (Agents Window, checkpoints, new tools).*
