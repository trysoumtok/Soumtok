import { useEffect, useRef } from 'react'

type Props = {
  color?: string
  size?: number
  state?: 'idle' | 'thinking' | 'working'
  className?: string
}

function blobPath(wobble: number) {
  const a = 34 + wobble * 3
  const b = 30 - wobble * 2
  return `M 0 ${-b}
    C ${a * 0.55} ${-b} ${a} ${-b * 0.35} ${a} ${b * 0.15}
    C ${a} ${b * 0.95} ${a * 0.35} ${b} 0 ${b}
    C ${-a * 0.35} ${b} ${-a} ${b * 0.95} ${-a} ${b * 0.15}
    C ${-a} ${-b * 0.35} ${-a * 0.55} ${-b} 0 ${-b} Z`
}

/** Compact globe avatar with drifting eyes (matches desktop agent avatar). */
export function SoumtokGlobeAvatar({
  color = '#2f6fed',
  size = 30,
  state = 'idle',
  className = '',
}: Props) {
  const bodyRef = useRef<SVGPathElement>(null)
  const eyeLRef = useRef<SVGGElement>(null)
  const eyeRRef = useRef<SVGGElement>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    let raf = 0
    let t = 0
    let last = performance.now()
    let nextGazeAt = 0
    let nextBlinkAt = 1.5 + Math.random() * 2.5
    let blinkPhase = 0
    const gaze = { x: 0, y: 0, tx: 0, ty: 0 }

    const pickGaze = () => {
      const mode = stateRef.current
      const spread = mode === 'thinking' ? 0.4 : mode === 'working' ? 0.35 : 0.18
      gaze.tx = (Math.random() * 2 - 1) * spread
      gaze.ty = (Math.random() * 2 - 1) * spread * 0.7
      nextGazeAt = t + 0.8 + Math.random() * 2.2
    }
    pickGaze()

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      t += dt
      const mode = stateRef.current
      const wobble = mode === 'working' ? Math.sin(t * 6) * 0.55 : mode === 'thinking' ? Math.sin(t * 3.2) * 0.35 : Math.sin(t * 1.6) * 0.18
      if (bodyRef.current) bodyRef.current.setAttribute('d', blobPath(wobble))

      if (t >= nextGazeAt) pickGaze()
      gaze.x += (gaze.tx - gaze.x) * Math.min(1, dt * 4)
      gaze.y += (gaze.ty - gaze.y) * Math.min(1, dt * 4)

      if (t >= nextBlinkAt) {
        blinkPhase = 0.01
        nextBlinkAt = t + 2.2 + Math.random() * 3.5
      }
      if (blinkPhase > 0) {
        blinkPhase += dt * 9
        if (blinkPhase > 1) blinkPhase = 0
      }
      const lid = blinkPhase <= 0 ? 1 : blinkPhase < 0.5 ? 1 - blinkPhase * 2 : (blinkPhase - 0.5) * 2
      const scaleY = Math.max(0.12, lid)
      const ox = gaze.x * 3.2
      const oy = gaze.y * 2.4

      for (const el of [eyeLRef.current, eyeRRef.current]) {
        if (!el) continue
        const cx = Number(el.dataset.cx || 0)
        el.setAttribute('transform', `translate(${ox} ${oy}) translate(${cx} 0) scale(1 ${scaleY}) translate(${-cx} 0)`)
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <span className={`inline-grid place-items-center ${className}`} aria-hidden="true">
      <svg viewBox="-50 -50 100 100" width={size} height={size} role="img" aria-label="Soumtok">
        <g>
          <path ref={bodyRef} fill={color} d={blobPath(0)} />
          <g>
            <g ref={eyeLRef} data-cx="-13">
              <rect x="-18" y="-8" width="10" height="16" rx="5" fill="#fff" />
            </g>
            <g ref={eyeRRef} data-cx="13">
              <rect x="8" y="-8" width="10" height="16" rx="5" fill="#fff" />
            </g>
          </g>
        </g>
      </svg>
    </span>
  )
}
