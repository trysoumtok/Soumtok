import { useCallback, useEffect, useState } from 'react'
import { formatShareDuration } from '../../../shared/testHubDeploy'
import { deleteTestHubDeploy, fetchTestHubDeploys, type TestHubDeployRow } from '../../lib/api'

function formatWhen(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function statusLabel(row: TestHubDeployRow) {
  if (row.expired) return 'Expired'
  if (row.live) return 'Live'
  return 'Saved'
}

export function TestHubShareLinksPanel({
  compact = false,
  refreshKey = 0,
  projectId,
  projectTitle,
}: {
  compact?: boolean
  refreshKey?: number
  projectId?: string
  projectTitle?: string
}) {
  const [rows, setRows] = useState<TestHubDeployRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchTestHubDeploys(30, projectId)
      setRows(data.rows || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load share links')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load, refreshKey, projectId])

  const onCopy = async (url: string, btn?: HTMLButtonElement | null) => {
    try {
      await navigator.clipboard.writeText(url)
      if (btn) {
        const prev = btn.textContent
        btn.textContent = 'Copied'
        window.setTimeout(() => {
          if (btn.textContent === 'Copied') btn.textContent = prev || 'Copy'
        }, 2000)
      }
      setNote('Copied')
    } catch {
      setNote(url)
    }
  }

  const onDelete = async (row: TestHubDeployRow) => {
    if (!window.confirm(`Delete share link “${row.slug || row.title}”?`)) return
    setBusyId(row.id)
    setNote('')
    try {
      await deleteTestHubDeploy(row.id)
      setRows((current) => current.filter((item) => item.id !== row.id))
      setNote('Link deleted')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete link')
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className={compact ? '' : 'space-y-3'}>
      {!compact ? (
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[13px] text-white/45">Test Hub share links</h2>
            <p className="mt-1 max-w-[560px] text-[12px] leading-5 text-white/35">
              {projectId
                ? `Share links for ${projectTitle || 'this project'}. They stay with the project after refresh.`
                : 'Published previews from Test Hub. You choose how long each link lives (max 30 days) — expired links are removed automatically.'}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-md border border-white/15 px-2.5 py-1 text-[12px] text-white/70 hover:bg-white/[0.05]"
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      ) : null}

      {loading ? <p className="text-[12px] text-white/40">Loading share links…</p> : null}
      {error ? <p className="text-[12px] text-[#e06c75]">{error}</p> : null}
      {note ? <p className="text-[12px] text-white/45">{note}</p> : null}

      {!loading && !rows.length ? (
        <p className="text-[12px] text-white/40">
          {projectId ? 'No links for this project yet. Publish from Share link.' : 'No share links yet. Publish one from Test Hub.'}
        </p>
      ) : null}

      {rows.length ? (
        <div className={`overflow-hidden rounded-xl border border-white/[0.08] bg-[#141413] ${compact ? 'max-h-[240px] overflow-y-auto' : ''}`}>
          {rows.map((row) => {
            const status = statusLabel(row)
            const statusClass =
              status === 'Live'
                ? 'text-emerald-400'
                : status === 'Expired'
                  ? 'text-white/35'
                  : 'text-amber-300/80'
            return (
              <div
                key={row.id}
                className="flex flex-col gap-2 border-t border-white/[0.05] px-4 py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[13px] text-white">{row.title || row.slug || 'Preview'}</p>
                    <span className={`text-[11px] ${statusClass}`}>{status}</span>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-[#5b8ef5]">{row.url}</p>
                  <p className="mt-0.5 text-[11px] text-white/35">
                    {!projectId && row.project_title ? `${row.project_title} · ` : ''}
                    {row.file_count || 0} file{(row.file_count || 0) === 1 ? '' : 's'} · published {formatWhen(row.created_at)}
                    {!row.expired ? ` · expires ${formatWhen(row.expires_at)}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-white/15 px-2.5 py-1 text-[12px] text-white/75 hover:bg-white/[0.05]"
                    onClick={(e) => void onCopy(row.url, e.currentTarget)}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-red-500/35 px-2.5 py-1 text-[12px] text-red-400 hover:bg-red-500/10 disabled:opacity-45"
                    disabled={busyId === row.id}
                    onClick={() => void onDelete(row)}
                  >
                    {busyId === row.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
