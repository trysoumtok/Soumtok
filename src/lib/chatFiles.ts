import type { ChatFile } from '../../shared/chatMedia'
import { guessMime, isTextAttachment, TEXT_FILE_EXT } from '../../shared/chatMedia'
import { uploadStudioAttachment } from './api'

const MAX_FILES = 6
const MAX_IMAGE = 6 * 1024 * 1024
const MAX_VIDEO = 8 * 1024 * 1024
const MAX_PDF = 8 * 1024 * 1024
const MAX_TEXT = 400 * 1024
const MAX_OTHER = 2 * 1024 * 1024

function capFor(mime: string, name: string) {
  if (mime.startsWith('image/')) return MAX_IMAGE
  if (mime.startsWith('video/')) return MAX_VIDEO
  if (mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) return MAX_PDF
  if (mime.startsWith('text/') || TEXT_FILE_EXT.test(name)) return MAX_TEXT
  return MAX_OTHER
}

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

export async function readChatFiles(list: File[]): Promise<{ files: ChatFile[]; error?: string }> {
  const files: ChatFile[] = []
  let total = 0
  for (const file of list) {
    if (files.length >= MAX_FILES) {
      return { files, error: `You can attach up to ${MAX_FILES} files.` }
    }
    const mime = guessMime(file.name, file.type)
    const cap = capFor(mime, file.name)
    if (file.size > cap) {
      return { files, error: `${file.name} is too large. Keep it under ${Math.round(cap / 1024 / 1024)} MB.` }
    }
    if (total + file.size > 12 * 1024 * 1024) {
      return { files, error: 'Those files together are too large. Attach fewer, or smaller ones.' }
    }
    total += file.size
    try {
      const saved = await uploadStudioAttachment(file)
      const chat: ChatFile = {
        id: saved.id,
        documentId: saved.documentId,
        name: saved.name,
        mime: saved.mime,
        size: saved.size,
        text: saved.text,
        analysis: saved.analysis,
      }
      if (!saved.text && (mime.startsWith('image/') || mime.startsWith('video/') || mime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
        chat.dataUrl = await readDataUrl(file)
      } else if (!saved.id && !saved.text) {
        chat.dataUrl = await readDataUrl(file)
      }
      files.push(chat)
    } catch (error) {
      if (isTextAttachment(file.name, mime)) {
        const text = (await file.text()).slice(0, 200_000)
        files.push({ name: file.name, mime, size: file.size, text })
      } else {
        files.push({ name: file.name, mime, size: file.size, dataUrl: await readDataUrl(file) })
      }
      return {
        files,
        error: error instanceof Error ? error.message : 'Could not save that file to your documents',
      }
    }
  }
  return { files }
}
