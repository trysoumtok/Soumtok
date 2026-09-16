/**
 * Voice transcription IPC — registered as soon as this module loads so renderer
 * never hits "No handler registered for speech:transcribe" after preload reload.
 */
const { ipcMain } = require('electron')

/** @type {null | ((payload: unknown) => Promise<{ text?: string; error?: string }>)} */
let transcribeFn = null

function registerSpeechTranscribe(fn) {
  transcribeFn = fn
}

ipcMain.handle('speech:transcribe', async (_event, payload) => {
  if (!transcribeFn) {
    return {
      error:
        'Voice plugin not ready — fully quit Soumtok Desktop and start it again (npm run dev in the desktop folder).',
    }
  }
  try {
    return await transcribeFn(payload)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Transcription failed' }
  }
})

module.exports = { registerSpeechTranscribe }
