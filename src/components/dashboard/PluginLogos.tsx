import { useEffect, useMemo, useState } from 'react'
import { catalogPlugin } from '../../../shared/plugins'
import {
  PLUGIN_LOGO_COLOR_BRAND,
  PLUGIN_LOGO_FILL,
  pluginLogoCandidatesForId,
} from '../../../shared/pluginLogos'

export function PluginLogo({
  id,
  logo,
  logos,
  className = 'h-9 w-9',
}: {
  id: string
  logo?: string | null
  logos?: string[]
  className?: string
}) {
  const meta = catalogPlugin(id)
  const candidates = useMemo(() => {
    const fromApi = [logo, ...(logos || [])].filter(Boolean) as string[]
    const chain = fromApi.length ? [...fromApi, ...pluginLogoCandidatesForId(id)] : pluginLogoCandidatesForId(id)
    return [...new Set(chain)]
  }, [id, logo, logos])
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    setIdx(0)
  }, [id, candidates.join('\0')])

  const src = candidates[idx]
  const letter =
    (meta?.name || id).replace(/^[^a-zA-Z0-9]+/, '').slice(0, 1).toUpperCase() || '?'
  const box = `${className} plugin-logo shrink-0`
  const fill = PLUGIN_LOGO_FILL.has(id) || PLUGIN_LOGO_COLOR_BRAND.has(id) || id === 'higgsfield'
  const mod = [fill ? 'plugin-logo-fill' : '', id === 'higgsfield' ? 'plugin-logo-dark' : ''].filter(Boolean).join(' ')

  if (!src || idx >= candidates.length) {
    return <span className={`${box} plugin-logo-letter`}>{letter}</span>
  }

  return (
    <span className={`${box} ${mod}`.trim()} title={meta?.name || id}>
      <img
        src={src}
        alt=""
        decoding="async"
        onError={() => setIdx((current) => current + 1)}
      />
    </span>
  )
}
