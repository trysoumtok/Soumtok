import { useEffect, useState } from 'react'
import { confirmTwoFactor, fetchSecurity, removeSecurity, sendSecurityCode, updatePassword } from '../../lib/api'
import { authClient } from '../../lib/auth-client'

function totpSecret(uri: string) {
  try {
    return new URL(uri.replace('otpauth://', 'https://')).searchParams.get('secret') || ''
  } catch {
    return ''
  }
}

function GhostButton({
  children,
  onClick,
  disabled,
}: {
  children: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-white/15 px-3 py-1.5 text-[13px] text-white/80 hover:bg-white/[0.05] disabled:opacity-45"
    >
      {children}
    </button>
  )
}

export function SecuritySettings() {
  const [twoFactorOn, setTwoFactorOn] = useState(false)
  const [hasPassword, setHasPassword] = useState(false)
  const [passkeyCount, setPasskeyCount] = useState(0)
  const [open, setOpen] = useState<'none' | '2fa' | 'password' | 'passkey'>('none')
  const [removing, setRemoving] = useState<'none' | '2fa' | 'passkey' | 'password'>('none')
  const [emailCode, setEmailCode] = useState('')
  const [password, setPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [totpUri, setTotpUri] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [totpCode, setTotpCode] = useState('')
  const [busy, setBusy] = useState<'idle' | '2fa' | 'verify' | 'passkey' | 'password' | 'code' | 'remove'>('idle')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [codeEmail, setCodeEmail] = useState('')

  async function reload() {
    const data = await fetchSecurity()
    setTwoFactorOn(data.twoFactorEnabled)
    setHasPassword(data.hasPassword)
    setPasskeyCount(data.passkeys.length)
  }

  useEffect(() => {
    reload().catch(() => undefined)
  }, [])

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
      setOpen('none')
      setTotpUri('')
      setNote('2-factor is on and saved. After you sign out, Google Authenticator will be required to sign in.')
      await reload().catch(() => undefined)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'That authenticator code is not valid')
    }
    setBusy('idle')
  }

  async function startRemove(type: '2fa' | 'passkey' | 'password', action: string) {
    setError('')
    setNote('')
    setEmailCode('')
    setBusy('code')
    try {
      const sent = await sendSecurityCode(action)
      setCodeEmail(sent.email || '')
      setRemoving(type)
      setOpen(type === '2fa' ? '2fa' : type === 'password' ? 'password' : 'passkey')
      setNote(`We sent a 6-digit code to ${sent.email || 'your email'}. Enter it to continue.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the code')
    }
    setBusy('idle')
  }

  async function confirmRemove() {
    if (removing === 'none') return
    if (emailCode.trim().length !== 6) {
      setError('Enter the 6-digit code from your email')
      return
    }
    setBusy('remove')
    setError('')
    try {
      await removeSecurity(removing, emailCode.trim())
      if (removing === '2fa') {
        setTwoFactorOn(false)
        setTotpUri('')
        setBackupCodes([])
        setNote('2-factor is off.')
      } else if (removing === 'passkey') {
        setNote('Passkey removed.')
      } else {
        setNote('Password removed.')
      }
      setRemoving('none')
      setEmailCode('')
      setOpen('none')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that method')
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
    setNote('Passkey saved. You can sign in with Face ID, Windows Hello, or Google Password Manager.')
    setOpen('none')
    await reload().catch(() => undefined)
  }

  async function onPassword() {
    setError('')
    setNote('')
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }
    if (hasPassword && !currentPassword.trim()) {
      setError('Enter your current password')
      return
    }
    setBusy('password')
    try {
      await updatePassword({
        currentPassword: hasPassword ? currentPassword : undefined,
        newPassword,
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setOpen('none')
      setNote(hasPassword ? 'Password updated.' : 'Password set. You can use it to sign in.')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password')
    }
    setBusy('idle')
  }

  const secret = totpSecret(totpUri)

  return (
    <section className="flex min-h-0 flex-col">
      <h2 className="mb-3 text-[13px] text-white/45">Security</h2>
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#141413]">
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[14px] text-white">Passkey</p>
            <p className="mt-1 max-w-[420px] text-[12px] leading-5 text-white/40">
              {passkeyCount
                ? `${passkeyCount} passkey${passkeyCount === 1 ? '' : 's'} on this account.`
                : 'Not set. Add Face ID, Windows Hello, or a key in Google Password Manager.'}
            </p>
          </div>
          <div className="flex min-w-0 shrink-0 items-center justify-start gap-2 sm:min-w-[168px] sm:justify-end">
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${passkeyCount ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-white/40'}`}>
              {passkeyCount ? 'Set' : 'Not set'}
            </span>
            {!passkeyCount ? (
              <GhostButton disabled={busy !== 'idle'} onClick={() => void onAddPasskey()}>
                {busy === 'passkey' ? 'Waiting…' : 'Add passkey'}
              </GhostButton>
            ) : (
              <GhostButton
                disabled={busy !== 'idle'}
                onClick={() => void startRemove('passkey', 'remove your Google passkey')}
              >
                Remove
              </GhostButton>
            )}
          </div>
        </div>
        {open === 'passkey' && removing === 'passkey' && (
          <CodeRow
            email={codeEmail}
            value={emailCode}
            onChange={setEmailCode}
            busy={busy === 'remove'}
            onConfirm={() => void confirmRemove()}
          />
        )}

        <div className="flex flex-col gap-3 border-t border-white/[0.05] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[14px] text-white">Two-factor authentication</p>
            <p className="mt-1 max-w-[420px] text-[12px] leading-5 text-white/40">
              Google Authenticator or Authy. Backup codes get you in if you lose the phone.
            </p>
          </div>
          <div className="flex min-w-0 shrink-0 items-center justify-start gap-2 sm:min-w-[168px] sm:justify-end">
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${twoFactorOn ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-white/40'}`}>
              {twoFactorOn ? 'On' : 'Off'}
            </span>
            <GhostButton
              disabled={busy !== 'idle'}
              onClick={() => {
                setError('')
                setOpen(open === '2fa' ? 'none' : '2fa')
              }}
            >
              {twoFactorOn ? 'Manage' : 'Set up'}
            </GhostButton>
          </div>
        </div>

        {open === '2fa' && (
          <div className="border-t border-white/[0.05] px-5 py-4">
            {twoFactorOn && removing === '2fa' ? (
              <CodeRow
                email={codeEmail}
                value={emailCode}
                onChange={setEmailCode}
                busy={busy === 'remove'}
                onConfirm={() => void confirmRemove()}
                nested
              />
            ) : twoFactorOn ? (
              <button
                type="button"
                disabled={busy !== 'idle'}
                onClick={() => void startRemove('2fa', 'turn off two-factor authentication')}
                className="rounded-md border border-red-500/40 px-3 py-1.5 text-[13px] text-red-400 hover:bg-red-500/10 disabled:opacity-45"
              >
                {busy === 'code' ? 'Sending code…' : 'Turn off 2-factor'}
              </button>
            ) : totpUri ? (
              <>
                <img
                  alt="Authenticator QR code"
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=168x168&bgcolor=ffffff&color=0b0b0a&data=${encodeURIComponent(totpUri)}`}
                  className="rounded-md border border-white/10 bg-white p-2"
                  width={168}
                  height={168}
                />
                {secret && <p className="mt-2 break-all font-mono text-[11px] text-white/45">Manual key: {secret}</p>}
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={totpCode}
                  onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="mt-3 w-full rounded-md border border-white/10 bg-[#0c0c0b] px-3 py-2 font-mono text-[14px] tracking-[0.2em] outline-none"
                />
                <button
                  type="button"
                  disabled={busy !== 'idle' || totpCode.length !== 6}
                  onClick={() => void onVerify2fa()}
                  className="mt-3 rounded-md bg-white px-3 py-1.5 text-[13px] font-medium text-black hover:bg-[#f2f2f0] disabled:opacity-45"
                >
                  {busy === 'verify' ? 'Checking…' : 'Confirm 2-factor'}
                </button>
              </>
            ) : (
              <>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password — leave blank for Google sign-in"
                  className="w-full rounded-md border border-white/10 bg-[#0c0c0b] px-3 py-2 text-[14px] outline-none"
                />
                <button
                  type="button"
                  disabled={busy !== 'idle'}
                  onClick={() => void onEnable2fa()}
                  className="mt-3 rounded-md bg-white px-3 py-1.5 text-[13px] font-medium text-black hover:bg-[#f2f2f0] disabled:opacity-45"
                >
                  {busy === '2fa' ? 'Starting…' : 'Turn on 2-factor'}
                </button>
              </>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-white/[0.05] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[14px] text-white">{hasPassword ? 'Change password' : 'Set a password'}</p>
            <p className="mt-1 max-w-[420px] text-[12px] leading-5 text-white/40">
              {hasPassword
                ? 'Update the password you use with email sign-in.'
                : 'You signed in without one. Add a password so you can also sign in with email.'}
            </p>
          </div>
          <div className="flex min-w-0 shrink-0 items-center justify-start gap-2 sm:min-w-[168px] sm:justify-end">
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${hasPassword ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-white/40'}`}>
              {hasPassword ? 'Set' : 'Not set'}
            </span>
            {hasPassword && (
              <GhostButton
                disabled={busy !== 'idle'}
                onClick={() => void startRemove('password', 'remove your password')}
              >
                Remove
              </GhostButton>
            )}
            <GhostButton
              disabled={busy !== 'idle'}
              onClick={() => {
                setError('')
                setRemoving('none')
                setOpen(open === 'password' ? 'none' : 'password')
              }}
            >
              {hasPassword ? 'Change' : 'Set password'}
            </GhostButton>
          </div>
        </div>

        {open === 'password' && removing === 'password' && (
          <CodeRow
            email={codeEmail}
            value={emailCode}
            onChange={setEmailCode}
            busy={busy === 'remove'}
            onConfirm={() => void confirmRemove()}
          />
        )}

        {open === 'password' && removing !== 'password' && (
          <div className="grid gap-2 border-t border-white/[0.05] px-5 py-4 sm:grid-cols-2">
            {hasPassword && (
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Current password"
                className="rounded-md border border-white/10 bg-[#0c0c0b] px-3 py-2 text-[14px] outline-none sm:col-span-2"
              />
            )}
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="New password"
              className="rounded-md border border-white/10 bg-[#0c0c0b] px-3 py-2 text-[14px] outline-none"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm new password"
              className="rounded-md border border-white/10 bg-[#0c0c0b] px-3 py-2 text-[14px] outline-none"
            />
            <button
              type="button"
              disabled={busy !== 'idle'}
              onClick={() => void onPassword()}
              className="rounded-md bg-white px-3 py-1.5 text-[13px] font-medium text-black hover:bg-[#f2f2f0] disabled:opacity-45 sm:col-span-2"
            >
              {busy === 'password' ? 'Saving…' : hasPassword ? 'Update password' : 'Save password'}
            </button>
          </div>
        )}
      </div>
      {backupCodes.length > 0 && (
        <div className="mt-3 rounded-xl border border-white/[0.08] bg-[#141413] px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] text-white/50">Backup codes — save these once</p>
            <button
              type="button"
              className="text-[12px] text-white/70 hover:text-white"
              onClick={() => {
                void navigator.clipboard.writeText(backupCodes.join('\n'))
                setNote('Backup codes copied.')
              }}
            >
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
      {note && <p className="mt-2 text-[12px] text-[#f54e00]">{note}</p>}
      {error && <p className="mt-2 text-[12px] text-[#ff8a70]">{error}</p>}
    </section>
  )
}

function CodeRow({
  email,
  value,
  onChange,
  busy,
  onConfirm,
  nested,
}: {
  email: string
  value: string
  onChange: (value: string) => void
  busy: boolean
  onConfirm: () => void
  nested?: boolean
}) {
  return (
    <div className={nested ? '' : 'border-t border-white/[0.05] px-5 py-4'}>
      <p className="text-[12px] leading-5 text-white/45">
        Enter the 6-digit code we sent to {email || 'your email'}. It expires in 5 minutes.
      </p>
      <input
        autoFocus
        inputMode="numeric"
        maxLength={6}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="000000"
        className="mt-3 w-full rounded-md border border-white/10 bg-[#0c0c0b] px-3 py-2 font-mono text-[14px] tracking-[0.2em] outline-none"
      />
      <button
        type="button"
        disabled={busy || value.length !== 6}
        onClick={onConfirm}
        className="mt-3 rounded-md bg-white px-3 py-1.5 text-[13px] font-medium text-black hover:bg-[#f2f2f0] disabled:opacity-45"
      >
        {busy ? 'Removing…' : 'Confirm and remove'}
      </button>
    </div>
  )
}
