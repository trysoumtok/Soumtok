import { useState, type FormEvent } from 'react'
import { sendContact } from '../lib/api'
import { openTab } from '../lib/nav'
import { Footer } from './Footer'
import { SiteHeader } from './SiteHeader'

const MODELS = [
  { name: 'OpenAI', src: '/logos/openai.svg', mono: true },
  { name: 'Anthropic', src: '/logos/anthropic.svg', mono: true },
  { name: 'Google', src: '/logos/google-g.svg', mono: false },
  { name: 'NVIDIA', src: '/logos/nvidia.svg', mono: true },
  { name: 'xAI', src: '/logos/xai.svg', mono: true },
  { name: 'DeepSeek', src: '/logos/deepseek.svg', mono: true },
  { name: 'Meta', src: '/logos/meta.svg', mono: true },
  { name: 'Mistral', src: '/logos/mistral.svg', mono: false },
] as const

const TOPICS = [
  'Product help',
  'Billing',
  'Teams and sales',
  'Bug report',
  'Something else',
] as const

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function ContactPage() {
  const [email, setEmail] = useState('')
  const [topic, setTopic] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!validEmail(email)) {
      setEmailError('Please enter a valid work email address.')
      return
    }
    setEmailError('')
    if (!topic) {
      setError('Select what we can help you with.')
      return
    }
    if (message.trim().length < 8) {
      setError('Write a short message so we know how to help.')
      return
    }
    setBusy(true)
    try {
      await sendContact({ email: email.trim(), topic, message: message.trim() })
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="theme-app keep-dark min-h-svh bg-[#0b0b0a] text-white">
      <SiteHeader active="contact" />
      <main className="mx-auto w-full max-w-[1120px] px-5 pb-8 pt-16 md:px-10 md:pt-24">
        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <h1 className="max-w-[520px] text-[28px] font-medium leading-[1.12] tracking-[-0.04em] sm:text-[36px] md:text-[48px]">
              Develop enduring software at scale
            </h1>
            <div className="mt-10 max-w-[480px] rounded-2xl bg-[#141413] px-6 py-6">
              <p className="text-[15px] leading-7 text-white/80">
                Soumtok is the coding agent we use to ship. Joseph started it so builders here can
                write, test, and open pull requests without leaving the desk.
              </p>
              <div className="mt-6 flex items-center gap-3">
                <img
                  src="/joseph.jpg"
                  alt="Joseph, Founder and CEO of Soumtok"
                  className="h-10 w-10 rounded-full object-cover"
                />
                <div>
                  <p className="text-[13px]">Joseph</p>
                  <p className="text-[12px] text-white/40">Founder / CEO, Soumtok</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openTab('/docs/company')}
                className="mt-5 text-[13px] text-[#f54e00] hover:underline"
              >
                Read story →
              </button>
            </div>
          </div>

          <form
            onSubmit={onSubmit}
            className="rounded-2xl border border-white/10 bg-[#141413] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] md:p-7"
          >
            <h2 className="text-[20px] font-medium tracking-[-0.03em]">Contact our team</h2>
            {sent ? (
              <p className="mt-6 text-[14px] leading-6 text-white/55">
                Received. Your note is in support@soumtok.com. We will reply to {email}.
              </p>
            ) : (
              <>
                <label className="mt-6 block text-[13px]">
                  Work email <span className="text-[#f54e00]">*</span>
                </label>
                <input
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    setEmailError('')
                  }}
                  type="email"
                  required
                  placeholder="jane@acme.co"
                  className="mt-1.5 w-full rounded-lg border border-white/12 bg-[#0c0c0b] px-3 py-2.5 text-[14px] outline-none placeholder:text-white/28 focus:border-white/22"
                />
                {emailError && <p className="mt-1.5 text-[12px] text-[#ff8a70]">{emailError}</p>}

                <label className="mt-4 block text-[13px]">
                  What can we help you with? <span className="text-[#f54e00]">*</span>
                </label>
                <select
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  required
                  className="mt-1.5 w-full appearance-none rounded-lg border border-white/12 bg-[#0c0c0b] px-3 py-2.5 text-[14px] outline-none"
                >
                  <option value="">Select one</option>
                  {TOPICS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>

                <label className="mt-4 block text-[13px]">
                  Message <span className="text-[#f54e00]">*</span>
                </label>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  required
                  rows={5}
                  placeholder="Tell us what you need."
                  className="mt-1.5 w-full resize-none rounded-lg border border-white/12 bg-[#0c0c0b] px-3 py-2.5 text-[14px] outline-none placeholder:text-white/28 focus:border-white/22"
                />
                {error && <p className="mt-3 text-[13px] text-[#ff8a70]">{error}</p>}
                <button
                  type="submit"
                  disabled={busy}
                  className="mt-6 rounded-full bg-white px-5 py-2.5 text-[14px] font-medium text-black hover:bg-[#f2f2f0] disabled:opacity-50"
                >
                  {busy ? 'Sending…' : 'Continue →'}
                </button>
              </>
            )}
          </form>
        </div>
        <section className="mt-20 pb-8 md:mt-28">
          <p className="text-center text-[13px] text-white/40">Top models for coding</p>
          <div className="mt-8 flex flex-col items-center gap-8">
            {[MODELS.slice(0, 4), MODELS.slice(4)].map((row, index) => (
              <div key={index} className="flex flex-wrap items-center justify-center gap-x-12 gap-y-5 md:gap-x-16">
                {row.map((model) => (
                  <span key={model.name} className="flex items-center gap-2 text-white/70">
                    <img
                      src={model.src}
                      alt=""
                      className={`h-5 w-5 object-contain ${model.mono ? 'pricing-model-logo' : ''}`}
                    />
                    <span className="text-[15px] font-medium tracking-[-0.02em]">{model.name}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
