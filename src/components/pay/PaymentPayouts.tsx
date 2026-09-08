import { useEffect, useState } from 'react'
import { methodHint, methodTitle, readPayWallet, walletDefault, type PayWallet } from '../../lib/pay-wallet'
import { PaymentMethodsPortal } from './PaymentMethodsPortal'
import { AirtelMoneyLogo, MastercardLogo, MpesaLogo, PayPalLogo, VisaLogo } from './PayLogos'

function KindMark({ kind, brand }: { kind: string; brand?: string }) {
  if (kind === 'card' && brand === 'mastercard') return <MastercardLogo className="h-7 w-auto" />
  if (kind === 'card') return <VisaLogo className="h-6 w-auto" />
  if (kind === 'paypal') return <PayPalLogo className="h-6 w-auto" />
  if (kind === 'mpesa') return <MpesaLogo className="h-7 w-auto" />
  return <AirtelMoneyLogo className="h-7 w-auto" />
}

export function PaymentPayouts() {
  const [wallet, setWallet] = useState<PayWallet>({ defaultId: null, methods: [] })
  const [open, setOpen] = useState(false)
  const [startAdding, setStartAdding] = useState(false)
  const chosen = walletDefault(wallet)

  useEffect(() => {
    setWallet(readPayWallet())
  }, [open])

  function openPortal(add = false) {
    setStartAdding(add)
    setOpen(true)
  }

  return (
    <>
      <div className="rounded-xl border border-white/[0.06] bg-[#141413] p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-medium">Payment</p>
            <p className="mt-1 text-[13px] text-white/50">Cards, PayPal, and Mobile Money</p>
          </div>
          <button
            type="button"
            onClick={() => openPortal(false)}
            className="rounded-md border border-white/15 px-3 py-1.5 text-[13px] text-white hover:bg-white/[0.05]"
          >
            Update
          </button>
        </div>

        {wallet.methods.length > 0 && (
          <>
            <div className="mt-5 divide-y divide-white/[0.06] rounded-xl border border-white/10">
              {wallet.methods.map((item) => {
                const isDefault = item.id === wallet.defaultId
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openPortal(false)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03]"
                  >
                    <KindMark kind={item.kind} brand={item.brand} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-white/90">{methodTitle(item)}</span>
                      <span className="block text-[12px] text-white/40">{methodHint(item)}</span>
                    </span>
                    {isDefault && (
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/55">Default</span>
                    )}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => openPortal(true)}
              className="mt-3 text-[13px] text-white/70 hover:text-white"
            >
              + Add payment method
            </button>
            {chosen && <p className="mt-4 text-[13px] text-white/45">Checkout uses {methodTitle(chosen)}</p>}
          </>
        )}
      </div>

      {open && (
        <PaymentMethodsPortal
          startAdding={startAdding}
          onClose={() => {
            setOpen(false)
            setStartAdding(false)
          }}
        />
      )}
    </>
  )
}
