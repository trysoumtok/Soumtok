import { useEffect, useRef, useState } from 'react'
import { fetchSkills, removeSkill, uploadSkill, type UserSkill } from '../../lib/api'
import { ConfirmCard, useConfirmDelete } from '../ConfirmCard'

function prettySize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function SkillsPanel() {
  const [skills, setSkills] = useState<UserSkill[]>([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const remove = useConfirmDelete()

  async function reload() {
    const data = await fetchSkills()
    setSkills(data.skills)
  }

  useEffect(() => {
    reload().catch(() => setStatus('Could not load skills'))
  }, [])

  async function onPick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setStatus('')
    try {
      await uploadSkill(file)
      await reload()
      setStatus(`Saved ${file.name} as a skill. Agents can use it from Studio.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save that skill')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-medium">Skills</h2>
          <p className="mt-1 max-w-xl text-[13px] leading-5 text-white/40">
            Upload PDFs, notes, and files you already have. Soumtok stores them as your skills and Studio can give them to an agent.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="rounded-md bg-white px-3 py-1.5 text-[13px] font-medium text-black disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Upload skill'}
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.md,.txt,.json,.csv,.html,.zip,.png,.jpg,.jpeg,.webp,.gif,.docx,.exe,.msi,.dmg,.skill"
          onChange={(event) => onPick(event.target.files?.[0])}
        />
      </div>

      {status && <p className="text-[13px] text-white/45">{status}</p>}

      {skills.length === 0 ? (
        <p className="text-[13px] text-white/40">No skills yet. Upload a PDF or a file you downloaded.</p>
      ) : (
        <div className="divide-y divide-white/[0.04] overflow-hidden rounded-xl border border-white/[0.06] bg-[#141413]">
          {skills.map((skill) => (
            <div key={skill.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-white">{skill.name}</p>
                <p className="truncate text-[12px] text-white/35">
                  {skill.file_name} · {prettySize(skill.size)}
                </p>
              </div>
              <button
                type="button"
                className="text-[12px] text-white/40 hover:text-white"
                onClick={() => remove.ask(skill.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {remove.target && (
        <ConfirmCard
          title="Remove skill"
          body={`${skills.find((item) => item.id === remove.target)?.name || 'This skill'} will be removed from your skills and from new agent runs.`}
          confirmLabel="Remove"
          busy={remove.busy}
          error={remove.error}
          onCancel={remove.cancel}
          onConfirm={() =>
            remove.run(async () => {
              await removeSkill(remove.target!)
              setSkills((current) => current.filter((row) => row.id !== remove.target))
            })
          }
        />
      )}
    </div>
  )
}
