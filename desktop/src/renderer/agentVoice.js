/**
 * Live voice → text — inline composer sheet + Soumtok avatar + mic wave.
 * Whisper chunks run in parallel; Web Speech adds interim captions when available.
 */
;(function agentVoiceModule() {
  const SLICE_MS = 1400
  let recognition = null
  let listening = false
  let voicePrefix = ''
  let sessionFinal = ''
  let sessionInterim = ''
  let audioCtx = null
  let analyser = null
  let micStream = null
  let mediaRecorder = null
  let whisperMime = ''
  let recorderSliceTimer = null
  let animFrame = 0
  let clickBound = false
  let statusLocked = false
  let transcribeInflight = 0
  let sliceSerial = 0

  function $(id) {
    return document.getElementById(id)
  }

  function useServerStt() {
    return typeof window.soumtok?.speechTranscribe === 'function'
  }

  function speechApi() {
    return window.SpeechRecognition || window.webkitSpeechRecognition
  }

  function sheet() {
    return $('agent-voice-sheet')
  }

  function setStatus(msg) {
    const el = $('agent-voice-status')
    if (el) el.textContent = msg
  }

  function combinedTranscript() {
    const base = sessionFinal.trim()
    const live = sessionInterim.trim()
    if (!base) return live
    if (!live) return base
    if (base.toLowerCase().endsWith(live.toLowerCase())) return base
    return `${base} ${live}`
  }

  function refreshTranscriptView() {
    const combined = combinedTranscript()
    setLiveText(combined || 'Listening…')
    syncInput(combined)
  }

  function setLiveText(text) {
    const live = $('agent-voice-live')
    if (live) live.textContent = text || 'Listening…'
  }

  function syncInput(full) {
    const input = $('agent-input')
    if (!input || !listening) return
    input.value = full
    input.dispatchEvent(new Event('input', { bubbles: true }))
    if (typeof growAgentInput === 'function') growAgentInput()
  }

  function setWaveIdle() {
    document.querySelectorAll('.agent-voice-wave span').forEach((bar) => {
      bar.style.transform = 'scaleY(0.18)'
    })
  }

  function stopAnalyser() {
    cancelAnimationFrame(animFrame)
    animFrame = 0
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop())
      micStream = null
    }
    if (audioCtx) {
      void audioCtx.close()
      audioCtx = null
    }
    analyser = null
    setWaveIdle()
  }

  function clearRecorderSliceTimer() {
    if (recorderSliceTimer) {
      clearTimeout(recorderSliceTimer)
      recorderSliceTimer = null
    }
  }

  function stopWhisper() {
    clearRecorderSliceTimer()
    if (!mediaRecorder) return
    try {
      if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
    } catch {
      /* ignore */
    }
    mediaRecorder = null
  }

  function reportTranscribeError(msg) {
    if (statusLocked) return
    statusLocked = true
    setStatus(String(msg || 'Transcription failed'))
    setLiveText('You can still type your prompt below.')
  }

  function mergeTranscript(piece) {
    const chunk = String(piece || '').trim()
    if (!chunk) return
    sessionInterim = ''
    const base = sessionFinal.trim()
    if (!base) {
      sessionFinal = chunk
      refreshTranscriptView()
      return
    }
    const lowerBase = base.toLowerCase()
    const lowerChunk = chunk.toLowerCase()
    if (lowerChunk === lowerBase || lowerBase.endsWith(lowerChunk)) return
    if (lowerChunk.length > 12 && lowerBase.includes(lowerChunk)) return

    let overlap = 0
    const max = Math.min(base.length, chunk.length, 120)
    for (let i = max; i > 2; i--) {
      if (lowerBase.slice(-i) === lowerChunk.slice(0, i)) {
        overlap = i
        break
      }
    }
    const add = chunk.slice(overlap).trim()
    if (!add) return
    sessionFinal = `${base} ${add}`.replace(/\s+/g, ' ').trim()
    refreshTranscriptView()
    if (!statusLocked) setStatus('Live — words appear as you speak')
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const raw = String(reader.result || '')
        resolve(raw.includes(',') ? raw.split(',')[1] : raw)
      }
      reader.onerror = () => reject(reader.error || new Error('Could not read audio'))
      reader.readAsDataURL(blob)
    })
  }

  function queueTranscribe(blob) {
    if (!blob?.size || blob.size < 400) return
    transcribeInflight++
    const pulse =
      transcribeInflight > 0 && !combinedTranscript()
        ? 'Listening…'
        : combinedTranscript() || 'Listening…'
    if (!statusLocked) setLiveText(`${pulse}${transcribeInflight > 1 ? ' ·' : ''}`)

    void (async () => {
      try {
        if (!listening) return
        const audio = await blobToBase64(blob)
        if (!listening) return
        const spoken = sessionFinal.trim()
        const promptTail = spoken.length > voicePrefix.trim().length ? spoken.slice(-400) : ''
        let out
        try {
          out = await window.soumtok.speechTranscribe({
            audio,
            mime: blob.type || whisperMime || 'audio/webm',
            language: navigator.language || 'en-US',
            prompt: promptTail,
          })
        } catch (err) {
          const msg = String(err?.message || err)
          if (/no handler registered/i.test(msg)) {
            reportTranscribeError(
              'Reload the window (Ctrl+R) to enable voice, or fully restart Soumtok Desktop.',
            )
          } else if (transcribeInflight <= 1) {
            reportTranscribeError(msg)
          }
          return
        }
        if (!listening) return
        if (out?.text) mergeTranscript(out.text)
        else if (out?.error && transcribeInflight <= 1) reportTranscribeError(out.error)
        else refreshTranscriptView()
      } catch (err) {
        if (transcribeInflight <= 1) reportTranscribeError(err?.message || err)
      } finally {
        transcribeInflight = Math.max(0, transcribeInflight - 1)
        if (listening && !statusLocked) refreshTranscriptView()
      }
    })()
  }

  function beginRecorderSlice() {
    if (!listening || !micStream || typeof MediaRecorder === 'undefined') return
    sliceSerial++
    const chunks = []
    let recorder
    try {
      recorder = whisperMime
        ? new MediaRecorder(micStream, { mimeType: whisperMime })
        : new MediaRecorder(micStream)
    } catch {
      reportTranscribeError('Could not start mic recorder.')
      return
    }
    mediaRecorder = recorder
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data)
    }
    recorder.onerror = () => reportTranscribeError('Mic recording error — try again or type below.')
    recorder.onstop = () => {
      clearRecorderSliceTimer()
      if (mediaRecorder === recorder) mediaRecorder = null
      const type = recorder.mimeType || whisperMime || 'audio/webm'
      const blob = new Blob(chunks, { type })
      queueTranscribe(blob)
      if (listening) beginRecorderSlice()
    }
    try {
      recorder.start()
    } catch (err) {
      reportTranscribeError(String(err.message || err))
      return
    }
    recorderSliceTimer = setTimeout(() => {
      if (recorder.state === 'recording') {
        try {
          recorder.stop()
        } catch {
          /* ignore */
        }
      }
    }, SLICE_MS)
  }

  function startWhisper() {
    if (!micStream || typeof MediaRecorder === 'undefined') {
      setStatus('Recording not supported — type your prompt instead.')
      setLiveText('Type in the box below.')
      return
    }
    whisperMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : ''
    setStatus('Live — words appear as you speak')
    beginRecorderSlice()
  }

  async function startMic() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone unavailable')
    if (micStream) return
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    })
    audioCtx = new AudioContext()
    const source = audioCtx.createMediaStreamSource(micStream)
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 128
    analyser.smoothingTimeConstant = 0.78
    source.connect(analyser)
    const bars = document.querySelectorAll('.agent-voice-wave span')
    const data = new Uint8Array(analyser.frequencyBinCount)
    const tick = () => {
      if (!listening || !analyser) return
      analyser.getByteFrequencyData(data)
      bars.forEach((bar, i) => {
        const idx = Math.min(i + 2, data.length - 1)
        const v = data[idx] / 255
        bar.style.transform = `scaleY(${0.1 + v * 0.9})`
      })
      animFrame = requestAnimationFrame(tick)
    }
    animFrame = requestAnimationFrame(tick)
  }

  function showSheet(show) {
    const el = sheet()
    const composer = document.querySelector('.agent-composer, .bot-composer-wrap')
    if (el) el.hidden = !show
    document.body.classList.toggle('agent-voice-open', show)
    composer?.classList.toggle('voice-open', show)
    if (show) {
      const host = $('agent-voice-avatar-host')
      const violet = window.SoumtokAgentAvatar?.voiceColor?.() || '#7c6beb'
      window.SoumtokAgentAvatar?.mountVoice(host, { size: 40, color: violet })
    } else {
      window.SoumtokAgentAvatar?.destroyVoice()
    }
  }

  function stopRecognition() {
    if (!recognition) return
    try {
      recognition.onend = null
      recognition.stop()
    } catch {
      /* ignore */
    }
    recognition = null
  }

  function stop() {
    if (!listening) {
      showSheet(false)
      return
    }
    listening = false
    statusLocked = false
    stopRecognition()
    stopWhisper()
    stopAnalyser()
    transcribeInflight = 0
    sessionInterim = ''
    showSheet(false)
    $('agent-input')?.focus()
    document.querySelectorAll('.agent-voice-btn, .bot-composer-mic').forEach((btn) => {
      btn.classList.remove('on')
      btn.setAttribute('aria-pressed', 'false')
    })
  }

  function startRecognitionInterim() {
    const SR = speechApi()
    if (!SR) return
    recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = navigator.language || 'en-US'
    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0].transcript
        if (event.results[i].isFinal) mergeTranscript(piece)
        else interim += piece
      }
      sessionInterim = interim.trim()
      refreshTranscriptView()
    }
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setStatus('Microphone blocked — allow mic in Windows settings.')
        stopRecognition()
        return
      }
      if (event.error === 'no-speech' || event.error === 'aborted' || event.error === 'network') return
      setStatus(`Voice: ${event.error}`)
    }
    recognition.onend = () => {
      if (!listening) return
      try {
        recognition.start()
      } catch {
        /* ignore */
      }
    }
    try {
      recognition.start()
    } catch {
      recognition = null
    }
  }

  async function start() {
    const input = $('agent-input')
    if (input?.disabled) return
    voicePrefix = input?.value ? `${input.value.replace(/\s+$/, '')} ` : ''
    sessionFinal = voicePrefix
    sessionInterim = ''
    statusLocked = false
    transcribeInflight = 0
    sliceSerial = 0
    setStatus('Live — words appear as you speak')
    setLiveText('Listening…')
    showSheet(true)
    listening = true
    document.querySelectorAll('.agent-voice-btn, .bot-composer-mic').forEach((btn) => {
      btn.classList.add('on')
      btn.setAttribute('aria-pressed', 'true')
    })
    try {
      await startMic()
    } catch {
      setStatus('Allow microphone access to use voice input.')
      setLiveText('You can still type your prompt below.')
      if (useServerStt()) return
    }
    if (useServerStt()) {
      startWhisper()
      startRecognitionInterim()
    } else {
      startRecognitionInterim()
    }
  }

  function toggle() {
    if (listening) stop()
    else void start()
  }

  function bindControls() {
    if (clickBound) return
    clickBound = true
    document.body.addEventListener('click', (event) => {
      const done = event.target.closest('#agent-voice-done')
      const cancel = event.target.closest('#agent-voice-cancel')
      if (done) {
        event.preventDefault()
        stop()
        return
      }
      if (cancel) {
        event.preventDefault()
        syncInput(voicePrefix.trim())
        sessionFinal = voicePrefix
        sessionInterim = ''
        stop()
        return
      }
      const btn = event.target.closest('#agent-voice-btn, .bot-composer-mic')
      if (!btn || btn.disabled) return
      event.preventDefault()
      event.stopPropagation()
      toggle()
    })
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && listening) {
        event.preventDefault()
        stop()
      }
    })
  }

  window.SoumtokAgentVoice = {
    start,
    stop,
    toggle,
    bindControls,
    isListening: () => listening,
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindControls)
  } else {
    bindControls()
  }
})()
