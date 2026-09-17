export function LinuxInstallGuide() {
  return (
    <section
      className="rounded-2xl border border-white/[0.08] bg-[#111110] px-6 py-7 text-left sm:px-10 sm:py-10"
      aria-labelledby="linux-install-title"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">Linux installation</p>
      <h2
        id="linux-install-title"
        className="mt-2 text-[20px] font-medium tracking-[-0.02em] text-white sm:text-[22px]"
      >
        .deb for Ubuntu/Debian, AppImage everywhere else
      </h2>
      <div className="mt-5 space-y-6 text-[14px] leading-7 text-white/50 sm:text-[15px]">
        <div>
          <p className="font-medium text-white/75">Debian / Ubuntu (.deb)</p>
          <pre className="mt-2 overflow-x-auto rounded-xl border border-white/[0.08] bg-[#0b0b0a] px-4 py-3 font-mono text-[12px] leading-6 text-white/75 sm:text-[13px]">
            {`sudo apt install ./Soumtok-Setup-*-linux-amd64.deb
# or
sudo dpkg -i Soumtok-Setup-*-linux-amd64.deb && sudo apt -f install`}
          </pre>
        </div>
        <div>
          <p className="font-medium text-white/75">AppImage (any distro)</p>
          <pre className="mt-2 overflow-x-auto rounded-xl border border-white/[0.08] bg-[#0b0b0a] px-4 py-3 font-mono text-[12px] leading-6 text-white/75 sm:text-[13px]">
            {`chmod +x Soumtok-Setup-*-linux-x86_64.AppImage
./Soumtok-Setup-*-linux-x86_64.AppImage`}
          </pre>
        </div>
        <p>
          Pick <span className="text-white/70">ARM64</span> builds on Raspberry Pi, ARM Chromebooks, or other aarch64
          machines. Launch Soumtok from your app menu and sign in with your Soumtok account.
        </p>
      </div>
    </section>
  )
}
