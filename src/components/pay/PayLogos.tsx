function Brand({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className: string
}) {
  return (
    <span className="inline-flex items-center rounded-md bg-white px-1.5 py-1">
      <img src={src} alt={alt} className={`object-contain object-left ${className}`} draggable={false} />
    </span>
  )
}

export function PayPalLogo({ className = 'h-6 w-auto' }: { className?: string }) {
  return <Brand src="/logos/pay/paypal.svg" alt="PayPal" className={className} />
}

export function PayPalMark({ className = 'h-6 w-6' }: { className?: string }) {
  return <Brand src="/logos/pay/paypal-icon.svg" alt="PayPal" className={className} />
}

export function VisaLogo({ className = 'h-5 w-auto' }: { className?: string }) {
  return <Brand src="/logos/pay/visa.svg" alt="Visa" className={className} />
}

export function MastercardLogo({ className = 'h-6 w-auto' }: { className?: string }) {
  return <Brand src="/logos/pay/mastercard.svg" alt="Mastercard" className={className} />
}

export function MpesaLogo({ className = 'h-6 w-auto' }: { className?: string }) {
  return <Brand src="/logos/pay/mpesa.svg" alt="M-PESA" className={className} />
}

export function SafaricomMark({ className = 'h-6 w-6' }: { className?: string }) {
  return <Brand src="/logos/pay/mpesa.svg" alt="Safaricom M-PESA" className={className} />
}

export function AirtelMoneyLogo({ className = 'h-6 w-auto' }: { className?: string }) {
  return <Brand src="/logos/pay/airtel.svg" alt="Airtel" className={className} />
}

export type PayMethodId = 'paypal' | 'card' | 'mpesa' | 'airtel'

export const PAY_METHODS: {
  id: PayMethodId
  label: string
  hint: string
  group: 'pay' | 'mobile'
}[] = [
  { id: 'paypal', label: 'PayPal', hint: 'Balance or linked bank', group: 'pay' },
  { id: 'card', label: 'Card', hint: 'Visa and Mastercard', group: 'pay' },
  { id: 'mpesa', label: 'M-Pesa', hint: 'Safaricom mobile money', group: 'mobile' },
  { id: 'airtel', label: 'Airtel Money', hint: 'Airtel mobile money', group: 'mobile' },
]

export function MethodMarks({ id, size = 'md' }: { id: PayMethodId; size?: 'sm' | 'md' | 'lg' }) {
  const h = size === 'lg' ? 'h-8' : size === 'sm' ? 'h-6' : 'h-7'
  if (id === 'paypal') return <PayPalLogo className={`${h} w-auto max-w-[140px]`} />
  if (id === 'card') {
    return (
      <span className="inline-flex items-center gap-2">
        <VisaLogo className={`${h} w-auto max-w-[72px]`} />
        <MastercardLogo className={`${h} w-auto max-w-[52px]`} />
      </span>
    )
  }
  if (id === 'mpesa') return <MpesaLogo className={`${h} w-auto max-w-[130px]`} />
  return <AirtelMoneyLogo className={`${h} w-auto max-w-[44px]`} />
}
