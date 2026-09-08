const LIGHT = new Set(['notion', 'github', 'google-drive', 'google-calendar', 'gmail', 'slack', 'supabase', 'vercel'])
const TINT: Record<string, string> = {
  datadog: 'bg-[#632CA6] invert',
  linear: 'bg-[#5E6AD2] invert',
  sentry: 'bg-[#362D59]',
}

export function PluginLogo({ id, className = 'h-9 w-9' }: { id: string; className?: string }) {
  const src = `/logos/plugins/${id}.svg`
  const box = `${className} shrink-0 overflow-hidden rounded-lg grid place-items-center`
  if (LIGHT.has(id)) {
    return (
      <span className={`${box} bg-white p-1.5`}>
        <img src={src} alt="" className="h-full w-full object-contain" />
      </span>
    )
  }
  if (id === 'granola') {
    return (
      <span className={`${box} bg-[#111110]`}>
        <img src="https://github.com/granola-inc.png" alt="" className="h-full w-full object-cover" />
      </span>
    )
  }
  if (id === 'figma') {
    return (
      <span className={`${box} bg-[#111110] p-1.5`}>
        <img src={src} alt="" className="h-full w-full object-contain" />
      </span>
    )
  }
  if (id === 'sentry') {
    return (
      <span className={`${box} bg-[#362D59] p-1.5`}>
        <img src={src} alt="" className="h-full w-full object-contain invert" />
      </span>
    )
  }
  if (id === 'stripe') {
    return (
      <span className={`${box} bg-[#635BFF] p-1.5`}>
        <img src={src} alt="" className="h-full w-full object-contain invert" />
      </span>
    )
  }
  if (id === 'postman') {
    return (
      <span className={`${box} bg-[#FF6C37] p-1.5`}>
        <img src={src} alt="" className="h-full w-full object-contain invert" />
      </span>
    )
  }
  if (id === 'firebase') {
    return (
      <span className={`${box} bg-[#1a1408] p-1.5`}>
        <img src={src} alt="" className="h-full w-full object-contain" />
      </span>
    )
  }
  if (id === 'neon') {
    return (
      <span className={`${box} bg-[#0b0b0a]`}>
        <img src={src} alt="" className="h-full w-full object-contain" />
      </span>
    )
  }
  if (id === 'cloudflare') {
    return (
      <span className={`${box} bg-[#1a120c] p-1`}>
        <img src={src} alt="" className="h-full w-full object-contain" />
      </span>
    )
  }
  if (TINT[id]) {
    return (
      <span className={`${box} ${TINT[id].split(' ')[0]} p-1.5`}>
        <img src={src} alt="" className="h-full w-full object-contain invert" />
      </span>
    )
  }
  return (
    <span className={`${box} bg-white/[0.06] text-[12px] font-medium text-white/80`}>
      <img
        src={src}
        alt=""
        className="h-full w-full object-contain p-1.5"
        onError={(event) => {
          event.currentTarget.style.display = 'none'
          event.currentTarget.parentElement!.textContent = id.slice(0, 1).toUpperCase()
        }}
      />
    </span>
  )
}
