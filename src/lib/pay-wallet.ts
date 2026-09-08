import type { PayMethodId } from '../components/pay/PayLogos'

const WALLET_KEY = 'soumtok-pay-wallet'
const LEGACY_KEY = 'soumtok-pay-method'
const PENDING_KEY = 'soumtok-pay-pending'

export type CardBrand = 'visa' | 'mastercard'

export type SavedPayMethod = {
  id: string
  kind: PayMethodId
  brand?: CardBrand
  last4?: string
  exp?: string
  country?: string
  email?: string
  phone?: string
}

export type PayWallet = {
  defaultId: string | null
  methods: SavedPayMethod[]
}

function emptyWallet(): PayWallet {
  return { defaultId: null, methods: [] }
}

export function isCompleteMethod(item: Pick<SavedPayMethod, 'kind' | 'last4' | 'email' | 'phone'>) {
  if (item.kind === 'card') return Boolean(item.last4 && item.last4.replace(/\D/g, '').length === 4)
  if (item.kind === 'paypal') return Boolean(item.email && item.email.includes('@'))
  return Boolean(item.phone && item.phone.replace(/\D/g, '').length >= 9)
}

function cleanWallet(wallet: PayWallet): PayWallet {
  const methods = wallet.methods.filter(isCompleteMethod)
  return {
    methods,
    defaultId: methods.some((item) => item.id === wallet.defaultId) ? wallet.defaultId : methods[0]?.id || null,
  }
}

function migrateLegacy(): PayWallet {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    localStorage.removeItem(LEGACY_KEY)
    if (!raw) return emptyWallet()
    const parsed = JSON.parse(raw) as { method?: PayMethodId; target?: string }
    if (!parsed.method || !parsed.target) return emptyWallet()
    const id = crypto.randomUUID()
    const method: SavedPayMethod = { id, kind: parsed.method }
    if (parsed.method === 'paypal') method.email = parsed.target
    else if (parsed.method === 'card') method.last4 = parsed.target.replace(/\D/g, '').slice(-4)
    else method.phone = parsed.target
    if (!isCompleteMethod(method)) return emptyWallet()
    return { defaultId: id, methods: [method] }
  } catch {
    return emptyWallet()
  }
}

export function readPayWallet(): PayWallet {
  try {
    const raw = localStorage.getItem(WALLET_KEY)
    if (!raw) {
      const migrated = migrateLegacy()
      if (migrated.methods.length) writePayWallet(migrated)
      return migrated
    }
    const parsed = JSON.parse(raw) as PayWallet
    if (!Array.isArray(parsed.methods)) return emptyWallet()
    const cleaned = cleanWallet({
      defaultId: parsed.defaultId || parsed.methods[0]?.id || null,
      methods: parsed.methods,
    })
    if (cleaned.methods.length !== parsed.methods.length) writePayWallet(cleaned)
    return cleaned
  } catch {
    return emptyWallet()
  }
}

export function writePayWallet(wallet: PayWallet) {
  localStorage.setItem(WALLET_KEY, JSON.stringify(wallet))
}

export function walletDefault(wallet: PayWallet) {
  return wallet.methods.find((item) => item.id === wallet.defaultId) || wallet.methods[0] || null
}

export function methodTitle(item: SavedPayMethod) {
  if (item.kind === 'paypal') return item.email ? `PayPal · ${item.email}` : 'PayPal'
  if (item.kind === 'card') {
    const brand = item.brand === 'mastercard' ? 'Mastercard' : 'Visa'
    return item.last4 ? `${brand} •••• ${item.last4}` : brand
  }
  if (item.kind === 'mpesa') return item.phone ? `M-Pesa · ${item.phone}` : 'M-Pesa'
  return item.phone ? `Airtel Money · ${item.phone}` : 'Airtel Money'
}

export function methodHint(item: SavedPayMethod) {
  if (item.kind === 'card') {
    const bits = [item.exp ? `Expires ${item.exp}` : 'Card', item.country].filter(Boolean)
    return bits.join(' · ')
  }
  if (item.kind === 'paypal') return 'PayPal profile'
  if (item.kind === 'mpesa' || item.kind === 'airtel') return 'Mobile Money'
  return 'Card'
}

export function isMobileMethod(kind: PayMethodId) {
  return kind === 'mpesa' || kind === 'airtel'
}

function sameMethod(a: SavedPayMethod, b: Omit<SavedPayMethod, 'id'>) {
  if (a.kind !== b.kind) return false
  if (b.kind === 'paypal') return Boolean(a.email && a.email === b.email)
  if (b.kind === 'card') return Boolean(a.last4 && a.last4 === b.last4 && (a.brand || 'visa') === (b.brand || 'visa'))
  return Boolean(a.phone && a.phone === b.phone)
}

export function rememberPayMethod(item: Omit<SavedPayMethod, 'id'>) {
  if (!isCompleteMethod(item)) return null
  const wallet = readPayWallet()
  const existing = wallet.methods.find((method) => sameMethod(method, item))
  if (existing) {
    const next = {
      ...wallet,
      defaultId: existing.id,
      methods: wallet.methods.map((method) => (method.id === existing.id ? { ...method, ...item, id: existing.id } : method)),
    }
    writePayWallet(next)
    return existing
  }
  const saved: SavedPayMethod = { ...item, id: crypto.randomUUID() }
  writePayWallet({
    defaultId: saved.id,
    methods: [...wallet.methods, saved],
  })
  return saved
}

export function stashPendingPayMethod(item: Omit<SavedPayMethod, 'id'>) {
  if (!isCompleteMethod(item)) return
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(item))
}

export function commitPendingPayMethod() {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    if (!raw) return
    sessionStorage.removeItem(PENDING_KEY)
    rememberPayMethod(JSON.parse(raw) as Omit<SavedPayMethod, 'id'>)
  } catch {
    sessionStorage.removeItem(PENDING_KEY)
  }
}

export function methodsForGroup(wallet: PayWallet, group: 'pay' | 'mobile') {
  return wallet.methods.filter((item) => (isMobileMethod(item.kind) ? group === 'mobile' : group === 'pay'))
}
