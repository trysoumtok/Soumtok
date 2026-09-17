import type { ReactNode } from 'react'

function MousePointer({ className }: { className?: string }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M4 2.5 22 14 13.5 15.5 16.5 24.5 12.5 26 9.5 17 4 18.5V2.5Z"
        fill="#fff"
        stroke="#111"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SmartScreenChrome({
  step,
  caption,
  children,
}: {
  step: string
  caption: string
  children: ReactNode
}) {
  return (
    <figure className="flex h-full flex-col">
      <figcaption className="mb-4 flex items-center gap-2.5">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[#f54e00]/15 text-[11px] font-semibold text-[#f54e00]">
          {step}
        </span>
        <span className="text-[13px] font-medium text-white/70">{caption}</span>
      </figcaption>
      <div className="h-full min-h-[300px] overflow-hidden rounded-xl border border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.55)]">
        {children}
      </div>
    </figure>
  )
}

function SmartScreenInitial() {
  return (
    <div className="relative flex h-full min-h-[300px] flex-col bg-[#0078d4] px-6 pb-7 pt-5 text-white sm:px-7 sm:pb-8 sm:pt-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[17px] font-light leading-tight sm:text-[19px]">Windows protected your PC</p>
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-sm bg-white/10 text-[14px] leading-none text-white/80"
          aria-hidden
        >
          ×
        </span>
      </div>
      <p className="mt-4 max-w-[34ch] text-[12px] leading-[1.45] text-white/95 sm:text-[13px]">
        Microsoft Defender SmartScreen prevented an unrecognized app from starting. Running this app might put your PC
        at risk.
      </p>
      <div className="relative mt-5 inline-flex">
        <span className="relative rounded-md bg-white/25 px-3 py-1.5 text-[12px] font-medium underline decoration-white/80 underline-offset-[3px] ring-2 ring-white/30 sm:text-[13px]">
          More info
          <MousePointer className="pointer-events-none absolute left-1/2 top-[calc(100%+6px)] -translate-x-[35%] drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]" />
        </span>
      </div>
      <div className="mt-auto flex justify-end pt-10">
        <span className="rounded-sm bg-white/55 px-5 py-2.5 text-[12px] font-semibold text-[#0078d4]/55 sm:text-[13px]">
          Don&apos;t run
        </span>
      </div>
    </div>
  )
}

function SmartScreenExpanded() {
  return (
    <div className="relative flex h-full min-h-[300px] flex-col bg-[#0078d4] px-6 pb-7 pt-5 text-white sm:px-7 sm:pb-8 sm:pt-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[17px] font-light leading-tight sm:text-[19px]">Windows protected your PC</p>
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-sm bg-white/10 text-[14px] leading-none text-white/80"
          aria-hidden
        >
          ×
        </span>
      </div>
      <p className="mt-4 max-w-[36ch] text-[12px] leading-[1.45] text-white/95 sm:text-[13px]">
        Microsoft Defender SmartScreen prevented an unrecognized app from starting. Running this app might put your PC
        at risk.
      </p>
      <dl className="mt-4 space-y-1 text-[12px] leading-5 text-white/90 sm:text-[13px]">
        <div className="flex gap-2">
          <dt className="shrink-0 text-white/75">App:</dt>
          <dd className="truncate font-medium">Soumtok-Setup.exe</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 text-white/75">Publisher:</dt>
          <dd className="font-medium">Unknown publisher</dd>
        </div>
      </dl>
      <p className="mt-4 text-[12px] underline decoration-white/50 underline-offset-[3px] sm:text-[13px]">
        More info
      </p>
      <div className="mt-auto flex flex-wrap items-end justify-end gap-4 pt-8">
        <span className="relative rounded-sm bg-white px-5 py-2.5 text-[12px] font-semibold text-[#0078d4] ring-2 ring-white/40 shadow-[0_0_0_3px_rgba(255,255,255,0.12)] sm:text-[13px]">
          Run anyway
          <MousePointer className="pointer-events-none absolute left-1/2 top-[calc(100%+6px)] -translate-x-[35%] drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]" />
        </span>
        <span className="rounded-sm bg-white/55 px-5 py-2.5 text-[12px] font-semibold text-[#0078d4]/55 sm:text-[13px]">
          Don&apos;t run
        </span>
      </div>
    </div>
  )
}

export function WindowsSmartScreenGuide() {
  return (
    <section
      className="rounded-2xl border border-white/[0.08] bg-[#111110] px-6 py-7 text-left sm:px-10 sm:py-10"
      aria-labelledby="windows-smartscreen-title"
    >
      <div className="max-w-[640px]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">Windows installation</p>
        <h2 id="windows-smartscreen-title" className="mt-2 text-[20px] font-medium tracking-[-0.02em] text-white sm:text-[22px]">
          One extra step — then setup continues normally
        </h2>
        <p className="mt-3 text-[14px] leading-7 text-white/45 sm:text-[15px]">
          New desktop apps sometimes trigger Microsoft Defender SmartScreen until the publisher certificate is fully
          recognized. Soumtok Desktop is built and distributed only from{' '}
          <span className="text-white/70">soumtok.com</span>. If you see the blue screen below, follow these two
          clicks — the installer is safe.
        </p>
      </div>

      <div className="mt-10 grid gap-8 md:grid-cols-2 md:gap-10 lg:gap-14">
        <SmartScreenChrome step="1" caption="Select More info">
          <SmartScreenInitial />
        </SmartScreenChrome>
        <SmartScreenChrome step="2" caption="Select Run anyway">
          <SmartScreenExpanded />
        </SmartScreenChrome>
      </div>

      <p className="mt-6 text-[13px] leading-6 text-white/35">
        We are completing Microsoft Authenticode signing so Windows will list Soumtok as the verified publisher. Until
        then, download only from this page — never from email attachments or third-party mirrors.
      </p>
    </section>
  )
}
