import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const fileExtract = require('../shared/fileExtract.cjs') as typeof import('../shared/fileExtract.cjs')

export const DOCUMENT_TEXT_MAX = fileExtract.FILE_TEXT_MAX
export const isExtractableDocument = fileExtract.isExtractableDocument
export const classifyFile = fileExtract.classifyFile
export const dataUrlToBuffer = fileExtract.dataUrlToBuffer
export const extractFileContent = fileExtract.extractFileContent
export const extractDocumentText = fileExtract.extractDocumentText
export const enrichAttachmentText = fileExtract.enrichAttachmentText
export const enrichAttachmentsText = fileExtract.enrichAttachmentsText

export type ChatFileLike = {
  name?: string
  mime?: string
  size?: number
  text?: string
  dataUrl?: string
  analysis?: string
  bytes?: Buffer
}
