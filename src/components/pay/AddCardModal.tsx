import { useState } from 'react'
import { detectCardBrand, formatCardNumber, formatExpiry, validateCard } from '../../lib/card'
import { WORLD_COUNTRIES } from '../../lib/places'
import type { SavedPayMethod } from '../../lib/pay-wallet'
import { MastercardLogo, VisaLogo } from './PayLogos'

export function AddCardModal({
  countryHint,
  onBack,
  onClose,
  onSave,
}: {
  countryHint?: string
  onBack: () => void
  onClose: () => void
  onSave: (item: Omit<SavedPayMethod, 'id'>) => void
}) {
  const [number, setNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc] = useState('')
  const [country, setCountry] = useState(countryHint || 'Kenya')
  const [error, setError] = useState('')
  const brand = detectCardBrand(number)

  function submit() {
    const checked = validateCard(number, expiry, cvc)
    if (!checked.ok) {
      setError(checked.error)
      return
    }
    onSave({
      kind: 'card',
      brand: checked.brand,
      last4: checked.last4,
      exp: checked.exp,
      country: country.trim() || 'Kenya',
    })
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/45 px-4">
      <div className="w-full max-w-[440px] rounded-2xl bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] md:p-6">
        <div className="relative mb-5 flex items-center justify-center">
          <button
            type="button"
            onClick={onBack}
            className="absolute left-0 grid h-8 w-8 place-items-center text-[#666] hover:text-[#111]"
            aria-label="Back"
          >
            ‹
          </button>
          <p className="text-[16px] font-semibold">Add a card</p>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-0 grid h-8 w-8 place-items-center text-[#666] hover:text-[#111]"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <label className="block rounded-xl border border-[#d6d6d6] bg-[#f7f7f7] px-3 py-2">
          <span className="text-[11px] text-[#888]">Card number</span>
          <span className="mt-0.5 flex items-center gap-2">
            <input
              value={number}
              onChange={(event) => {
                setNumber(formatCardNumber(event.target.value))
                setError('')
              }}
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="1234 1234 1234 1234"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
            />
            <span className="flex shrink-0 items-center gap-1">
              <VisaLogo className={`h-4 w-auto ${brand === 'mastercard' ? 'opacity-30' : ''}`} />
              <MastercardLogo className={`h-5 w-auto ${brand === 'visa' ? 'opacity-30' : ''}`} />
            </span>
          </span>
        </label>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="rounded-xl border border-[#d6d6d6] bg-[#f7f7f7] px-3 py-2">
            <span className="text-[11px] text-[#888]">Expiration</span>
            <input
              value={expiry}
              onChange={(event) => {
                setExpiry(formatExpiry(event.target.value))
                setError('')
              }}
              inputMode="numeric"
              autoComplete="cc-exp"
              placeholder="MM / YY"
              className="mt-0.5 w-full bg-transparent text-[15px] outline-none"
            />
          </label>
          <label className="rounded-xl border border-[#d6d6d6] bg-[#f7f7f7] px-3 py-2">
            <span className="text-[11px] text-[#888]">CVC</span>
            <input
              value={cvc}
              onChange={(event) => {
                setCvc(event.target.value.replace(/\D/g, '').slice(0, 4))
                setError('')
              }}
              inputMode="numeric"
              autoComplete="cc-csc"
              placeholder="CVC"
              className="mt-0.5 w-full bg-transparent text-[15px] outline-none"
            />
          </label>
        </div>

        <label className="mt-2 block rounded-xl border border-[#d6d6d6] bg-[#f7f7f7] px-3 py-2">
          <span className="text-[11px] text-[#888]">Country or region</span>
          <select
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            className="mt-0.5 w-full bg-transparent text-[15px] outline-none"
          >
            {(WORLD_COUNTRIES.includes(country) ? WORLD_COUNTRIES : [country, ...WORLD_COUNTRIES]).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        {error && <p className="mt-3 text-[13px] text-[#c13515]">{error}</p>}

        <button
          type="button"
          onClick={submit}
          className="mt-5 w-full rounded-xl bg-black py-3 text-[15px] font-semibold text-white"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
