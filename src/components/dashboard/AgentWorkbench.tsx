import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { previewFromFiles, type AgentEvent, type AgentWorkspace } from '../../../shared/agent'
import { checkoutPath, planLabel } from '../../../shared/plans'
import { navigate } from '../../lib/nav'
import { downloadProjectZip, saveProjectToFolder } from '../../lib/saveProjectFolder'
import { isImageDataUrl, isImageFilePath } from '../../../shared/preview'
import { CodeEditor } from './CodeEditor'
import { StudioDesktop } from './StudioDesktop'

export type BenchTab = 'git' | 'desktop' | 'terminal' | 'files' | 'billing'

const TABS: { id: BenchTab; label: string }[] = [
  { id: 'git', label: 'Git' },
  { id: 'desktop', label: 'Desktop' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'files', label: 'Files' },
  { id: 'billing', label: 'Subscriptions' },
]

export function AgentWorkbench({
  workspace,
  tab,
  onTab,
  control,
  onControl,
  onSaveFile,
  projectId,
  plan,
  busy,
  focusPath,
  expanded,
  onExpand,
  onArchive,
  onOpenEnv,
  onAcceptDiff,
  onRejectDiff,
  onRunCommand,
  repo,
  onCommit,
  onPullRequest,
  onPasteFiles,
}: {
  workspace: AgentWorkspace
  tab: BenchTab
  onTab: (tab: BenchTab) => void
  control: boolean
  onControl: (value: boolean) => void
  onSaveFile: (path: string, content: string) => void
  projectId?: string | null
  plan?: string
  busy?: boolean
  focusPath?: string
  expanded?: boolean
  onExpand?: (value: boolean) => void
  onArchive?: () => void
  onOpenEnv?: () => void
  onAcceptDiff?: (path: string) => void
  onRejectDiff?: (path: string) => void
  onRunCommand?: (command: string) => Promise<string>
  repo?: { fullName: string; name?: string } | null
  onCommit?: (message: string) => Promise<string>
  onPullRequest?: (title: string) => Promise<string>
  onPasteFiles?: (files: File[]) => void
}) {
  const files = workspace.files
  const previewHtml = useMemo(
    () => previewFromFiles(files, workspace.previewHtml || ''),
    [files, workspace.previewHtml],
  )
  const title = workspace.previewTitle || workspace.mode || 'Workspace'
  const url = typeof window !== 'undefined' ? window.location.origin : ''
  const diffs = workspace.events.filter((item): item is Extract<AgentEvent, { kind: 'diff' }> => item.kind === 'diff')
  const commands = workspace.events.filter((item): item is Extract<AgentEvent, { kind: 'command' }> => item.kind === 'command')
  const [menu, setMenu] = useState(false)
  const [notice, setNotice] = useState('')
  const [details, setDetails] = useState(false)
  const [envOpen, setEnvOpen] = useState(false)
  const onDesktop = tab === 'desktop'

  useEffect(() => {
    if (!focusPath) return
    if (tab === 'desktop' && busy) return
    onTab('files')
  }, [focusPath])

  useEffect(() => {
    if (!menu && !expanded) return
    function onDoc(event: MouseEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest?.('[data-bench-menu]')) return
      setMenu(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setMenu(false)
      if (expanded) {
        onControl(false)
        onExpand?.(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu, expanded, onControl, onExpand])

  function pickTab(id: BenchTab) {
    onTab(id)
  }

  function copyId() {
    const id = projectId || 'local-workspace'
    void navigator.clipboard.writeText(id).then(
      () => setNotice('Agent ID copied'),
      () => setNotice(id),
    )
    setMenu(false)
  }

  return (
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col border-l border-white/[0.06] bg-[#0c0c0b]">
      <header className="bench-tab-row relative flex shrink-0 items-center gap-1 border-b border-white/[0.06] px-3 py-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => pickTab(item.id)}
            className={`shrink-0 rounded-md px-2.5 py-1 text-[13px] ${
              tab === item.id ? 'bg-white text-[#111110]' : 'text-white/45 hover:text-white'
            }`}
          >
            {item.id === 'billing' ? (
              <>
                <span className="hidden sm:inline">{item.label}</span>
                <span className="sm:hidden">Plan</span>
              </>
            ) : (
              item.label
            )}
          </button>
        ))}
        <span className="px-1 text-white/25">+</span>
        <span className="ml-auto flex items-center gap-2 text-white/45">
          <span className="hidden tabular-nums text-[11px] text-white/45 sm:inline">{clockStamp()}</span>
          {onDesktop && !control && (
            <button
              type="button"
              onClick={() => onControl(true)}
              className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[12px] font-medium text-[#111110]"
            >
              <CursorIcon />
              Take control
            </button>
          )}
          {onDesktop && control && (
            <button
              type="button"
              onClick={() => onControl(false)}
              className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[12px] font-medium text-[#111110]"
            >
              <CursorIcon />
              Release control
            </button>
          )}
          <button
            type="button"
            data-bench-menu
            aria-label="More"
            onClick={() => setMenu((value) => !value)}
            className="grid h-7 w-7 place-items-center rounded-md hover:bg-white/8 hover:text-white"
          >
            <DotsIcon />
          </button>
          <button
            type="button"
            aria-label={expanded || control ? 'Close desktop' : 'Expand desktop'}
            onClick={() => {
              setMenu(false)
              if (expanded || control) {
                onControl(false)
                onExpand?.(false)
              } else {
                onExpand?.(true)
              }
            }}
            className="grid h-7 w-7 place-items-center rounded-md hover:bg-white/8 hover:text-white"
          >
            {expanded || control ? <CollapseIcon /> : <ExpandIcon />}
          </button>
        </span>
        {menu && (
          <div
            data-bench-menu
            className="absolute right-3 top-11 z-[80] w-[230px] overflow-hidden rounded-xl border border-white/10 bg-[#1a1a18] py-1 shadow-2xl"
          >
            <MenuRow
              icon={<CubeIcon />}
              label="Open in Desktop"
              onClick={() => {
                onTab('desktop')
                onControl(true)
                onExpand?.(true)
                setMenu(false)
              }}
            />
            <MenuRow
              icon={<DialIcon />}
              label="Configure Environment"
              onClick={() => {
                if (onOpenEnv) onOpenEnv()
                else setEnvOpen(true)
                setMenu(false)
              }}
            />
            <MenuRow icon={<CopyIcon />} label="Copy Agent ID" onClick={copyId} />
            <MenuRow
              icon={<PulseIcon />}
              label="Show internal details"
              onClick={() => {
                setDetails(true)
                setMenu(false)
              }}
            />
            <div className="my-1 border-t border-white/8" />
            <MenuRow
              icon={<ArchiveIcon />}
              label="Archive"
              onClick={() => {
                setMenu(false)
                onArchive?.()
              }}
            />
          </div>
        )}
      </header>

      {notice && (
        <p className="border-b border-white/6 px-4 py-1.5 text-[12px] text-white/50">
          {notice}
        </p>
      )}

      {tab === 'git' && (
        <GitPane
          title={title}
          diffs={diffs}
          commands={commands}
          files={files}
          onAcceptDiff={onAcceptDiff}
          onRejectDiff={onRejectDiff}
          repo={repo}
          onCommit={onCommit}
          onPullRequest={onPullRequest}
        />
      )}
      {tab === 'desktop' && (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <StudioDesktop
            html={previewHtml}
            files={files}
            title={title}
            url={url}
            control={control}
            onControl={(value) => {
              onControl(value)
              if (value) onExpand?.(true)
            }}
            busy={Boolean(busy)}
            commands={commands}
            onSaveFile={onSaveFile}
            openFile={focusPath}
            onRunCommand={onRunCommand}
            onPasteFiles={onPasteFiles}
          />
        </div>
      )}
      {tab === 'files' && (
        <FilesPane files={files} focusPath={focusPath} artifacts={workspace.events} onSaveFile={onSaveFile} />
      )}
      {tab === 'terminal' && (
        <TerminalPane files={files} onRunCommand={onRunCommand} />
      )}
      {tab === 'billing' && <BillingPane plan={plan} />}

      {envOpen && (
        <Modal title="Configure environment" onClose={() => setEnvOpen(false)}>
          <p className="text-[13px] text-white/60">This workspace runs next to the chat. Preview is served inside the desktop browser.</p>
          <dl className="mt-4 space-y-2 font-mono text-[12px] text-white/75">
            <div className="flex justify-between gap-4"><dt className="text-white/40">Preview</dt><dd>Chrome tab</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-white/40">Files</dt><dd>{Object.keys(files).length}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-white/40">Plan</dt><dd>{planLabel(plan)}</dd></div>
          </dl>
        </Modal>
      )}
      {details && (
        <Modal title="Internal details" onClose={() => setDetails(false)}>
          <dl className="space-y-2 font-mono text-[12px] text-white/75">
            <div className="flex justify-between gap-4"><dt className="text-white/40">Agent ID</dt><dd className="truncate">{projectId || 'local-workspace'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-white/40">Mode</dt><dd>{workspace.mode || 'build'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-white/40">Events</dt><dd>{workspace.events.length}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-white/40">Preview title</dt><dd className="truncate">{title}</dd></div>
          </dl>
        </Modal>
      )}
    </section>
  )
}

function FilesPane({
  files,
  focusPath,
  artifacts,
  onSaveFile,
}: {
  files: Record<string, string>
  focusPath?: string
  artifacts: AgentEvent[]
  onSaveFile: (path: string, content: string) => void
}) {
  const paths = Object.keys(files).sort()
  const [folderNote, setFolderNote] = useState('')
  const artifactPaths = artifacts
    .filter((item): item is Extract<AgentEvent, { kind: 'artifact' }> => item.kind === 'artifact')
    .map((item) => item.path)
    .filter((path) => files[path] !== undefined)
  const [side, setSide] = useState<'files' | 'artifacts'>('files')
  const [openPath, setOpenPath] = useState(focusPath && files[focusPath] !== undefined ? focusPath : paths[0] || '')
  const [draft, setDraft] = useState(files[openPath] || '')
  const [openDirs, setOpenDirs] = useState<Set<string>>(() => new Set(dirTrail(openPath)))
  const listed = side === 'artifacts' ? (artifactPaths.length ? artifactPaths : paths.filter((path) => /\.(html?|md)$/i.test(path))) : paths
  const dirty = openPath ? draft !== (files[openPath] || '') : false
  const lines = (draft || '').split('\n')
  const focusedBody = focusPath ? files[focusPath] : undefined
  const imageSrc =
    openPath && (isImageDataUrl(draft) || (isImageFilePath(openPath) && draft.startsWith('/api/studio/images/')))
      ? draft.startsWith('/api/studio/images/')
        ? `${typeof window !== 'undefined' ? window.location.origin : ''}${draft}`
        : draft
      : ''

  useEffect(() => {
    if (!focusPath || focusedBody === undefined) return
    setSide('files')
    setOpenPath(focusPath)
    setDraft(focusedBody)
    setOpenDirs((current) => new Set([...current, ...dirTrail(focusPath)]))
  }, [focusPath, focusedBody])

  function openFile(path: string) {
    setOpenPath(path)
    setDraft(files[path] || '')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0c0c0b] md:flex-row">
      <aside className="flex max-h-[38vh] w-full shrink-0 flex-col border-b border-white/[0.06] md:max-h-none md:w-[220px] md:border-b-0 md:border-r">
        {paths.length > 0 && (
          <div className="space-y-1 border-b border-white/[0.06] px-2 py-2">
            <button
              type="button"
              onClick={async () => {
                setFolderNote('')
                const saved = await saveProjectToFolder(files)
                if (saved.ok) setFolderNote(`Saved ${saved.count} files to folder`)
                else if (saved.error) setFolderNote(saved.error)
              }}
              className="w-full rounded-md bg-white/[0.08] px-2 py-1.5 text-[11px] text-white hover:bg-white/[0.12]"
            >
              Save to folder
            </button>
            <button
              type="button"
              onClick={() => {
                downloadProjectZip(files)
                setFolderNote('Download started')
              }}
              className="w-full rounded-md px-2 py-1 text-[11px] text-white/45 hover:text-white/70"
            >
              Download all
            </button>
            {folderNote && <p className="text-[10px] leading-4 text-white/40">{folderNote}</p>}
          </div>
        )}
        <div className="flex gap-1 px-2 pt-2">
          {(['files', 'artifacts'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setSide(item)}
              className={`rounded-md px-2.5 py-1 text-[12px] capitalize ${
                side === item ? 'bg-white/[0.08] text-white' : 'text-white/40 hover:text-white'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto py-2">
          {fileRows(listed).map((row) => {
            if (!row.dir && row.name === '.keep') return null
            if (row.depth > 0 && !openDirs.has(parentPath(row.path))) return null
            if (row.dir) {
              const open = openDirs.has(row.path)
              return (
                <button
                  key={`dir-${row.path}`}
                  type="button"
                  style={{ paddingLeft: 10 + row.depth * 12 }}
                  onClick={() =>
                    setOpenDirs((current) => {
                      const next = new Set(current)
                      if (next.has(row.path)) next.delete(row.path)
                      else next.add(row.path)
                      return next
                    })
                  }
                  className="flex w-full items-center gap-1.5 py-0.5 pr-2 text-left text-[12px] text-white/55 hover:bg-white/[0.04] hover:text-white"
                >
                  <span className="w-3 text-[10px] text-white/35">{open ? '▾' : '▸'}</span>
                  <span className="truncate">{row.name}</span>
                </button>
              )
            }
            return (
              <button
                key={row.path}
                type="button"
                style={{ paddingLeft: 10 + row.depth * 12 }}
                onClick={() => openFile(row.path)}
                className={`flex w-full items-center gap-1.5 py-0.5 pr-2 text-left text-[12px] ${
                  openPath === row.path ? 'bg-[#f54e00]/15 text-white' : 'text-white/55 hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                <span className="w-3" />
                <span className="truncate">{row.name}</span>
              </button>
            )
          })}
          {listed.length === 0 && <p className="px-3 py-6 text-[12px] text-white/35">No files yet.</p>}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {openPath ? (
          <>
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.06] px-3">
              <p className="truncate font-mono text-[12px] text-white/70">{openPath.split('/').pop()}</p>
              <button
                type="button"
                disabled={!dirty}
                onClick={() => onSaveFile(openPath, draft)}
                className="rounded-md bg-white px-2.5 py-0.5 text-[12px] font-medium text-[#111110] disabled:opacity-35"
              >
                Save
              </button>
            </div>
            {imageSrc ? (
              <div className="thin-scroll flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[#0a0a0a] p-4">
                <img src={imageSrc} alt="" className="max-h-full max-w-full object-contain" />
              </div>
            ) : (
              <div className="thin-scroll flex min-h-0 flex-1 overflow-auto">
                <div className="shrink-0 select-none py-3 pr-3 text-right font-mono text-[12px] leading-5 text-white/25">
                  {lines.map((_, index) => (
                    <div key={index}>{index + 1}</div>
                  ))}
                </div>
                <CodeEditor path={openPath} value={draft} onChange={setDraft} />
              </div>
            )}
          </>
        ) : (
          <p className="grid flex-1 place-items-center text-[13px] text-white/35">Pick a file</p>
        )}
      </div>
    </div>
  )
}

function fileRows(paths: string[]) {
  const dirs = new Set<string>()
  const rows: { name: string; path: string; dir: boolean; depth: number }[] = []
  for (const path of paths) {
    const parts = path.split('/').filter(Boolean)
    for (let i = 0; i < parts.length - 1; i += 1) {
      const dir = parts.slice(0, i + 1).join('/')
      if (dirs.has(dir)) continue
      dirs.add(dir)
      rows.push({ name: parts[i], path: dir, dir: true, depth: i })
    }
    rows.push({ name: parts[parts.length - 1] || path, path, dir: false, depth: Math.max(0, parts.length - 1) })
  }
  return rows
}

function parentPath(path: string) {
  const parts = path.split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

function dirTrail(path: string) {
  const parts = path.split('/').filter(Boolean)
  parts.pop()
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'))
}

function TerminalPane({
  files,
  onRunCommand,
}: {
  files: Record<string, string>
  onRunCommand?: (command: string) => Promise<string>
}) {
  const [cwd, setCwd] = useState('')
  const [value, setValue] = useState('')
  const [lines, setLines] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const prompt = 'workspace $'

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [lines, running])

  async function run(raw: string) {
    const input = raw.trim()
    const next = [...lines, `${prompt} ${input}`]
    if (!input) {
      setLines(next)
      return
    }
    const [cmd, ...rest] = input.split(/\s+/)
    const arg = rest.join(' ')
    if (cmd === 'clear') {
      setLines([])
      return
    }
    if (cmd === 'help') next.push('ls  cd  pwd  cat  echo  whoami  date  clear  help')
    else if (cmd === 'whoami') next.push('guest')
    else if (cmd === 'date') next.push(new Date().toString())
    else if (cmd === 'echo') next.push(arg)
    else if (cmd === 'pwd') next.push(cwd ? `/workspace/${cwd}` : '/workspace')
    else if (cmd === 'ls' || cmd === 'dir') {
      const folder = arg && arg !== '.' ? (cwd ? `${cwd}/${arg}` : arg) : cwd
      const names = listFolder(files, folder).map((item) => (item.dir ? `${item.name}/` : item.name))
      next.push(names.join('  ') || '')
    } else if (cmd === 'cd') {
      if (!arg || arg === '~' || arg === '/' || arg === '/workspace') setCwd('')
      else if (arg === '..') setCwd(parentPath(cwd))
      else {
        const target = arg.replace(/^\/workspace\/?/, '')
        const clean = (arg.startsWith('/') ? target : cwd ? `${cwd}/${arg}` : arg).replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '')
        const exists = !clean || Object.keys(files).some((path) => path === clean || path.startsWith(`${clean}/`))
        if (exists) setCwd(clean)
        else next.push(`cd: ${arg}: No such file or directory`)
      }
    } else if (cmd === 'cat' || cmd === 'type') {
      const path = arg.replace(/^\/workspace\/?/, '')
      const full = arg.startsWith('/') ? path : cwd ? `${cwd}/${arg}` : arg
      next.push(files[full] || `cat: ${arg || 'filename'}: No such file or directory`)
    } else if (onRunCommand) {
      setRunning(true)
      setLines([...next, 'running…'])
      try {
        const text = await onRunCommand(input)
        setLines([...next, text || '(no output)'])
      } catch (error) {
        setLines([...next, error instanceof Error ? error.message : 'Command failed'])
      } finally {
        setRunning(false)
      }
      return
    } else next.push(`${cmd}: command not found`)
    setLines(next)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0c0c0b] p-2">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-xl bg-[#161615]">
        <div className="flex h-9 shrink-0 items-center gap-1.5 px-3 text-[13px] text-white/70">
          <span>Terminal 1</span>
          <span className="text-[10px] text-white/35">▾</span>
        </div>
        <div className="thin-scroll min-h-0 flex-1 overflow-auto px-4 pb-4 font-mono text-[13px] leading-6 text-white/85">
          {lines.map((line, index) => (
            <p key={index} className="whitespace-pre-wrap break-all">
              {line}
            </p>
          ))}
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (running) return
              const typed = value
              setValue('')
              void run(typed)
            }}
            className="flex items-center gap-2"
          >
            <span className="shrink-0 text-white/55">{prompt}</span>
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              disabled={running}
              className="min-w-0 flex-1 bg-transparent caret-white outline-none disabled:opacity-40"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
            />
          </form>
          <div ref={end} />
        </div>
      </div>
    </div>
  )
}

function listFolder(files: Record<string, string>, folder: string) {
  const prefix = folder ? `${folder}/` : ''
  const dirs = new Set<string>()
  const rows: { name: string; path: string; dir: boolean }[] = []
  for (const path of Object.keys(files).sort()) {
    if (prefix && !path.startsWith(prefix)) continue
    const rest = prefix ? path.slice(prefix.length) : path
    if (!rest) continue
    const cut = rest.indexOf('/')
    if (cut >= 0) {
      const name = rest.slice(0, cut)
      if (dirs.has(name)) continue
      dirs.add(name)
      rows.push({ name, path: prefix + name, dir: true })
    } else {
      rows.push({ name: rest, path, dir: false })
    }
  }
  return rows
}

function GitPane({
  title,
  diffs,
  commands,
  files,
  onAcceptDiff,
  onRejectDiff,
  repo,
  onCommit,
  onPullRequest,
}: {
  title: string
  diffs: Extract<AgentEvent, { kind: 'diff' }>[]
  commands: Extract<AgentEvent, { kind: 'command' }>[]
  files: Record<string, string>
  onAcceptDiff?: (path: string) => void
  onRejectDiff?: (path: string) => void
  repo?: { fullName: string; name?: string } | null
  onCommit?: (message: string) => Promise<string>
  onPullRequest?: (title: string) => Promise<string>
}) {
  const [view, setView] = useState<'diff' | 'review' | 'commits'>('diff')
  const [message, setMessage] = useState('Update from Studio')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const commits = commands.filter((item) => /commit/i.test(item.command))
  const open = diffs.filter((item) => item.accepted === undefined)

  async function run(kind: 'commit' | 'pr') {
    setBusy(true)
    setStatus('')
    try {
      const url = kind === 'pr' ? await onPullRequest?.(message) : await onCommit?.(message)
      setStatus(url || (kind === 'pr' ? 'Pull request opened.' : 'Committed.'))
      if (url) window.open(url, '_blank', 'noopener')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'GitHub request failed')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="thin-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
      <p className="text-[13px] text-white/50">{title}</p>
      <p className="mt-1 font-mono text-[12px] text-white/35">{repo?.fullName ? `${repo.fullName}` : 'No GitHub repo attached'} · {Object.keys(files).length} files</p>
      <div className="mt-3 flex gap-1">
        {(['diff', 'review', 'commits'] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setView(item)}
            className={`rounded-md px-2.5 py-1 text-[12px] capitalize ${
              view === item ? 'bg-white/[0.08] text-white' : 'text-white/40 hover:text-white'
            }`}
          >
            {item}
          </button>
        ))}
      </div>
      {onCommit && (
        <div className="mt-3 rounded-xl border border-white/10 bg-[#111110] p-3">
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[13px] text-white outline-none"
            placeholder="Commit message"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !repo || !message.trim()}
              onClick={() => void run('commit')}
              className="rounded-lg bg-white px-2.5 py-1 text-[12px] font-medium text-[#111110] disabled:opacity-40"
            >
              {busy ? 'Working…' : 'Commit to GitHub'}
            </button>
            <button
              type="button"
              disabled={busy || !repo || !message.trim() || !onPullRequest}
              onClick={() => void run('pr')}
              className="rounded-lg border border-white/15 px-2.5 py-1 text-[12px] text-white disabled:opacity-40"
            >
              Open pull request
            </button>
          </div>
          {!repo && <p className="mt-2 text-[12px] text-white/35">Attach a GitHub project in chat to commit.</p>}
          {status && <p className="mt-2 text-[12px] text-white/50">{status}</p>}
        </div>
      )}
      {view !== 'commits' && open.length > 1 && onAcceptDiff && (
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => open.forEach((item) => onRejectDiff?.(item.path))}
            className="rounded-lg px-2.5 py-1 text-[12px] text-white/40 hover:text-white"
          >
            Discard all
          </button>
          <button
            type="button"
            onClick={() => open.forEach((item) => onAcceptDiff(item.path))}
            className="rounded-lg bg-white px-2.5 py-1 text-[12px] font-medium text-[#111110]"
          >
            Keep all
          </button>
        </div>
      )}
      <div className="mt-4 space-y-4">
        {view === 'commits' ? (
          commits.length === 0 ? (
            <p className="text-[13px] text-white/35">No commits yet.</p>
          ) : (
            commits.map((item, index) => (
              <p key={index} className="rounded-lg border border-white/8 bg-[#141413] px-3 py-2 font-mono text-[12px] text-white/70">
                {item.command}
              </p>
            ))
          )
        ) : diffs.length === 0 ? (
          <p className="text-[13px] text-white/35">No file changes yet.</p>
        ) : (
          diffs.map((diff, index) => (
            <div key={`${diff.path}-${index}`} className="overflow-hidden rounded-xl border border-white/10 bg-[#111110]">
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="font-mono text-[12px] text-white/70">{diff.path}</span>
                <span className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-[#3fb950]">
                  +{diff.added} {diff.removed > 0 && <span className="text-[#f85149]">-{diff.removed}</span>}
                  {view === 'review' && <span className="ml-1 text-white/30">New</span>}
                </span>
              </div>
              {(() => {
                const source = files[diff.path] || ''
                const blob = diff.lines.find((line) => /^data:image\//i.test(line.text))?.text
                const imageSrc = /^data:image\//i.test(source)
                  ? source
                  : blob ||
                    (/\.(png|jpe?g|gif|webp|ico|bmp|avif)$/i.test(diff.path) && source.startsWith('/api/studio/images/')
                      ? `${typeof window !== 'undefined' ? window.location.origin : ''}${source}`
                      : '')
                if (imageSrc) {
                  return (
                    <img
                      src={imageSrc}
                      alt=""
                      className="block max-h-56 w-full border-t border-white/6 bg-[#0a0a0a] object-contain object-center"
                    />
                  )
                }
                const body =
                  diff.lines
                    .filter((line) => line.kind !== 'del')
                    .map((line) =>
                      /^data:image\//i.test(line.text) || (line.text.length > 800 && /\.(png|jpe?g|gif|webp)$/i.test(diff.path))
                        ? `Generated image · ~${Math.max(1, Math.round((line.text.length * 0.75) / 1024))} KB`
                        : line.text,
                    )
                    .join('\n') || source
                return (
                  <pre className="overflow-x-hidden border-t border-white/6 p-3 font-mono text-[11px] leading-5 text-[#aff5b4] whitespace-pre-wrap break-all">
                    {body}
                  </pre>
                )
              })()}
              {onAcceptDiff && diff.accepted === undefined && (
                <div className="flex items-center justify-end gap-2 border-t border-white/8 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onRejectDiff?.(diff.path)}
                    className="rounded-lg px-2.5 py-1 text-[12px] text-white/40 hover:text-white"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={() => onAcceptDiff(diff.path)}
                    className="rounded-lg bg-white px-2.5 py-1 text-[12px] font-medium text-[#111110]"
                  >
                    Keep
                  </button>
                </div>
              )}
              {diff.accepted === true && <p className="px-3 py-1.5 text-[11px] text-white/35">Kept</p>}
              {diff.accepted === false && <p className="px-3 py-1.5 text-[11px] text-white/35">Discarded</p>}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function BillingPane({ plan }: { plan?: string }) {
  return (
    <div className="thin-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-8">
      <p className="text-[13px] text-white/40">Current plan</p>
      <h2 className="mt-1 text-[22px]">{planLabel(plan)}</h2>
      <p className="mt-2 max-w-md text-[14px] text-white/50">
        Studio, connectors, and cloud runs follow this plan. Upgrade when you need more models or connectors.
      </p>
      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={() => navigate('/dashboard/billing')}
          className="rounded-lg border border-white/12 px-3 py-2 text-[13px] text-white/80"
        >
          Manage billing
        </button>
        <button
          type="button"
          onClick={() => navigate(checkoutPath('pro'))}
          className="rounded-lg bg-white px-3 py-2 text-[13px] font-medium text-[#111110]"
        >
          Upgrade
        </button>
      </div>
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/50 p-6" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#161615] p-5" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[15px] text-white">{title}</p>
          <button type="button" onClick={onClose} className="text-[13px] text-white/45 hover:text-white">
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

function MenuRow({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] text-white/80 hover:bg-white/[0.06]">
      <span className="grid h-4 w-4 place-items-center text-white/45">{icon}</span>
      {label}
    </button>
  )
}

function clockStamp() {
  return new Date().toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function DotsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
      <circle cx="3" cy="7" r="1" />
      <circle cx="7" cy="7" r="1" />
      <circle cx="11" cy="7" r="1" />
    </svg>
  )
}

function CursorIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 2.2 11.2 7.1 7.4 8l1.8 3.6-1.5.8-1.8-3.6L3 11.4Z" fill="currentColor" />
    </svg>
  )
}

function CollapseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M11.8 5.8V2.2H8.2M11.5 2.5 8 6M2.2 8.2v3.6h3.6M2.5 11.5 6 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M8.2 2.2H11.8V5.8M11.5 2.5 8 6M5.8 11.8H2.2V8.2M2.5 11.5 6 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function CubeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M7 1.6 12.2 4.4v5.2L7 12.4 1.8 9.6V4.4Z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 12.4V7M1.8 4.4 7 7l5.2-2.6" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function DialIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 7 9.4 4.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="4.2" y="4.2" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.8 9.2V2.8h6.4" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function PulseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M1.5 7h2.2l1.2-3.2L7.2 11l1.6-4H12.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ArchiveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 3.2h10v2.2H2Z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.1 5.4h7.8V11H3.1Z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.8 8h2.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
