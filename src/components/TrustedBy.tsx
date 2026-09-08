import { useEffect, useRef } from 'react'
import type { ModelProvider } from '../../shared/models'

const LOGO: Record<ModelProvider, { src: string; mono: boolean }> = {
  openai: { src: '/logos/openai.svg', mono: true },
  anthropic: { src: '/logos/anthropic.svg', mono: true },
  google: { src: '/logos/google-g.svg', mono: false },
  xai: { src: '/logos/xai.svg', mono: true },
  deepseek: { src: '/logos/deepseek.svg', mono: true },
  openrouter: { src: '/logos/openai.svg', mono: true },
}

const TOP_MODELS: { id: string; name: string; provider: ModelProvider }[] = [
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', provider: 'deepseek' },
  { id: 'claude-opus-5', name: 'Claude Opus 5', provider: 'anthropic' },
  { id: 'grok-4.6', name: 'Grok 4.6', provider: 'xai' },
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', provider: 'google' },
  { id: 'gpt-6-astra', name: 'GPT-6 Astra', provider: 'openai' },
  { id: 'gpt-5.3-codex', name: 'Codex', provider: 'openai' },
  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', provider: 'anthropic' },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: 'deepseek' },
]

function Row({ suffix }: { suffix: string }) {
  return (
    <div className="model-rail-row" aria-hidden={suffix !== 'a'}>
      {TOP_MODELS.map((model) => {
        const logo = LOGO[model.provider]
        return (
          <span key={`${suffix}-${model.id}`} className="model-rail-item">
            <img
              src={logo.src}
              alt=""
              width={32}
              height={32}
              className={`model-rail-logo ${logo.mono ? 'logo-mark' : ''}`}
            />
            {model.name}
          </span>
        )
      })}
    </div>
  )
}

export function TrustedBy() {
  const railRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const items = () => Array.from(rail.querySelectorAll<HTMLElement>('.model-rail-item'))
    let frame = 0

    function paint() {
      const box = rail!.getBoundingClientRect()
      const mid = box.left + box.width / 2
      const reach = Math.max(160, box.width * 0.42)
      for (const item of items()) {
        const rect = item.getBoundingClientRect()
        const x = rect.left + rect.width / 2
        const t = Math.max(0, 1 - Math.abs(x - mid) / reach)
        const ease = t * t * (3 - 2 * t)
        item.style.setProperty('--rail-s', String(0.78 + ease * 0.42))
        item.style.setProperty('--rail-o', String(0.32 + ease * 0.68))
      }
      frame = window.requestAnimationFrame(paint)
    }

    frame = window.requestAnimationFrame(paint)
    return () => window.cancelAnimationFrame(frame)
  }, [])

  return (
    <section className="pb-16 pt-6">
      <p className="px-6 text-center text-[14px] text-white/55">
        The models you already know. One Studio.
      </p>
      <div ref={railRef} className="model-rail mt-8" aria-label="Frontier models in Studio">
        <div className="model-rail-track">
          <Row suffix="a" />
          <Row suffix="b" />
        </div>
      </div>
    </section>
  )
}
