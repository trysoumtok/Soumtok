# Soumtok CLI

Run **Soumtok Agent** in any terminal on Windows, macOS, or Linux — same brain, tools, and model routing as Soumtok Desktop.

## Install

From the repo (development):

```bash
npm run cli -- --help
node cli/bin/soumtok.mjs login
```

Windows (PowerShell):

```powershell
irm https://soumtok.com/install/cli.ps1 | iex
```

Linux / macOS:

```bash
curl -fsSL https://soumtok.com/install/cli.sh | bash
```

## Sign in

**Browser (recommended)**

```bash
soumtok login
```

**API key** (Dashboard → Keys)

```bash
soumtok login --api-key sk-soumtok-…
# or
export SOUMTOK_API_KEY=sk-soumtok-…
```

## Use

```bash
cd my-project
soumtok                    # interactive chat
soumtok agent "add tests for auth"
soumtok --model deepseek-v4-flash --mode ask
soumtok models
```

In chat:

- `/mode plan` — planning only
- `/model auto` — change model
- `/cwd ../other-repo` — switch folder
- `!npm test` — run a shell command in the workspace

## Desktop parity

| Desktop | CLI |
|---------|-----|
| `runAgentHarness` + `desktopTools.js` | Same modules (required in-process) |
| `DEFAULT_AGENT_PREFS` / intelligence / run-everything | `effectiveAgentPrefs()` — identical |
| IDE Agent vs Soumtok Bot (`driver`) | `--driver ide\|bot`, `/driver` |
| Modes agent / ask / plan / debug | `--mode`, `/mode` |
| `@` open files / includeOpenFiles | `@path` in prompts |
| Integrated terminal + read_terminal | Headless terminal runner + log capture |
| Steer while running | `/steer …` → `pushAgentSteer` |
| Cancel run | Ctrl+C or `/cancel` |
| ask_question UI | Interactive prompts in terminal |
| Events: tools, todos, plan_file, mode_switch, … | Same event stream, terminal UI |

Run tests: `npm run test:cli`

## How it works

The CLI loads the same **desktop agent harness** (`runAgentHarness`) and **local tools** (read, write, grep, terminal, git, …) as Soumtok Desktop. Model calls go to `POST /api/desktop/agent/round` on your Soumtok account.
