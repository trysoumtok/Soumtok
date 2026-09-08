import type { CardBrand } from './pay-wallet'

export function digitsOnly(value: string) {
  return value.replace(/\D/g, '')
}

export function formatCardNumber(value: string) {
  return digitsOnly(value).slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ')
}

export function formatExpiry(value: string) {
  const digits = digitsOnly(value).slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

export function detectCardBrand(number: string): CardBrand | null {
  const digits = digitsOnly(number)
  if (/^4/.test(digits)) return 'visa'
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'mastercard'
  return null
}

function luhnOk(number: string) {
  const digits = digitsOnly(number)
  if (digits.length < 13 || digits.length > 19) return false
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i])
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}

export function parseExpiry(value: string) {
  const digits = digitsOnly(value)
  if (digits.length !== 4) return null
  const month = Number(digits.slice(0, 2))
  const year = 2000 + Number(digits.slice(2))
  if (month < 1 || month > 12) return null
  const end = new Date(year, month, 0, 23, 59, 59)
  if (end < new Date()) return null
  return `${String(month).padStart(2, '0')}/${year}`
}

export function validateCard(number: string, expiry: string, cvc: string) {
  const digits = digitsOnly(number)
  const brand = detectCardBrand(digits)
  if (!brand) return { ok: false as const, error: 'Enter a Visa or Mastercard number.' }
  if (!luhnOk(digits)) return { ok: false as const, error: 'Check the card number.' }
  const exp = parseExpiry(expiry)
  if (!exp) return { ok: false as const, error: 'Enter a valid expiration date.' }
  if (digitsOnly(cvc).length < 3) return { ok: false as const, error: 'Enter the CVC.' }
  return {
    ok: true as const,
    brand,
    last4: digits.slice(-4),
    exp,
  }
}
