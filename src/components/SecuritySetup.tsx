import { useState } from 'react'
import { confirmTwoFactor } from '../lib/api'
import { authClient } from '../lib/auth-client'

function totpSecret(uri: string) {
  try {
    return new URL(uri.replace('otpauth://', 'https://')).searchParams.get('secret') || ''
  } catch {
    return ''
  }
}

export function SecuritySetup() {
  const [password, setPassword] = useState('')
  const [totpUri, setTotpUri] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [totpCode, setTotpCode] = useState('')
  const [twoFactorOn, setTwoFactorOn] = useState(false)
  const [passkeyOn, setPasskeyOn] = useState(false)
  const [busy, setBusy] = useState<'idle' | '2fa' | 'verify' | 'passkey'>('idle')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  async function onEnable2fa() {
    setError('')
    setNote('')
    setBusy('2fa')
    const result = await authClient.twoFactor.enable({
      method: 'totp',
      issuer: 'Soumtok',
      ...(password.trim() ? { password: password.trim() } : {}),
    })
    setBusy('idle')
    if (result.error) {
      setError(
        result.error.message?.toLowerCase().includes('password')
          ? 'Enter the password for this account, then try again.'
          : result.error.message || 'Could not start 2-factor',
      )
      return
    }
    const data = result.data as { totpURI?: string; backupCodes?: string[] }
    setTotpUri(data.totpURI || '')
    setBackupCodes(data.backupCodes || [])
    setNote('Scan the code in Google Authenticator, then enter the 6-digit code.')
  }

  async function onVerify2fa() {
    setError('')
    if (totpCode.length !== 6) {
      setError('Enter the 6-digit authenticator code')
      return
    }
    setBusy('verify')
    try {
      await confirmTwoFactor(totpCode)
      setTwoFactorOn(true)
      setNote('2-factor is on. Save the backup codes below.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That authenticator code is not valid')
    }
    setBusy('idle')
  }

  async function onAddPasskey() {
    setError('')
    setNote('')
    setBusy('passkey')
    const result = await authClient.passkey.addPasskey({ name: 'Soumtok' })
    setBusy('idle')
    if (result.error) {
      setError(result.error.message || 'Could not add a passkey')
      return
    }
    setPasskeyOn(true)
    setNote('Passkey saved. You can sign in with Google Password Manager, Face ID, or Windows Hello.')
  }

  function copyBackups() {
    void navigator.clipboard.writeText(backupCodes.join('\n'))
    setNote('Backup codes copied.')
  }

  const secret = totpSecret(totpUri)

  return (
    <div className="mt-4 space-y-4">
      <p className="text-[12px] leading-5 text-white/40">Optional. You can skip these and finish.</p>

      <div className="rounded-md border border-white/[0.08] bg-[#0c0c0b] p-3">
        <p className="text-[13px] font-medium text-white/80">Google passkey</p>
        <p className="mt-1 text-[12px] leading-5 text-white/40">
          Fingerprint, Face ID, Windows Hello, or a key in Google Password Manager.
        </p>
        {passkeyOn ? (
          <p className="mt-3 text-[12px] text-[#f54e00]">Passkey added.</p>
        ) : (
          <button
            type="button"
            disabled={busy !== 'idle'}
            onClick={() => void onAddPasskey()}
            className="mt-3 rounded-md border border-white/12 px-2.5 py-1.5 text-[12px] text-white/75 hover:bg-white/5 disabled:opacity-45"
          >
            {busy === 'passkey' ? 'Waiting for Google…' : 'Add Google passkey'}
          </button>
        )}
      </div>

      <div className="rounded-md border border-white/[0.08] bg-[#0c0c0b] p-3">
        <p className="text-[13px] font-medium text-white/80">2-factor + backup codes</p>
        <p className="mt-1 text-[12px] leading-5 text-white/40">
          Use Google Authenticator or Authy. Backup codes get you in if you lose the phone.
        </p>
        {twoFactorOn ? (
          <p className="mt-3 text-[12px] text-[#f54e00]">2-factor is on.</p>
        ) : totpUri ? (
          <>
            <img
              alt="Authenticator QR code"
              src={`https://api.qrserver.com/v1/create-qr-code/?size=168x168&bgcolor=ffffff&color=0b0b0a&data=${encodeURIComponent(totpUri)}`}
              className="mt-3 rounded-md border border-white/10 bg-white p-2"
              width={168}
              height={168}
            />
            {secret && (
              <p className="mt-2 break-all font-mono text-[11px] text-white/45">
                Manual key: {secret}
              </p>
            )}
            <label htmlFor="totp-code" className="mb-2 mt-4 block text-[12px] text-white/40">
              Authenticator code
            </label>
            <input
              id="totp-code"
              inputMode="numeric"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full rounded-md border border-white/[0.08] bg-[#111110] px-3 py-2.5 font-mono text-[14px] tracking-[0.2em] text-white outline-none"
            />
            <button
              type="button"
              disabled={busy !== 'idle' || totpCode.length !== 6}
              onClick={() => void onVerify2fa()}
              className="mt-3 w-full rounded-md bg-white py-2 text-[13px] font-medium text-black hover:bg-[#f2f2f0] disabled:opacity-45"
            >
              {busy === 'verify' ? 'Checking…' : 'Confirm 2-factor'}
            </button>
          </>
        ) : (
          <>
            <label htmlFor="2fa-password" className="mb-2 mt-4 block text-[12px] text-white/40">
              Password — only if you created one
            </label>
            <input
              id="2fa-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank for Google sign-in"
              className="w-full rounded-md border border-white/[0.08] bg-[#111110] px-3 py-2.5 text-[14px] text-white outline-none placeholder:text-white/25"
            />
            <button
              type="button"
              disabled={busy !== 'idle'}
              onClick={() => void onEnable2fa()}
              className="mt-3 rounded-md border border-white/12 px-2.5 py-1.5 text-[12px] text-white/75 hover:bg-white/5 disabled:opacity-45"
            >
              {busy === '2fa' ? 'Starting…' : 'Turn on 2-factor'}
            </button>
          </>
        )}
        {backupCodes.length > 0 && (
          <div className="mt-4 rounded-md border border-white/[0.08] px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] text-white/50">Backup codes — save these once</p>
              <button type="button" onClick={copyBackups} className="text-[12px] text-white/70 hover:text-white">
                Copy
              </button>
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-[11.5px] text-white/75">
              {backupCodes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {note && <p className="text-[12px] text-[#f54e00]">{note}</p>}
      {error && <p className="text-[12px] text-[#ff8a70]">{error}</p>}
    </div>
  )
}
