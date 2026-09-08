import type { ChatFile } from '../../shared/chatMedia'

export type DocumentRow = {
  id: string
  title: string
  content: string
  folder?: string
  created_at: string
  updated_at: string
}

export async function sendContact(input: { email: string; topic: string; message: string }) {
  const res = await fetch('/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(data.error || 'Could not send your message')
}

export async function fetchHealth() {
  const res = await fetch('/api/health')
  if (!res.ok) {
    return { ok: false, database: false, google: false, github: false, storage: false, mail: false, sms: false }
  }
  return res.json() as Promise<{
    ok: boolean
    database: boolean
    google: boolean
    github: boolean
    storage: boolean
    mail: boolean
    sms: boolean
    image?: boolean
    paypal?: boolean
    payhero?: boolean
    coding?: {
      openai: boolean
      anthropic: boolean
      google: boolean
      deepseek: boolean
      xai: boolean
    }
  }>
}

export async function fetchDocuments() {
  const res = await fetch('/api/documents', { credentials: 'include' })
  if (!res.ok) throw new Error('Could not load documents')
  const data = (await res.json()) as { documents: DocumentRow[] }
  return data.documents
}

export type Profile = {
  username: string | null
  howFound: string | null
  howFoundOther: string | null
  country: string | null
  state: string | null
  poBox: string | null
  birthDate: string | null
  phone: string | null
  phoneVerified: boolean
  emailVerified: boolean
  completed: boolean
  githubId: string | null
  githubLogin: string | null
  hasAvatar: boolean
  companyName: string | null
  companyRole: string | null
  hasCompanyLogo: boolean
  plan?: string
  planStatus?: string
  firstName?: string | null
  lastName?: string | null
  links?: string[]
  publicProfile?: boolean
  shareUsageData?: boolean
  theme?: string
  lightTheme?: string
  darkTheme?: string
  prProvider?: string
}

export const emptyProfile: Profile = {
  username: null,
  howFound: null,
  howFoundOther: null,
  country: null,
  state: null,
  poBox: null,
  birthDate: null,
  phone: null,
  phoneVerified: false,
  emailVerified: false,
  completed: false,
  githubId: null,
  githubLogin: null,
  hasAvatar: false,
  companyName: null,
  companyRole: null,
  hasCompanyLogo: false,
  plan: 'hobby',
  planStatus: 'active',
  firstName: null,
  lastName: null,
  links: [],
  publicProfile: false,
  shareUsageData: true,
  theme: 'system',
  lightTheme: 'soumtok-light',
  darkTheme: 'soumtok-dark',
  prProvider: 'github',
}

export function isOnboardingComplete(profile: Profile | null | undefined) {
  return Boolean(profile?.completed && profile.username && profile.emailVerified)
}

export async function sendEmailCode() {
  const res = await fetch('/api/me/verify/email/send', { method: 'POST', credentials: 'include' })
  const data = (await res.json()) as { ok?: boolean; already?: boolean; via?: string; error?: string }
  if (!res.ok) throw new Error(data.error || 'Could not send email code')
  return data
}

export async function confirmEmailCode(code: string) {
  const res = await fetch('/api/me/verify/email/confirm', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  const data = (await res.json()) as Profile & { error?: string }
  if (!res.ok) throw new Error(data.error || 'Could not verify email')
  return data
}

export async function checkUsername(username: string) {
  const res = await fetch(`/api/usernames/check?username=${encodeURIComponent(username)}`, {
    credentials: 'include',
  })
  return res.json() as Promise<{ available: boolean; error?: string }>
}

export async function fetchProfile() {
  const res = await fetch('/api/me/profile', { credentials: 'include' })
  if (!res.ok) throw new Error('Could not load profile')
  return res.json() as Promise<Profile>
}

export async function saveProfile(body: {
  step: 1 | 2 | 3
  username?: string
  howFound?: string
  howFoundOther?: string
  country?: string
  state?: string
  poBox?: string
  birthDate?: string
}) {
  const res = await fetch('/api/me/profile', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as Profile & { error?: string }
  if (!res.ok) throw new Error(data.error || 'Could not save profile')
  return data
}

export type FileRow = {
  id: string
  name: string
  size: number
  content_type: string
  created_at: string
}

export async function fetchFiles() {
  const res = await fetch('/api/files', { credentials: 'include' })
  if (!res.ok) throw new Error('Could not load files')
  const data = (await res.json()) as { files: FileRow[] }
  return data.files
}

export async function uploadFile(file: File) {
  const body = new FormData()
  body.append('file', file)
  const res = await fetch('/api/files', {
    method: 'POST',
    credentials: 'include',
    body,
  })
  const data = (await res.json()) as {
    id: string
    name: string
    size: number
    contentType?: string
    error?: string
  }
  if (!res.ok) throw new Error(data.error || 'Could not upload file')
  return {
    id: data.id,
    name: data.name,
    size: data.size,
    content_type: data.contentType || 'application/octet-stream',
    created_at: new Date().toISOString(),
  }
}

export async function deleteFile(id: string) {
  const res = await fetch(`/api/files/${id}`, { method: 'DELETE', credentials: 'include' })
  if (!res.ok) throw new Error('Could not delete file')
}

export async function uploadStudioAttachment(file: File) {
  const body = new FormData()
  body.append('file', file)
  const res = await fetch('/api/studio/attachments', {
    method: 'POST',
    credentials: 'include',
    body,
  })
  const data = (await res.json()) as {
    id?: string
    documentId?: string
    name?: string
    mime?: string
    size?: number
    text?: string
    analysis?: string
    preview?: string
    stored?: boolean
    error?: string
  }
  if (!res.ok) throw new Error(data.error || 'Could not save that file to your documents')
  return {
    id: data.id,
    documentId: data.documentId,
    name: data.name || file.name,
    mime: data.mime || file.type || 'application/octet-stream',
    size: data.size ?? file.size,
    text: data.text,
    analysis: data.analysis,
    preview: data.preview,
    stored: Boolean(data.stored),
  }
}

export async function createDocument(title: string, content: string, folder = '') {
  const res = await fetch('/api/documents', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content, folder }),
  })
  if (!res.ok) throw new Error('Could not save document')
  return res.json() as Promise<{ id: string; title: string; content: string; folder?: string }>
}

export async function studioFetchPages(body: { url?: string; query?: string; urls?: string[] }) {
  const res = await fetch('/api/studio/tools/fetch', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { pages?: { url: string; title: string; text: string; ok?: boolean }[]; error?: string }
  if (!res.ok) throw new Error(data.error || 'Could not fetch')
  return data.pages || []
}

export async function studioMcpCall(body: { connectorId: string; tool: string; args?: Record<string, unknown> }) {
  const res = await fetch('/api/studio/tools/mcp', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { error?: string; result?: unknown; server?: string; tool?: string }
  if (!res.ok) throw new Error(data.error || 'MCP call failed')
  return data
}

export async function studioToolContext() {
  const res = await fetch('/api/studio/tools/context', { credentials: 'include' })
  if (!res.ok) throw new Error('Could not load tools')
  return res.json() as Promise<{
    skills: { id: string; name: string; file_name: string; excerpt: string | null }[]
    plugins: { name: string; skills?: { label: string }[]; mcps?: { label: string }[] }[]
    connectors: { id: string; name: string; connected: boolean; tools: { name: string; description: string }[] }[]
    documents: { id: string; title: string; folder?: string; snippet?: string }[]
  }>
}

export async function saveSettings(body: {
  firstName: string
  lastName: string
  links: string[]
  publicProfile: boolean
  shareUsageData: boolean
  theme: string
  lightTheme: string
  darkTheme: string
  prProvider: string
  username?: string
}) {
  const res = await fetch('/api/me/settings', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { error?: string }
  if (!res.ok) throw new Error(data.error || 'Could not save settings')
}

export async function savePublicProfile(body: {
  username?: string
  links?: string[]
  publicProfile?: boolean
}) {
  const res = await fetch('/api/me/public-profile', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { error?: string }
  if (!res.ok) throw new Error(data.error || 'Could not save profile')
}

export async function fetchTwoFactorStatus() {
  const res = await fetch('/api/me/2fa', { credentials: 'include' })
  if (!res.ok) return { enabled: false, needed: false }
  return res.json() as Promise<{ enabled: boolean; needed: boolean }>
}

export async function confirmTwoFactor(code: string) {
  const res = await fetch('/api/me/2fa/confirm', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  const data = (await res.json()) as { error?: string }
  if (!res.ok) throw new Error(data.error || 'That code is not valid')
}

export async function clearTwoFactor() {
  await fetch('/api/me/2fa/clear', { method: 'POST', credentials: 'include' }).catch(() => undefined)
}

export async function sendSecurityCode(action: string) {
  const res = await fetch('/api/me/security/code', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  })
  const data = (await res.json()) as { error?: string; email?: string }
  if (!res.ok) throw new Error(data.error || 'Could not send the code')
  return data
}

export async function removeSecurity(type: '2fa' | 'passkey' | 'password', code: string, passkeyId?: string) {
  const res = await fetch('/api/me/security/remove', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, code, passkeyId }),
  })
  const data = (await res.json()) as { error?: string }
  if (!res.ok) throw new Error(data.error || 'Could not remove that security method')
}

export async function fetchSecurity() {
  const res = await fetch('/api/me/security', { credentials: 'include' })
  if (!res.ok) throw new Error('Could not load security')
  return res.json() as Promise<{
    twoFactorEnabled: boolean
    hasPassword: boolean
    passkeys: { id: string; name: string; createdAt?: string }[]
  }>
}

export async function updatePassword(body: { currentPassword?: string; newPassword: string }) {
  const res = await fetch('/api/me/password', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { error?: string }
  if (!res.ok) throw new Error(data.error || 'Could not update password')
}

export async function fetchSessions() {
  const res = await fetch('/api/me/sessions', { credentials: 'include' })
  if (!res.ok) throw new Error('Could not load sessions')
  return res.json() as Promise<{
    sessions: { id: string; createdAt: string; device: string; current: boolean }[]
  }>
}

export async function revokeSession(id: string) {
  const res = await fetch(`/api/me/sessions/${id}`, { method: 'DELETE', credentials: 'include' })
  if (!res.ok) throw new Error('Could not revoke session')
}

export async function checkSignupEmail(email: string) {
  const res = await fetch(`/api/signup/status?email=${encodeURIComponent(email)}`)
  if (!res.ok) return { blocked: false, message: '' }
  return res.json() as Promise<{ blocked: boolean; message: string }>
}

export async function deleteAccount(email: string, confirm: string) {
  const res = await fetch('/api/me', {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, confirm }),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
  if (!res.ok) throw new Error(data.error || 'Could not delete account')
  return data
}

export async function fetchPublicProfile(username: string) {
  const res = await fetch(`/api/u/${encodeURIComponent(username)}`, { credentials: 'include' })
  const data = (await res.json()) as {
    username?: string
    firstName?: string | null
    lastName?: string | null
    links?: string[]
    publicProfile?: boolean
    hasAvatar?: boolean
    own?: boolean
    error?: string
    private?: boolean
  }
  if (!res.ok) throw Object.assign(new Error(data.error || 'Not found'), { private: data.private })
  return data
}

export async function saveWorkspace(companyName: string, companyRole: string) {
  const res = await fetch('/api/me/workspace', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyName, companyRole }),
  })
  if (!res.ok) throw new Error('Could not save workspace')
}

export async function uploadPhoto(kind: 'avatar' | 'company', file: File) {
  const body = new FormData()
  body.append('file', file)
  const res = await fetch(`/api/me/photo/${kind}`, { method: 'PUT', credentials: 'include', body })
  const data = (await res.json()) as { error?: string }
  if (!res.ok) throw new Error(data.error || 'Could not upload photo')
}

export async function fetchProviderKeys() {
  const res = await fetch('/api/keys', { credentials: 'include' })
  if (!res.ok) throw new Error('Could not load keys')
  return res.json() as Promise<{
    keys: { id: string; provider: string; label: string; last4: string; created_at: string }[]
  }>
}

export async function saveProviderKey(provider: string, key: string, label?: string) {
  const res = await fetch('/api/keys', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, key, label }),
  })
  const data = (await res.json()) as { error?: string }
  if (!res.ok) throw new Error(data.error || 'Could not save key')
}

export async function deleteProviderKey(provider: string) {
  const res = await fetch(`/api/keys/${provider}`, { method: 'DELETE', credentials: 'include' })
  if (!res.ok) throw new Error('Could not delete key')
}

export type UserApiKey = {
  id: string
  name: string
  last4: string
  created_at: string
  last_used_at: string | null
  expires_at?: string | null
  status: string
}

export type SshKeyRow = {
  id: string
  name: string
  public_key: string
  fingerprint: string
  created_at: string
  status: string
}

export async function fetchAccountKeys() {
  const res = await fetch('/api/account-keys', { credentials: 'include' })
  if (!res.ok) throw new Error('Could not load keys')
  return res.json() as Promise<{ apiKeys: UserApiKey[]; sshKeys: SshKeyRow[] }>
}

export async function createUserApiKey(name: string, expiresInDays?: number | null) {
  const res = await fetch('/api/account-keys', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, expiresInDays }),
  })
  const data = (await res.json()) as { error?: string; id?: string; token?: string; name?: string; last4?: string }
  if (!res.ok || !data.token) throw new Error(data.error || 'Could not create key')
  return data as { id: string; token: string; name: string; last4: string }
}

export async function deleteUserApiKey(id: string) {
  const res = await fetch(`/api/account-keys/${id}`, { method: 'DELETE', credentials: 'include' })
  if (!res.ok) throw new Error('Could not revoke key')
}

export async function createSshKey(name: string, publicKey?: string) {
  const res = await fetch('/api/ssh-keys', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, publicKey }),
  })
  const data = (await res.json()) as {
    error?: string
    publicKey?: string
    privateKey?: string
    fingerprint?: string
    name?: string
  }
  if (!res.ok || !data.publicKey) throw new Error(data.error || 'Could not create SSH key')
  return data as { publicKey: string; privateKey: string; fingerprint: string; name: string }
}

export async function deleteSshKey(id: string) {
  const res = await fetch(`/api/ssh-keys/${id}`, { method: 'DELETE', credentials: 'include' })
  if (!res.ok) throw new Error('Could not remove SSH key')
}

export type InstalledPlugin = {
  id: string
  plugin_id: string
  name: string
  kind: string
  mcp_url: string | null
  required: boolean
  enabled: boolean
  skills: { id: string; label: string; description?: string; insert: string; sourceUrl?: string }[]
  mcps: { id: string; label: string; url: string; sourceUrl: string }[]
  bundle_path: string | null
  publisher: string | null
  description: string | null
  created_at: string
  updated_at?: string
}

export async function fetchPlugins() {
  const res = await fetch('/api/plugins', { credentials: 'include' })
  if (!res.ok) throw new Error('Could not load plugins')
  return res.json() as Promise<{
    catalog: {
      id: string
      name: string
      description: string
      kind: string
      suggested?: boolean
      skills: { id: string; label: string; insert: string }[]
      mcps?: { id: string; label: string; url: string; sourceUrl: string }[]
      mcpHint?: string
    }[]
    installed: InstalledPlugin[]
  }>
}

export async function addPlugin(body: { pluginId?: string; name?: string; mcpUrl?: string; required?: boolean }) {
  const res = await fetch('/api/plugins', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { error?: string; stored?: { neon: boolean; bunny: boolean } }
  if (!res.ok) throw new Error(data.error || 'Could not add plugin')
  return data
}

export async function updatePlugin(id: string, body: { required?: boolean; enabled?: boolean; mcpUrl?: string }) {
  const res = await fetch(`/api/plugins/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Could not update plugin')
}

export async function removePlugin(id: string) {
  const res = await fetch(`/api/plugins/${id}`, { method: 'DELETE', credentials: 'include' })
  if (!res.ok) throw new Error('Could not remove plugin')
}

export type ConnectorRow = {
  id: string
  slug: string
  name: string
  kind: string
  source: string
  plugin_id: string | null
  mcp_url: string
  auth_mode: string
  oauth_client: string
  connected: boolean
  last_check: { id?: string; status?: string; detail?: string; mcp?: ConnectorMcpInfo; steps?: unknown; needsAuth?: boolean } | null
  created_at: string
  updated_at?: string
  hasToken?: boolean
}

export type ConnectorProbeStep = {
  id: string
  label: string
  status: 'done' | 'fail' | 'skip'
  code?: string
  detail: string
  authUrl?: string | null
}

export type ConnectorMcpInfo = {
  serverName: string | null
  serverVersion: string | null
  protocol: string | null
  instructions: string | null
  capabilities: string[]
  tools: { name: string; description: string }[]
  resources: { uri: string; name: string }[]
  prompts: { name: string }[]
  toolsLocked: boolean
}

export async function fetchConnectors() {
  const res = await fetch('/api/connectors', { credentials: 'include' })
  if (!res.ok) throw new Error('Could not load connectors')
  return res.json() as Promise<{
    plan: string
    paid: boolean
    limit: number | null
    used: number
    remaining: number | null
    catalog: { id: string; name: string; pluginId: string; mcpUrl: string; popular?: boolean }[]
    connectors: ConnectorRow[]
  }>
}

export async function probeConnector(body: { url: string; phase?: 'connect' | 'auth' | 'oauth' | 'full'; authUrl?: string }) {
  const res = await fetch('/api/connectors/probe', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as {
    error?: string
    step?: ConnectorProbeStep
    steps?: ConnectorProbeStep[]
    needsAuth?: boolean
    authUrl?: string | null
    mcp?: ConnectorMcpInfo
  }
  if (!res.ok) throw new Error(data.error || 'Could not check that server')
  return data
}

export async function addConnector(body: {
  catalogId?: string
  name?: string
  mcpUrl?: string
  authMode?: string
  oauthClient?: string
  lastCheck?: unknown
}) {
  const res = await fetch('/api/connectors', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as {
    error?: string
    connector?: ConnectorRow
    plugin?: { id: string; name: string } | null
    mcpUrl?: string | null
    loginUrl?: string | null
    needsLogin?: boolean
    signupUrl?: string | null
  }
  if (!res.ok) throw new Error(data.error || 'Could not add connector')
  return data
}

export async function connectConnector(id: string) {
  const res = await fetch(`/api/connectors/${id}/connect`, {
    method: 'POST',
    credentials: 'include',
  })
  const data = (await res.json()) as {
    error?: string
    connected?: boolean
    needsLogin?: boolean
    mcpUrl?: string | null
    loginUrl?: string | null
    signupUrl?: string | null
    connector?: ConnectorRow
    mcp?: ConnectorMcpInfo
  }
  if (!res.ok) throw new Error(data.error || 'Could not connect')
  return data
}

export async function removeConnector(id: string) {
  const res = await fetch(`/api/connectors/${id}`, { method: 'DELETE', credentials: 'include' })
  if (!res.ok) throw new Error('Could not remove connector')
}

export async function saveConnectorToken(id: string, token: string) {
  const res = await fetch(`/api/connectors/${id}/token`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  const data = (await res.json()) as { error?: string }
  if (!res.ok) throw new Error(data.error || 'Could not save token')
}

export async function deleteConnectorToken(id: string) {
  const res = await fetch(`/api/connectors/${id}/token`, { method: 'DELETE', credentials: 'include' })
  if (!res.ok) throw new Error('Could not remove token')
}

export type ConnectDeviceSession = {
  code: string
  url: string
  verificationUri?: string
  provider: string
  name: string
  connectorId?: string | null
  kind?: string
  status?: string
  detail?: string
  oauthStart?: string | null
  loginUrl?: string | null
  github?: boolean
  mine?: boolean
  error?: string
}

export async function startConnect(body: { pluginId?: string; connectorId?: string }) {
  const res = await fetch('/api/connect/start', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as ConnectDeviceSession
  if (!res.ok) throw new Error(data.error || 'Could not start connect')
  return data
}

export async function pollConnectDevice(code: string) {
  const res = await fetch(`/api/connect/device/${encodeURIComponent(code)}`, { credentials: 'include' })
  const data = (await res.json()) as ConnectDeviceSession
  if (!res.ok) throw new Error(data.error || 'Could not check that code')
  return data
}

export async function authorizeConnectDevice(code: string) {
  const res = await fetch(`/api/connect/device/${encodeURIComponent(code)}/authorize`, {
    method: 'POST',
    credentials: 'include',
  })
  const data = (await res.json()) as ConnectDeviceSession
  if (!res.ok && res.status !== 410) throw new Error(data.error || 'Could not authorize')
  return data
}

export async function studioRunCommand(command: string, files: Record<string, string>) {
  const res = await fetch('/api/studio/tools/terminal', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, files }),
  })
  const data = (await res.json()) as { ok?: boolean; text?: string; error?: string }
  if (!res.ok) throw new Error(data.error || 'Command failed')
  return { ok: Boolean(data.ok), text: data.text || '' }
}

export async function studioCloneRepo(repo: string) {
  const res = await fetch('/api/studio/tools/github', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo }),
  })
  const data = (await res.json()) as {
    error?: string
    fullName?: string
    branch?: string
    files?: Record<string, string>
    truncated?: boolean
    count?: number
  }
  if (!res.ok) throw new Error(data.error || 'Could not clone')
  return {
    fullName: data.fullName || repo,
    branch: data.branch || 'main',
    files: data.files || {},
    truncated: Boolean(data.truncated),
    count: data.count || Object.keys(data.files || {}).length,
  }
}

export type GithubRepo = {
  id: number
  name: string
  fullName: string
  private: boolean
  url: string
  description: string | null
  language: string | null
  updatedAt: string
}

export async function fetchGithubRepos() {
  const res = await fetch('/api/github/repos', { credentials: 'include' })
  const data = (await res.json()) as {
    connected?: boolean
    expired?: boolean
    login?: string | null
    repos?: GithubRepo[]
    installUrl?: string
    error?: string
  }
  if (!res.ok) throw new Error(data.error || 'Could not load GitHub projects')
  return {
    connected: Boolean(data.connected),
    expired: Boolean(data.expired),
    login: data.login || null,
    repos: data.repos || [],
    installUrl: data.installUrl || 'https://github.com/apps/soumtok/installations/new',
  }
}

export type AutomationItem = {
  id: string
  type: string
  label: string
  config?: Record<string, string>
}

export type AutomationRow = {
  id: string
  title: string
  active: boolean
  repo_id: string | null
  repo_name: string | null
  instructions: string
  model: string | null
  triggers: AutomationItem[]
  tools: AutomationItem[]
}

export type AutomationRun = {
  id: string
  status: string
  detail: string | null
  created_at: string
}

function mapAutomation(row: Record<string, unknown>): AutomationRow {
  return {
    id: String(row.id),
    title: String(row.title || 'Untitled'),
    active: Boolean(row.active),
    repo_id: (row.repo_id as string | null) ?? null,
    repo_name: (row.repo_name as string | null) ?? null,
    instructions: String(row.instructions || ''),
    model: (row.model as string | null) ?? null,
    triggers: Array.isArray(row.triggers) ? (row.triggers as AutomationRow['triggers']) : [],
    tools: Array.isArray(row.tools) ? (row.tools as AutomationRow['tools']) : [],
  }
}

export async function fetchAutomations() {
  const res = await fetch('/api/automations', { credentials: 'include' })
  if (!res.ok) throw new Error('Could not load automations')
  const data = (await res.json()) as { automations: Record<string, unknown>[] }
  return data.automations.map(mapAutomation)
}

export async function createAutomation() {
  const res = await fetch('/api/automations', { method: 'POST', credentials: 'include' })
  if (!res.ok) throw new Error('Could not create automation')
  return mapAutomation((await res.json()) as Record<string, unknown>)
}

export async function saveAutomation(
  id: string,
  body: {
    title: string
    active: boolean
    repoId: string | null
    repoName: string | null
    instructions: string
    model: string | null
    triggers: AutomationItem[]
    tools: AutomationItem[]
  },
) {
  const res = await fetch(`/api/automations/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as Record<string, unknown> & { error?: string }
  if (!res.ok) throw new Error(data.error || 'Could not save automation')
  return mapAutomation(data)
}

export async function fetchAutomationRuns(id: string) {
  const res = await fetch(`/api/automations/${id}/runs`, { credentials: 'include' })
  if (!res.ok) throw new Error('Could not load run history')
  const data = (await res.json()) as { runs: AutomationRun[] }
  return data.runs || []
}

export async function testAutomation(id: string, detail?: string) {
  const res = await fetch(`/api/automations/${id}/test`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ detail }),
  })
  const data = (await res.json()) as AutomationRun & { error?: string }
  if (!res.ok) throw new Error(data.error || 'Could not test automation')
  return data
}

export async function fetchModels() {
  const res = await fetch('/api/models', { credentials: 'include' })
  if (!res.ok) throw new Error('Could not load models')
  return res.json() as Promise<{
    models: {
      id: string
      name: string
      provider: string
      strength: string
      cost: string
      keys: string
      tags?: string[]
      ready: boolean
    }[]
    image?: {
      id: string
      name: string
      provider: string
      strength: string
      cost: string
      ready: boolean
    }
    images?: {
      id: string
      name: string
      provider: string
      strength: string
      cost: string
      ready: boolean
    }[]
    providers: { id: string; name: string; hint: string; keys: string; connected: boolean }[]
  }>
}

export async function generateStudioImage(prompt: string, model?: string) {
  const res = await fetch('/api/studio/image', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, model }),
  })
  const data = (await res.json()) as { url?: string; model?: string; error?: string }
  if (!res.ok) throw new Error(data.error || 'Image request failed')
  return data
}

export type UserSkill = {
  id: string
  name: string
  file_name: string
  size: number
  content_type: string
  excerpt: string | null
  created_at: string
}

export async function fetchSkills() {
  const res = await fetch('/api/skills', { credentials: 'include' })
  if (!res.ok) throw new Error('Could not load skills')
  return res.json() as Promise<{ skills: UserSkill[] }>
}

export async function uploadSkill(file: File, name?: string) {
  const form = new FormData()
  form.append('file', file)
  if (name) form.append('name', name)
  const res = await fetch('/api/skills', { method: 'POST', credentials: 'include', body: form })
  const data = (await res.json()) as { error?: string; skill?: UserSkill }
  if (!res.ok) throw new Error(data.error || 'Could not save that skill')
  return data.skill!
}

export async function removeSkill(id: string) {
  const res = await fetch(`/api/skills/${id}`, { method: 'DELETE', credentials: 'include' })
  if (!res.ok) throw new Error('Could not remove skill')
}

export type StudioProject = {
  id: string
  title: string
  model: string | null
  repo: GithubRepo | null
  skillIds: string[]
  messages: { role: 'user' | 'assistant' | 'log'; content: string }[]
  workspace?: unknown
  codeLines?: number
  createdAt: string
  updatedAt: string
}

export async function fetchStudioProjects() {
  const res = await fetch('/api/studio/projects', { credentials: 'include' })
  if (!res.ok) throw new Error('Could not load projects')
  return res.json() as Promise<{ projects: StudioProject[] }>
}

export async function fetchStudioProject(id: string) {
  const res = await fetch(`/api/studio/projects/${id}`, { credentials: 'include' })
  const data = (await res.json()) as { error?: string; project?: StudioProject }
  if (!res.ok) throw new Error(data.error || 'Could not open that project')
  return data.project!
}

export async function saveStudioProject(body: {
  id?: string
  title: string
  model?: string | null
  repo?: GithubRepo | null
  skillIds?: string[]
  messages: { role: string; content: string }[]
  workspace?: unknown
}) {
  const res = await fetch(body.id ? `/api/studio/projects/${body.id}` : '/api/studio/projects', {
    method: body.id ? 'PUT' : 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { error?: string; project?: StudioProject }
  if (!res.ok) throw new Error(data.error || 'Could not save project')
  return data.project!
}

export async function removeStudioProject(id: string) {
  const res = await fetch(`/api/studio/projects/${id}`, { method: 'DELETE', credentials: 'include' })
  if (!res.ok) throw new Error('Could not remove project')
}

export async function completeStudio(
  model: string,
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  signal?: AbortSignal,
) {
  const res = await fetch('/api/studio/complete', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages }),
    signal,
  })
  const data = (await res.json()) as {
    text?: string
    error?: string
    keys?: string
    billedTo?: string
    promptTokens?: number
    completionTokens?: number
  }
  if (!res.ok) throw new Error(data.error || 'Model request failed')
  return data
}

export type StudioRun = {
  text: string
  billedTo?: string
  promptTokens?: number
  completionTokens?: number
}

/** Streams a completion, calling onText with the full text so far on each chunk. */

export async function streamStudio(
  model: string,
  messages: { role: 'user' | 'assistant' | 'system'; content: string; files?: ChatFile[] }[],
  onText: (text: string) => void,
  signal?: AbortSignal,
  opts?: {
    temperature?: number
    maxTokens?: number
    agent?: boolean
    files?: Record<string, string>
    repo?: string
    onRound?: (text: string) => void
    onResult?: (result: { name: string; ok: boolean; text: string; files?: Record<string, string>; command?: string }) => void
    onTools?: (tools: { name: string; args: Record<string, string> }[]) => void
  },
): Promise<StudioRun & { files?: Record<string, string> }> {
  const res = await fetch('/api/studio/complete/stream', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts?.temperature,
      maxTokens: opts?.maxTokens,
      agent: opts?.agent,
      files: opts?.files,
      repo: opts?.repo,
    }),
    signal,
  })
  if (!res.ok || !res.body) {
    const failed = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(failed.error || 'Model request failed')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  let final: StudioRun & { files?: Record<string, string> } = { text: '' }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let cut = buffer.indexOf('\n\n')
    while (cut >= 0) {
      const frame = buffer.slice(0, cut).trim()
      buffer = buffer.slice(cut + 2)
      cut = buffer.indexOf('\n\n')
      if (!frame.startsWith('data:')) continue
      const payload = JSON.parse(frame.slice(5).trim()) as {
        delta?: string
        error?: string
        done?: boolean
        reset?: boolean
        round?: number
        text?: string
        tools?: { name: string; args: Record<string, string> }[]
        result?: { name: string; ok: boolean; text: string; files?: Record<string, string>; command?: string }
        files?: Record<string, string>
      } & StudioRun
      if (payload.error) throw new Error(payload.error)
      if (payload.reset) {
        text = ''
        onText('')
      }
      if (payload.delta) {
        text += payload.delta
        onText(text)
      }
      if (payload.tools) opts?.onTools?.(payload.tools)
      if (payload.result) opts?.onResult?.(payload.result)
      if (payload.round != null && payload.text) opts?.onRound?.(payload.text)
      if (payload.done) final = { ...payload, text: payload.text || text, files: payload.files }
    }
  }

  return final.text ? final : { ...final, text }
}

export async function studioCommitRepo(repo: string, message: string, files: Record<string, string>) {
  const res = await fetch('/api/github/commit', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo, message, files }),
  })
  const data = (await res.json()) as { error?: string; sha?: string; url?: string; branch?: string; count?: number }
  if (!res.ok) throw new Error(data.error || 'Could not commit')
  return { sha: data.sha || '', url: data.url || '', branch: data.branch || 'main', count: data.count || 0 }
}

export async function studioOpenPull(repo: string, title: string, files: Record<string, string>, body = '') {
  const res = await fetch('/api/github/pull', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo, title, body, files }),
  })
  const data = (await res.json()) as {
    error?: string
    sha?: string
    prUrl?: string
    number?: number
    branch?: string
    base?: string
  }
  if (!res.ok) throw new Error(data.error || 'Could not open a pull request')
  return {
    sha: data.sha || '',
    prUrl: data.prUrl || '',
    number: data.number || 0,
    branch: data.branch || '',
    base: data.base || 'main',
  }
}

export function connectorOauthStartUrl(id: string) {
  return `/api/connectors/${id}/oauth/start`
}

export async function trackEvent(name: string, path?: string, meta?: Record<string, unknown>) {
  await fetch('/api/analytics', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, path, meta }),
  }).catch(() => undefined)
}

export async function fetchBilling() {
  const res = await fetch('/api/billing/me', { credentials: 'include' })
  if (!res.ok) throw new Error('Could not load billing')
  return res.json() as Promise<{
    plan: string
    planStatus: string
    planCycle?: 'monthly' | 'annual'
    planStartedAt?: string | null
    planRenewsAt?: string | null
    subscriptionId: string | null
    paypal: boolean
    payhero?: boolean
    usdToKes?: number
    orders: {
      id: string
      plan: string
      status: string
      amount: string
      currency?: string
      provider: string
      cycle?: string
      created_at: string
      paid_at?: string | null
      period_start?: string | null
      period_end?: string | null
      receipt_number?: string | null
    }[]
  }>
}

export async function startPaypalCheckout(plan: string, cycle: 'monthly' | 'annual' = 'monthly') {
  const res = await fetch('/api/billing/checkout', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan, cycle }),
  })
  const data = (await res.json()) as { url?: string; error?: string }
  if (!res.ok || !data.url) throw new Error(data.error || 'Could not start checkout')
  return data.url
}

export async function startMpesaCheckout(plan: string, cycle: 'monthly' | 'annual', phone: string) {
  const res = await fetch('/api/billing/mpesa', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan, cycle, phone }),
  })
  const data = (await res.json()) as {
    orderId?: string
    amountKes?: number
    status?: string
    message?: string
    error?: string
  }
  if (!res.ok || !data.orderId) throw new Error(data.error || 'Could not start M-Pesa')
  return data as { orderId: string; amountKes: number; status: string; message?: string }
}

export async function fetchMpesaOrder(orderId: string) {
  const res = await fetch(`/api/billing/mpesa/${orderId}`, { credentials: 'include' })
  const data = (await res.json()) as {
    status?: string
    error?: string
    plan?: string
    amount?: string
    currency?: string
    cycle?: string
    receiptNumber?: string | null
    paidAt?: string | null
    periodStart?: string | null
    periodEnd?: string | null
    receiptUrl?: string | null
  }
  if (!res.ok) throw new Error(data.error || 'Could not check M-Pesa')
  return data
}

export async function fetchAnalytics(range?: { from?: string; to?: string }) {
  const params = new URLSearchParams()
  if (range?.from) params.set('from', range.from)
  if (range?.to) params.set('to', range.to)
  const query = params.toString()
  const res = await fetch(`/api/analytics/summary${query ? `?${query}` : ''}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Could not load usage')
  return res.json() as Promise<{
    usage: {
      model: string
      provider: string
      billed_to: string
      calls: number
      prompt_tokens: number
      completion_tokens: number
    }[]
    events: { name: string; n: number }[]
    activity: { day: string; billed_to: string; edits: number; calls: number }[]
    series: { day: string; model: string; tokens: number }[]
    rows: {
      id: string
      created_at: string
      provider: string
      model: string
      billed_to: string
      prompt_tokens: number
      completion_tokens: number
      tokens: number
    }[]
  }>
}
