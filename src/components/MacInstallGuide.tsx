export function MacInstallGuide() {
  return (
    <section
      className="rounded-2xl border border-white/[0.08] bg-[#111110] px-6 py-7 text-left sm:px-10 sm:py-10"
      aria-labelledby="mac-install-title"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">macOS installation</p>
      <h2 id="mac-install-title" className="mt-2 text-[20px] font-medium tracking-[-0.02em] text-white sm:text-[22px]">
        Download the DMG, drag to Applications, then sign in
      </h2>
      <ol className="mt-5 space-y-4 text-[14px] leading-7 text-white/50 sm:text-[15px]">
        <li>
          <strong className="font-medium text-white/75">Apple Silicon (M1/M2/M3/M4)</strong> — download{' '}
          <span className="text-white/70">Mac (ARM64)</span>. Intel Macs use <span className="text-white/70">Mac (x64)</span>.
        </li>
        <li>Open the <span className="text-white/70">.dmg</span>, drag Soumtok into Applications, and launch from there.</li>
        <li>
          If macOS says the app is from an unidentified developer, open{' '}
          <span className="text-white/70">System Settings → Privacy &amp; Security</span> and click{' '}
          <span className="text-white/70">Open Anyway</span>, or right-click Soumtok in Applications and choose{' '}
          <span className="text-white/70">Open</span> once.
        </li>
        <li>Sign in with your Soumtok account — same Studio subscription and models as the browser.</li>
      </ol>
      <p className="mt-6 text-[13px] leading-6 text-white/35">
        Download only from <span className="text-white/55">soumtok.com/download</span>. We are completing Apple notarization
        so Gatekeeper recognizes Soumtok automatically.
      </p>
    </section>
  )
}
