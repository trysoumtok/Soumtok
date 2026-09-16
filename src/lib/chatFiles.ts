import type { ChatFile } from '../../shared/chatMedia'
import { guessMime, isTextAttachment, TEXT_FILE_EXT } from '../../shared/chatMedia'
import { uploadStudioAttachment } from './api'

const MAX_FILES = 6
const MAX_IMAGE = 6 * 1024 * 1024
const MAX_VIDEO = 8 * 1024 * 1024
const MAX_PDF = 8 * 1024 * 1024
const MAX_TEXT = 400 * 1024
const MAX_OTHER = 2 * 1024 * 1024
const SHRINK_OVER = 350 * 1024
const MAX_EDGE = 1600

const jobs = new Map<string, Promise<ChatFile>>()

function capFor(mime: string, name: string) {
  if (mime.startsWith('image/')) return MAX_IMAGE
  if (mime.startsWith('video/')) return MAX_VIDEO
  if (mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) return MAX_PDF
  if (mime.startsWith('text/') || TEXT_FILE_EXT.test(name)) return MAX_TEXT
  return MAX_OTHER
}

export function shouldShrinkImage(file: { type: string; size: number }) {
  if (!file.type.startsWith('image/')) return false
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return false
  return file.size > SHRINK_OVER
}

function fileName(file: File, mime: string) {
  const named = file.name?.trim()
  if (named) return named
  if (mime.startsWith('image/')) return 'pasted-image.png'
  if (mime.startsWith('video/')) return 'pasted-video.mp4'
  if (mime === 'application/pdf') return 'pasted.pdf'
  return 'pasted-file'
}

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

export async function shrinkImageFile(file: File): Promise<File> {
  if (!shouldShrinkImage(file)) return file
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    if (!blob || blob.size >= file.size) return file
    const name = fileName(file, file.type).replace(/\.(png|webp|jpe?g|gif|bmp)$/i, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg' })
  } finally {
    bitmap.close()
  }
}

function previewOf(saved: { id?: string; preview?: string }, fallback: string) {
  if (saved.preview) return saved.preview
  if (saved.id) return `/api/files/${saved.id}/download?inline=1`
  return fallback
}

type ClipboardLike = {
  files?: FileList | File[] | null
  items?: ArrayLike<{ kind: string; type: string; getAsFile: () => File | null }> | null
} | null

export function dropHasFiles(data: DataTransfer | null) {
  if (!data) return false
  if ([...data.types].includes('Files')) return true
  return Array.from(data.items || []).some((item) => item.kind === 'file')
}

export function filesFromDrop(data: DataTransfer | null) {
  if (!data) return []
  const listed = Array.from(data.files || [])
  if (listed.length) return listed
  const picked: File[] = []
  for (const item of Array.from(data.items || [])) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file) picked.push(file)
  }
  return picked
}

/** Images and files from Ctrl+V / Cmd+V, including screenshot paste. */
export function filesFromClipboard(data: ClipboardLike) {
  if (!data) return []
  const listed = Array.from(data.files || [])
  if (listed.length) return listed
  const picked: File[] = []
  for (const item of Array.from(data.items || [])) {
    if (item.kind !== 'file' && !item.type.startsWith('image/')) continue
    const file = item.getAsFile()
    if (file) picked.push(file)
  }
  return picked
}

/** True when paste belongs in another text field, not Studio chat. */
export function pasteBelongsToField(target: EventTarget | null, composer?: HTMLTextAreaElement | null) {
  const node = target as Node | null
  if (!node) return false
  if (composer && (node === composer || composer.contains(node))) return false
  const el = node as HTMLElement
  const field = typeof el.closest === 'function' ? el.closest('input, textarea, [contenteditable="true"]') : null
  return Boolean(field && field !== composer)
}

async function commitChatFile(file: File, staged: ChatFile): Promise<ChatFile> {
  const local = staged.dataUrl || ''
  try {
    const prepared = await shrinkImageFile(file)
    const saved = await uploadStudioAttachment(prepared)
    const mime = saved.mime || staged.mime
    const needsPixels = /^(image|video)\//.test(mime) || mime === 'application/pdf'
    const bytes = needsPixels && !saved.text ? await readDataUrl(prepared) : ''
    if (local.startsWith('blob:')) URL.revokeObjectURL(local)
    return {
      id: saved.id,
      documentId: saved.documentId,
      name: saved.name,
      mime: saved.mime,
      size: saved.size,
      text: saved.text,
      analysis: saved.analysis,
      dataUrl: saved.text ? undefined : bytes || previewOf(saved, local),
    }
  } catch (error) {
    if (isTextAttachment(staged.name, staged.mime)) {
      const text = (await file.text()).slice(0, 200_000)
      return { ...staged, text, dataUrl: undefined }
    }
    if (!local || local.startsWith('blob:')) {
      return { ...staged, dataUrl: await readDataUrl(file) }
    }
    throw error
  }
}

export function stageChatFile(file: File): ChatFile {
  const mime = guessMime(file.name, file.type)
  const name = fileName(file, mime)
  const dataUrl =
    typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : ''
  const staged: ChatFile = { name, mime, size: file.size, dataUrl: dataUrl || undefined }
  if (dataUrl) jobs.set(dataUrl, commitChatFile(file, staged))
  else jobs.set(name, commitChatFile(file, staged))
  return staged
}

export function settleChatFile(file: ChatFile) {
  const key = file.dataUrl || file.name
  return jobs.get(key) || Promise.resolve(file)
}

export async function settleChatFiles(files: ChatFile[]) {
  return Promise.all(files.map((file) => settleChatFile(file)))
}

export function forgetChatFile(file: ChatFile) {
  const key = file.dataUrl || file.name
  jobs.delete(key)
  if (file.dataUrl?.startsWith('blob:')) URL.revokeObjectURL(file.dataUrl)
}

export function takeChatFiles(list: File[]): { files: File[]; error?: string } {
  const files: File[] = []
  let total = 0
  for (const file of list) {
    if (files.length >= MAX_FILES) return { files, error: `You can attach up to ${MAX_FILES} files.` }
    const mime = guessMime(file.name, file.type)
    const cap = capFor(mime, file.name)
    const over = file.size > cap && !(mime.startsWith('image/') && shouldShrinkImage(file))
    if (over) {
      return { files, error: `${fileName(file, mime)} is too large. Keep it under ${Math.round(cap / 1024 / 1024)} MB.` }
    }
    if (total + Math.min(file.size, cap) > 12 * 1024 * 1024) {
      return { files, error: 'Those files together are too large. Attach fewer, or smaller ones.' }
    }
    total += file.size
    files.push(file)
  }
  return { files }
}

/** Used when the composer has no live attach handler. Upload still happens; no extra base64 copy. */
export async function readChatFiles(list: File[]): Promise<{ files: ChatFile[]; error?: string }> {
  const picked = takeChatFiles(list)
  const staged = picked.files.map(stageChatFile)
  const files = await settleChatFiles(staged)
  return { files, error: picked.error }
}
