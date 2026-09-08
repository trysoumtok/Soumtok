import { useEffect, useState, type FormEvent } from 'react'
import {
  createDocument,
  deleteFile,
  fetchDocuments,
  fetchFiles,
  fetchProfile,
  uploadFile,
  type DocumentRow,
  type FileRow,
} from '../lib/api'
import { signOut, useSession } from '../lib/auth-client'
import { AccountSkeleton } from './Loaders'
import { ConfirmCard, useConfirmDelete } from './ConfirmCard'
import { PillButton } from './ui'

export function AccountModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { data: session } = useSession()
  const [docs, setDocs] = useState<DocumentRow[]>([])
  const [files, setFiles] = useState<FileRow[]>([])
  const [username, setUsername] = useState('')
  const [emailVerified, setEmailVerified] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const fileDelete = useConfirmDelete()

  useEffect(() => {
    if (!open || !session) return
    setLoading(true)
    Promise.all([
      fetchDocuments().then(setDocs).catch(() => setError('Could not load your documents')),
      fetchFiles().then(setFiles).catch(() => undefined),
      fetchProfile()
        .then((profile) => {
        setUsername(profile.username || '')
        setEmailVerified(profile.emailVerified)
      })
        .catch(() => undefined),
    ]).finally(() => setLoading(false))
  }, [open, session])

  if (!open || !session) return null

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      const created = await createDocument(title, content)
      setDocs((current) => [
        {
          id: created.id,
          title: created.title,
          content: created.content,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        ...current,
      ])
      setTitle('')
      setContent('')
    } catch {
      setError('Could not save that document')
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-[520px] overflow-auto rounded-2xl border border-white/10 bg-[#141413] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[13px] text-white/40">Signed in</p>
        <h3 className="mt-1 text-[24px] font-semibold tracking-[-0.03em]">
          {username ? `@${username}` : session.user.name || session.user.email}
        </h3>
        <p className="text-[13px] text-white/45">{session.user.email}</p>
        <p className="mt-2 text-[12px] text-white/40">
          Email {emailVerified ? 'verified' : 'not verified'}
        </p>

        {loading ? (
          <AccountSkeleton />
        ) : (
          <>
        <form className="mt-6 flex flex-col gap-3" onSubmit={onCreate}>
          <p className="text-[13px] text-white/55">Your documents</p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="rounded-xl border border-white/10 bg-[#0b0b0a] px-3 py-3 text-[14px] outline-none placeholder:text-white/30"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Notes, specs, or a collection item"
            rows={3}
            className="resize-none rounded-xl border border-white/10 bg-[#0b0b0a] px-3 py-3 text-[14px] outline-none placeholder:text-white/30"
          />
          <PillButton type="submit">Save document</PillButton>
        </form>

        {error && <p className="mt-3 text-[13px] text-[#ff8a70]">{error}</p>}

        <div className="mt-8">
          <p className="text-[13px] text-white/55">Your files (Bunny)</p>
          <label className="mt-3 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-white/15 px-3 py-4 text-[13px] text-white/60 hover:border-white/30">
            <input
              type="file"
              className="hidden"
              disabled={uploading}
              onChange={async (event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (!file) return
                setError('')
                setUploading(true)
                try {
                  const saved = await uploadFile(file)
                  setFiles((current) => [
                    {
                      id: saved.id,
                      name: saved.name,
                      size: saved.size,
                      content_type: saved.content_type || file.type,
                      created_at: new Date().toISOString(),
                    },
                    ...current,
                  ])
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Upload failed')
                } finally {
                  setUploading(false)
                }
              }}
            />
            {uploading ? 'Uploading…' : 'Upload a file (25 MB max)'}
          </label>
          <div className="mt-3 space-y-2">
            {files.length === 0 && (
              <p className="text-[13px] text-white/35">No files yet. They live on Bunny, not in Neon.</p>
            )}
            {files.map((file) => (
              <article
                key={file.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-[#0b0b0a] px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px]">{file.name}</p>
                  <p className="text-[12px] text-white/35">{Math.max(1, Math.round(file.size / 1024))} KB</p>
                </div>
                <div className="flex shrink-0 gap-3 text-[12px]">
                  <a href={`/api/files/${file.id}/download`} className="text-white/55 no-underline hover:text-white">
                    Download
                  </a>
                  <button
                    type="button"
                    className="text-white/35 hover:text-[#ff8a70]"
                    onClick={() => fileDelete.ask(file.id)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-5 space-y-2">
          {docs.length === 0 && (
            <p className="text-[13px] text-white/35">No documents yet. This is your cheap collection store.</p>
          )}
          {docs.map((doc) => (
            <article key={doc.id} className="rounded-xl border border-white/8 bg-[#0b0b0a] px-3 py-3">
              <p className="text-[14px] font-medium">{doc.title}</p>
              <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-[13px] text-white/45">{doc.content || 'Empty'}</p>
            </article>
          ))}
        </div>
          </>
        )}

        <button
          type="button"
          className="mt-6 text-[13px] text-white/45"
          onClick={async () => {
            await signOut()
            onClose()
          }}
        >
          Sign out
        </button>
      </div>
      {fileDelete.target && (
        <ConfirmCard
          title="Delete this file?"
          body={`${files.find((item) => item.id === fileDelete.target)?.name || 'This file'} will be removed from storage.`}
          busy={fileDelete.busy}
          error={fileDelete.error}
          onCancel={fileDelete.cancel}
          onConfirm={() =>
            fileDelete.run(async () => {
              await deleteFile(fileDelete.target!)
              setFiles((current) => current.filter((item) => item.id !== fileDelete.target))
            })
          }
        />
      )}
    </div>
  )
}
