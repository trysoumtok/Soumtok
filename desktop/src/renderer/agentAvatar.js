/**
 * Grok / bloub-style animated agent avatar (SVG + rAF, no dependencies).
 * States: idle | thinking | working
 */
;(function () {
  const DEFAULT_COLOR = '#f54e00'
  /** Voice listening — same avatar, violet tint (not brand orange). */
  const VOICE_AVATAR_COLOR = '#7c6beb'

  function blobPath(wobble) {
    const a = 34 + wobble * 3
    const b = 30 - wobble * 2
    return `M 0 ${-b}
      C ${a * 0.55} ${-b} ${a} ${-b * 0.35} ${a} ${b * 0.15}
      C ${a} ${b * 0.95} ${a * 0.35} ${b} 0 ${b}
      C ${-a * 0.35} ${b} ${-a} ${b * 0.95} ${-a} ${b * 0.15}
      C ${-a} ${-b * 0.35} ${-a * 0.55} ${-b} 0 ${-b} Z`
  }

  class AgentAvatar {
    constructor(container, opts = {}) {
      this.container = container
      this.color = opts.color || DEFAULT_COLOR
      this.baseSize = opts.size || 88
      this.state = 'idle'
      this.t = 0
      this.last = performance.now()
      this.gaze = { x: 0, y: 0, tx: 0, ty: 0 }
      this.nextGazeAt = 0
      this.blinkPhase = 0
      this.nextBlinkAt = 1.5 + Math.random() * 2.5

      container.innerHTML = ''
      container.classList.add('agent-avatar-root')

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('class', 'agent-avatar-svg')
      svg.setAttribute('viewBox', '-50 -50 100 100')
      svg.setAttribute('width', String(this.baseSize))
      svg.setAttribute('height', String(this.baseSize))
      svg.setAttribute('role', 'img')
      svg.setAttribute('aria-label', 'Soumtok agent')

      this.charWrap = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      this.charWrap.setAttribute('class', 'agent-avatar-char')

      this.bodyWrap = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      this.bodyWrap.setAttribute('class', 'agent-avatar-body-wrap')

      this.bodyPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      this.bodyPath.setAttribute('class', 'agent-avatar-body')
      this.bodyPath.setAttribute('fill', this.color)
      this.bodyWrap.appendChild(this.bodyPath)

      this.eyesWrap = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      this.eyesWrap.setAttribute('class', 'agent-avatar-eyes')

      this.eyeL = this.makeEye(-13)
      this.eyeR = this.makeEye(13)
      this.eyesWrap.appendChild(this.eyeL)
      this.eyesWrap.appendChild(this.eyeR)
      this.bodyWrap.appendChild(this.eyesWrap)

      this.charWrap.appendChild(this.bodyWrap)
      svg.appendChild(this.charWrap)
      container.appendChild(svg)

      this.svg = svg
      this.raf = 0
      this.tick = this.tick.bind(this)
      this.raf = requestAnimationFrame(this.tick)
    }

    makeEye(cx) {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      g.setAttribute('class', 'agent-avatar-eye')
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      rect.setAttribute('x', String(cx - 5))
      rect.setAttribute('y', '-8')
      rect.setAttribute('width', '10')
      rect.setAttribute('height', '16')
      rect.setAttribute('rx', '5')
      rect.setAttribute('fill', '#ffffff')
      g.appendChild(rect)
      g.dataset.cx = String(cx)
      return g
    }

    setState(next) {
      this.state = next === 'thinking' || next === 'working' ? next : 'idle'
    }

    setSize(n) {
      this.baseSize = Math.max(32, Math.min(160, Number(n) || this.baseSize))
      this.svg.setAttribute('width', String(this.baseSize))
      this.svg.setAttribute('height', String(this.baseSize))
    }

    setColor(c) {
      if (!c) return
      this.color = c
      this.bodyPath.setAttribute('fill', c)
    }

    /** Fixed gaze target (-1…1), e.g. while the agent reads code in the editor. */
    setGaze(tx, ty) {
      this.gaze.tx = Math.max(-1, Math.min(1, Number(tx) || 0))
      this.gaze.ty = Math.max(-1, Math.min(1, Number(ty) || 0))
      this.gaze.x = this.gaze.tx
      this.gaze.y = this.gaze.ty
      this.nextGazeAt = this.t + 9999
    }

    clearGazeLock() {
      this.nextGazeAt = this.t
      this.pickGaze()
    }

    pickGaze() {
      const spread = this.state === 'thinking' ? 0.4 : this.state === 'working' ? 0.35 : 0.18
      this.gaze.tx = (Math.random() - 0.5) * 2 * spread
      this.gaze.ty = (Math.random() - 0.5) * 2 * (spread * 0.35)
      const delay = this.state === 'thinking' ? 0.3 + Math.random() * 0.4 : 1.4 + Math.random() * 2
      this.nextGazeAt = this.t + delay
    }

    tick(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000)
      this.last = now
      this.t += dt

      if (this.t >= this.nextGazeAt) this.pickGaze()
      const gazeLerp = this.state === 'thinking' ? 9 : this.state === 'working' ? 6 : 2.8
      this.gaze.x += (this.gaze.tx - this.gaze.x) * gazeLerp * dt
      this.gaze.y += (this.gaze.ty - this.gaze.y) * gazeLerp * dt

      if (this.t >= this.nextBlinkAt && this.blinkPhase === 0) {
        this.blinkPhase = 0.001
      }
      if (this.blinkPhase > 0) {
        this.blinkPhase += dt * 9
        if (this.blinkPhase >= 1) {
          this.blinkPhase = 0
          this.nextBlinkAt = this.t + (this.state === 'thinking' ? 1.5 : 3) + Math.random() * 3
        }
      }
      const blinkClose = this.blinkPhase <= 0 ? 0 : Math.sin(Math.min(this.blinkPhase, 1) * Math.PI)

      let sx = 1
      let sy = 1
      let rot = 0
      let bodyTy = 0
      let charTy = 0
      let wobble = 0
      let happy = true
      let eyeRotL = -24
      let eyeRotR = 24
      let eyeScaleY = 0.62
      let eyeBobY = 0

      if (this.state === 'idle') {
        const breathe = Math.sin(this.t * 1.15)
        sx = 1 + breathe * 0.035
        sy = 1 - breathe * 0.022
        wobble = Math.sin(this.t * 0.9) * 0.4
        rot = Math.sin(this.t * 0.7) * 2
        happy = true
        eyeBobY = Math.sin(this.t * 2.2) * 5
      } else if (this.state === 'thinking') {
        happy = false
        eyeRotL = 8
        eyeRotR = -8
        eyeScaleY = 0.88
        eyeBobY = Math.sin(this.t * 4.5) * 3.5
        const crash = Math.abs(Math.sin(this.t * 10.5))
        const crash2 = Math.abs(Math.sin(this.t * 7.2 + 0.6))
        bodyTy = crash * 7 - 3.5 + crash2 * 2
        sy = 0.82 + crash * 0.22
        sx = 1.04 - crash * 0.1
        rot = Math.sin(this.t * 12) * 5 + Math.sin(this.t * 5.1) * 2
        wobble = Math.sin(this.t * 3.5) * 0.9
        charTy = Math.abs(Math.sin(this.t * 6)) * -6
      } else if (this.state === 'working') {
        happy = true
        rot = Math.sin(this.t * 5.5) * 4
        sx = 1 + Math.sin(this.t * 8) * 0.06
        sy = 1 + Math.cos(this.t * 6.2) * 0.04
        wobble = Math.sin(this.t * 2.2) * 0.6
        charTy = Math.sin(this.t * 7) * -4
        eyeBobY = Math.sin(this.t * 3.1) * 4.5
      }

      if (happy) {
        eyeRotL = -26
        eyeRotR = 26
        eyeScaleY = 0.58 - blinkClose * 0.5
      } else {
        eyeScaleY = (0.88 - blinkClose * 0.85) * 1
      }

      this.bodyPath.setAttribute('d', blobPath(wobble))
      this.bodyWrap.setAttribute(
        'transform',
        `translate(0 ${bodyTy.toFixed(2)}) rotate(${rot.toFixed(2)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)})`,
      )
      this.charWrap.setAttribute('transform', `translate(0 ${charTy.toFixed(2)})`)

      const gx = this.gaze.x * 6
      const gy = this.gaze.y * 3 + eyeBobY + (happy ? -1.5 : 0)
      this.eyesWrap.setAttribute('transform', `translate(${gx.toFixed(2)} ${gy.toFixed(2)})`)

      for (const eye of [this.eyeL, this.eyeR]) {
        const cx = Number(eye.dataset.cx)
        const isLeft = cx < 0
        const deg = isLeft ? eyeRotL : eyeRotR
        const scaleY = Math.max(0.08, eyeScaleY)
        eye.setAttribute(
          'transform',
          `translate(${cx} 0) rotate(${deg}) scale(1 ${scaleY.toFixed(3)}) translate(${-cx} 0)`,
        )
      }

      this.raf = requestAnimationFrame(this.tick)
    }

    destroy() {
      cancelAnimationFrame(this.raf)
      this.container.innerHTML = ''
      this.container.classList.remove('agent-avatar-root')
    }
  }

  let active = null
  let activeHost = null
  let voiceActive = null
  let voiceHost = null
  let extDockActive = null
  let extDockHost = null
  let agentPanelActive = null
  let agentPanelHost = null
  /** Small avatars in activity cards (re-created each thread paint). */
  const inlineAvatars = new Map()

  function brandColor() {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()
      return v || DEFAULT_COLOR
    } catch {
      return DEFAULT_COLOR
    }
  }

  window.SoumtokAgentAvatar = {
    mount(host, opts = {}) {
      if (!host) return null
      if (activeHost === host && active) {
        active.setColor(opts.color || brandColor())
        if (opts.size) active.setSize(opts.size)
        return active
      }
      active?.destroy()
      activeHost = host
      active = new AgentAvatar(host, { color: brandColor(), ...opts })
      return active
    },
    setState(state) {
      active?.setState(state)
    },
    setSize(size) {
      active?.setSize(size)
    },
    setGaze(tx, ty) {
      active?.setGaze(tx, ty)
    },
    clearGazeLock() {
      active?.clearGazeLock()
    },
    destroy() {
      active?.destroy()
      active = null
      activeHost = null
    },
    destroyAuthBoot() {
      const host = typeof document !== 'undefined' ? document.getElementById('auth-avatar-host') : null
      if (host && activeHost === host) {
        active?.destroy()
        active = null
        activeHost = null
      }
    },
    mountVoice(host, opts = {}) {
      if (!host) return null
      const color = opts.color || VOICE_AVATAR_COLOR
      if (voiceHost === host && voiceActive) {
        voiceActive.setColor(color)
        voiceActive.setState(opts.state || 'working')
        if (opts.size) voiceActive.setSize(opts.size)
        return voiceActive
      }
      voiceActive?.destroy()
      voiceHost = host
      voiceActive = new AgentAvatar(host, { color, size: opts.size || 44, ...opts })
      voiceActive.setState('working')
      return voiceActive
    },
    voiceColor: () => VOICE_AVATAR_COLOR,
    setVoiceState(state) {
      voiceActive?.setState(state === 'idle' ? 'idle' : 'working')
    },
    destroyVoice() {
      voiceActive?.destroy()
      voiceActive = null
      voiceHost = null
    },
    mountExtensionDock(host, opts = {}) {
      if (!host) return null
      if (extDockHost === host && extDockActive) {
        extDockActive.setColor(opts.color || brandColor())
        if (opts.size) extDockActive.setSize(opts.size)
        return extDockActive
      }
      extDockActive?.destroy()
      extDockHost = host
      extDockActive = new AgentAvatar(host, { color: brandColor(), ...opts })
      return extDockActive
    },
    setExtensionDockState(state) {
      extDockActive?.setState(state)
    },
    destroyExtensionDock() {
      extDockActive?.destroy()
      extDockActive = null
      extDockHost = null
    },
    mountAgentPanel(host, opts = {}) {
      if (!host) return null
      if (agentPanelHost === host && agentPanelActive) {
        agentPanelActive.setColor(opts.color || brandColor())
        if (opts.size) agentPanelActive.setSize(opts.size)
        return agentPanelActive
      }
      agentPanelActive?.destroy()
      agentPanelHost = host
      agentPanelActive = new AgentAvatar(host, { color: brandColor(), ...opts })
      return agentPanelActive
    },
    setAgentPanelState(state) {
      agentPanelActive?.setState(state)
    },
    setAgentPanelSize(size) {
      agentPanelActive?.setSize(size)
    },
    setAgentPanelGaze(tx, ty) {
      agentPanelActive?.setGaze(tx, ty)
    },
    clearAgentPanelGazeLock() {
      agentPanelActive?.clearGazeLock()
    },
    destroyAgentPanel() {
      agentPanelActive?.destroy()
      agentPanelActive = null
      agentPanelHost = null
    },
    destroyInlineAvatars() {
      for (const inst of inlineAvatars.values()) inst.destroy()
      inlineAvatars.clear()
    },
    mountInline(host, opts = {}) {
      if (!host) return null
      if (!host.dataset.avatarKey) host.dataset.avatarKey = `inline-${inlineAvatars.size + 1}`
      const key = host.dataset.avatarKey
      let inst = inlineAvatars.get(key)
      if (inst && inst.container !== host) {
        inst.destroy()
        inst = null
        inlineAvatars.delete(key)
      }
      if (!inst) {
        inst = new AgentAvatar(host, {
          color: brandColor(),
          size: opts.size || 34,
          ...opts,
        })
        inlineAvatars.set(key, inst)
      } else {
        inst.setColor(opts.color || brandColor())
        if (opts.size) inst.setSize(opts.size)
      }
      if (opts.state) inst.setState(opts.state)
      return inst
    },
    setInlineState(host, state) {
      if (!host?.dataset?.avatarKey) return
      inlineAvatars.get(host.dataset.avatarKey)?.setState(state)
    },
  }
})()
