import { useEffect, useState } from 'react'
import { fetchProfile } from '../../lib/api'
import { useSession } from '../../lib/auth-client'
import { navigate } from '../../lib/nav'
import {
  methodHint,
  methodTitle,
  readPayWallet,
  walletDefault,
  writePayWallet,
  type PayWallet,
  type SavedPayMethod,
} from '../../lib/pay-wallet'
import type { PayMethodId } from './PayLogos'
import { ConfirmCard } from '../ConfirmCard'
import { AddCardModal } from './AddCardModal'
import { AirtelMoneyLogo, MastercardLogo, MethodMarks, MpesaLogo, PayPalLogo, VisaLogo } from './PayLogos'

function KindMark({ item }: { item: SavedPayMethod }) {
  if (item.kind === 'card' && item.brand === 'mastercard') return <MastercardLogo className="h-8 w-auto" />
  if (item.kind === 'card') return <VisaLogo className="h-7 w-auto" />
  if (item.kind === 'paypal') return <PayPalLogo className="h-7 w-auto" />
  if (item.kind === 'mpesa') return <MpesaLogo className="h-8 w-auto" />
  return <AirtelMoneyLogo className="h-8 w-auto" />
}

function AddForm({
  countryHint,
  onCancel,
  onSave,
}: {
  countryHint?: string
  onCancel: () => void
  onSave: (item: Omit<SavedPayMethod, 'id'>) => void
}) {
  const [kind, setKind] = useState<PayMethodId | null>(null)
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')

  function submit() {
    setError('')
    if (kind === 'paypal') {
      if (!email.includes('@')) {
        setError('Enter the PayPal email on that profile.')
        return
      }
      onSave({ kind, email: email.trim() })
      return
    }
    if (kind === 'mpesa' || kind === 'airtel') {
      if (phone.replace(/\D/g, '').length < 9) {
        setError('Enter the mobile money number.')
        return
      }
      onSave({ kind, phone: phone.trim() })
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-[#e6e6e6] p-5">
      <p className="text-[15px] font-semibold text-[#111]">Add payment method</p>
      <p className="mt-1 text-[13px] text-[#888]">Card, PayPal profile, M-Pesa, or Airtel Money</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {(
          [
            ['card', 'Card'],
            ['paypal', 'PayPal'],
            ['mpesa', 'M-Pesa'],
            ['airtel', 'Airtel Money'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setKind(id)
              setError('')
            }}
            className={`rounded-xl border px-4 py-4 text-left ${
              kind === id ? 'border-[#111] bg-[#f6f6f6]' : 'border-[#e6e6e6]'
            }`}
          >
            <span className="flex min-h-10 items-center">
              <MethodMarks id={id} size="lg" />
            </span>
            <span className="mt-2 block text-[14px]">{label}</span>
          </button>
        ))}
      </div>

      {kind === 'paypal' && (
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="PayPal email"
          className="mt-4 w-full rounded-xl border border-[#d6d6d6] px-3 py-3 text-[15px] outline-none"
        />
      )}
      {(kind === 'mpesa' || kind === 'airtel') && (
        <input
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="07XX XXX XXX"
          className="mt-4 w-full rounded-xl border border-[#d6d6d6] px-3 py-3 text-[15px] outline-none"
        />
      )}

      {error && <p className="mt-3 text-[13px] text-[#c13515]">{error}</p>}

      {kind && kind !== 'card' && (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={submit}
            className="rounded-xl bg-black px-4 py-2.5 text-[14px] font-medium text-white"
          >
            Save method
          </button>
          <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2.5 text-[14px] text-[#555]">
            Cancel
          </button>
        </div>
      )}
      {(!kind || kind === 'card') && (
        <button type="button" onClick={onCancel} className="mt-4 text-[14px] text-[#555]">
          Cancel
        </button>
      )}

      {kind === 'card' && (
        <AddCardModal
          countryHint={countryHint}
          onBack={() => setKind(null)}
          onClose={onCancel}
          onSave={onSave}
        />
      )}
    </div>
  )
}

export function PaymentMethodsPortal({
  onClose,
  startAdding = false,
}: {
  onClose: () => void
  startAdding?: boolean
}) {
  const { data: session } = useSession()
  const [wallet, setWallet] = useState<PayWallet>(() => readPayWallet())
  const [adding, setAdding] = useState(startAdding)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [name, setName] = useState(session?.user.name || '')
  const [email, setEmail] = useState(session?.user.email || '')
  const [place, setPlace] = useState('')
  const [countryHint, setCountryHint] = useState('Kenya')
  const chosen = walletDefault(wallet)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (adding) setAdding(false)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [adding, onClose])

  useEffect(() => {
    fetchProfile()
      .then((profile) => {
        const full = [profile.firstName, profile.lastName].filter(Boolean).join(' ')
        if (full) setName(full)
        else if (profile.username) setName(profile.username)
        const loc = [profile.state, profile.poBox, profile.country].filter(Boolean).join(', ')
        setPlace(loc)
        if (profile.country) setCountryHint(profile.country)
      })
      .catch(() => undefined)
  }, [])

  function commit(next: PayWallet) {
    setWallet(next)
    writePayWallet(next)
    setMenuId(null)
  }

  function add(item: Omit<SavedPayMethod, 'id'>) {
    const nextItem = { ...item, id: crypto.randomUUID() }
    commit({
      defaultId: nextItem.id,
      methods: [...wallet.methods, nextItem],
    })
    setAdding(false)
  }

  function setDefault(id: string) {
    commit({ ...wallet, defaultId: id })
  }

  const [removeId, setRemoveId] = useState<string | null>(null)

  function remove(id: string) {
    setMenuId(null)
    setRemoveId(id)
  }

  function confirmRemove() {
    if (!removeId) return
    const methods = wallet.methods.filter((item) => item.id !== removeId)
    commit({
      methods,
      defaultId: wallet.defaultId === removeId ? methods[0]?.id || null : wallet.defaultId,
    })
    setRemoveId(null)
  }

  return (
    <div className="fixed inset-0 z-[80] grid min-h-svh bg-white text-[#111] lg:grid-cols-[minmax(0,46vw)_minmax(0,1fr)]">
      <aside className="keep-dark hidden flex-col bg-[#0a0a0a] px-10 py-10 text-white lg:flex">
        <img src="/images/soumtok-lockup.png" alt="Soumtok" className="h-10 w-auto self-start" />
        <p className="mt-16 max-w-[280px] text-[15px] leading-7 text-white/50">
          Cards, PayPal, and Mobile Money stay here. Checkout uses the Default method.
        </p>
        <button type="button" onClick={onClose} className="mt-auto text-left text-[14px] text-white/70 hover:text-white">
          ← Return to Soumtok
        </button>
      </aside>

      <section className="overflow-y-auto px-5 py-8 md:px-14 md:py-14">
        <div className="mx-auto max-w-[580px]">
          <button type="button" onClick={onClose} className="mb-6 text-[13px] text-[#666] lg:hidden">
            ← Back
          </button>

          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#888]">Current method</p>
          <div className="mt-3 flex items-center justify-between gap-3 border-b border-[#ececec] pb-6">
            <div className="flex items-center gap-4">
              {chosen ? <KindMark item={chosen} /> : <PayPalLogo className="h-7 w-auto" />}
              <div>
                <p className="text-[16px] font-medium">{chosen ? methodTitle(chosen) : 'No method yet'}</p>
                <p className="text-[13px] text-[#666]">
                  {chosen ? methodHint(chosen) : 'Add a card, PayPal, or Mobile Money'}
                </p>
              </div>
            </div>
            <button type="button" onClick={() => setAdding(true)} className="text-[13px] text-[#555] hover:text-[#111]">
              Edit
            </button>
          </div>

          <p className="mt-8 text-[11px] font-medium uppercase tracking-[0.08em] text-[#888]">Payment methods</p>
          <div className="mt-2 divide-y divide-[#ececec]">
            {wallet.methods.map((item) => {
              const isDefault = item.id === wallet.defaultId
              return (
                <div key={item.id} className="relative flex items-center gap-4 py-4">
                  <KindMark item={item} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px]">{methodTitle(item)}</p>
                    <p className="text-[13px] text-[#888]">{methodHint(item)}</p>
                  </div>
                  {isDefault && (
                    <span className="rounded-full bg-[#eee] px-2 py-0.5 text-[11px] text-[#555]">Default</span>
                  )}
                  {isDefault ? (
                    <button
                      type="button"
                      onClick={() => remove(item.id)}
                      className="grid h-7 w-7 place-items-center text-[#888] hover:text-[#111]"
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setMenuId(menuId === item.id ? null : item.id)}
                      className="grid h-7 w-7 place-items-center text-[#888] hover:text-[#111]"
                      aria-label="More"
                    >
                      ···
                    </button>
                  )}
                  {menuId === item.id && (
                    <div className="absolute right-0 top-12 z-10 min-w-[160px] rounded-md border border-[#e6e6e6] bg-white py-1 shadow-lg">
                      <button
                        type="button"
                        onClick={() => setDefault(item.id)}
                        className="block w-full px-3 py-2 text-left text-[13px] hover:bg-[#f6f6f6]"
                      >
                        Set as default
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(item.id)}
                        className="block w-full px-3 py-2 text-left text-[13px] text-[#c13515] hover:bg-[#f6f6f6]"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {adding ? (
            <AddForm countryHint={countryHint} onCancel={() => setAdding(false)} onSave={add} />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-4 text-[14px] text-[#111] hover:underline"
            >
              + Add payment method
            </button>
          )}

          <p className="mt-10 text-[11px] font-medium uppercase tracking-[0.08em] text-[#888]">Billing information</p>
          <dl className="mt-3 grid gap-4 border-b border-[#ececec] pb-6 sm:grid-cols-2">
            <div>
              <dt className="text-[12px] text-[#888]">Name</dt>
              <dd className="mt-1 text-[14px]">{name || '—'}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#888]">Email</dt>
              <dd className="mt-1 text-[14px]">{email || session?.user.email || '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[12px] text-[#888]">Billing address</dt>
              <dd className="mt-1 text-[14px]">{place || '—'}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => {
              onClose()
              navigate('/dashboard/settings')
            }}
            className="mt-3 text-[13px] text-[#555] hover:text-[#111]"
          >
            Update information
          </button>
        </div>
      </section>
      {removeId && (
        <ConfirmCard
          title="Remove this payment method?"
          body={`${methodTitle(wallet.methods.find((item) => item.id === removeId) || { id: '', kind: 'card' }) } will be removed from checkout.`}
          confirmLabel="Remove"
          onCancel={() => setRemoveId(null)}
          onConfirm={confirmRemove}
        />
      )}
    </div>
  )
}
