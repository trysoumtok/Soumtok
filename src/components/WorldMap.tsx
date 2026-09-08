import { useEffect, useRef, useState, type ReactNode } from 'react'
import landDots from '../data/land-dots.json'

const CENTER_LAT = (7 * Math.PI) / 180
const CENTER_LON = (20 * Math.PI) / 180
const PIN = { lon: 3.4, lat: 6.45 }

function project(lon: number, lat: number) {
  const λ = (lon * Math.PI) / 180 - CENTER_LON
  const φ = (lat * Math.PI) / 180
  return {
    x: Math.cos(φ) * Math.sin(λ),
    y: Math.sin(φ) * Math.cos(CENTER_LAT) - Math.cos(φ) * Math.cos(λ) * Math.sin(CENTER_LAT),
    z: Math.sin(φ) * Math.sin(CENTER_LAT) + Math.cos(φ) * Math.cos(λ) * Math.cos(CENTER_LAT),
  }
}

function layout(width: number, height: number) {
  return {
    radius: Math.min(width, height) * 0.74,
    ox: width * 0.52,
    oy: height * 0.5,
  }
}

export function WorldMap({ card }: { card: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [pin, setPin] = useState({ left: '42%', top: '28%' })

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const draw = () => {
      const width = wrap.clientWidth
      const height = wrap.clientHeight
      if (!width || !height) return

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      const { radius, ox, oy } = layout(width, height)
      const dots = landDots as [number, number][]

      for (const [lon, lat] of dots) {
        const p = project(lon, lat)
        if (p.z < 0.04) continue
        const x = ox + radius * p.x
        const y = oy - radius * p.y
        if (x < -8 || y < -8 || x > width + 8 || y > height + 8) continue
        const alpha = 0.2 + p.z * 0.75
        ctx.fillStyle = `rgba(228,224,216,${alpha})`
        ctx.beginPath()
        ctx.arc(x, y, 1.05 + p.z * 0.35, 0, Math.PI * 2)
        ctx.fill()
      }

      const marker = project(PIN.lon, PIN.lat)
      const mx = ox + radius * marker.x
      const my = oy - radius * marker.y
      ctx.fillStyle = 'rgba(245,78,0,0.22)'
      ctx.beginPath()
      ctx.arc(mx, my, 10, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#f54e00'
      ctx.fillRect(mx - 3, my - 3, 6, 6)

      setPin({
        left: `${Math.min(Math.max((mx / width) * 100 + 2, 12), 58)}%`,
        top: `${Math.min(Math.max((my / height) * 100 - 16, 8), 56)}%`,
      })
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="h-full w-full" aria-hidden />
      <div
        className="absolute w-[min(280px,calc(100%-24px))] -translate-x-3 rounded-[10px] border border-[#f54e00]/85 bg-[#111110]/96 px-4 py-3.5"
        style={{
          left: pin.left,
          top: pin.top,
          boxShadow: '0 0 24px rgba(245,78,0,0.14), 0 18px 50px rgba(0,0,0,0.45)',
        }}
      >
        {card}
      </div>
    </div>
  )
}
