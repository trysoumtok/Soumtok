import type { Hono } from 'hono'
import { brandLogoFetchUrls, isRawFetchBody, wantsBrandAsset } from '../shared/brandLogo.ts'
import { extractUrls, lookupQuery } from '../shared/capabilities.ts'
import { formatToolResults, isEditTool, runLocalTool, type StudioTool, type ToolOutcome } from '../shared/tools.ts'
import { pool } from './db.ts'
import { callMcpTool, connectorBearer } from './connectors.ts'
import { generateStillImage, examineMediaBytes } from './studioMedia.ts'
import { imageChargeTokens } from '../shared/imageBilling.ts'
import { IMAGE_MODEL } from '../shared/models.ts'
import { assertPlatformTokenBudget, recordImageUsage } from './imageUsage.ts'
import { commitRepoFiles, fetchRepoSnapshot } from './github.ts'
import { createSandboxDir, isGitPushCommand, removeSandboxDir, runSandboxed } from './sandbox.ts'
import { redactSecrets } from '../shared/secretsGuard.ts'
import { resolveToolName } from '../shared/typoIntent.ts'

type ReadyFn = (c: { req: { raw: Request } }) => Promise<{
  session: { user: { id: string } } | null
  ready: boolean
}>

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|0\.|::1|\[::1\])/i

function publicHttps(raw: string) {
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== 'https:') return null
    if (PRIVATE_HOST.test(url.hostname) || url.hostname.endsWith('.local')) return null
    return url
  } catch {
    return null
  }
}

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&quot;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchPage(url: string) {
  const parsed = publicHttps(url)
  if (!parsed) throw new Error('Only public https URLs can be fetched')
  const res = await fetch(parsed, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'SownStudio/1.0 (research fetch)',
      Accept: 'text/html,application/json,image/svg+xml,text/plain;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(12_000),
  })
  const raw = (await res.text()).slice(0, 400_000)
  const type = res.headers.get('content-type') || ''
  const text = isRawFetchBody(type, parsed.toString(), raw) ? raw : htmlToText(raw)
  const title = raw.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || parsed.hostname
  return { url: parsed.toString(), title, text: text.slice(0, 24_000), status: res.status, ok: res.ok }
}

async function wikiLookup(query: string) {
  const q = lookupQuery(query)
  if (q.length < 3) return []
  const search = new URL('https://en.wikipedia.org/w/api.php')
  search.searchParams.set('action', 'query')
  search.searchParams.set('list', 'search')
  search.searchParams.set('srsearch', q)
  search.searchParams.set('srlimit', '2')
  search.searchParams.set('format', 'json')
  search.searchParams.set('utf8', '1')
  const listed = await fetch(search, { signal: AbortSignal.timeout(10_000) })
  const data = (await listed.json()) as { query?: { search?: { title?: string }[] } }
  const titles = (data.query?.search || []).map((item) => item.title).filter(Boolean) as string[]
  const pages = []
  for (const title of titles.slice(0, 2)) {
    const summary = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json' },
    })
    if (!summary.ok) continue
    const row = (await summary.json()) as { title?: string; extract?: string; content_urls?: { desktop?: { page?: string } } }
    if (row.extract) {
      pages.push({
        url: row.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
        title: row.title || title,
        text: row.extract,
        status: 200,
        ok: true,
      })
    }
  }
  return pages
}

export function sanitizeToolFiles(files: Record<string, string> | undefined) {
  const safe: Record<string, string> = {}
  for (const [filePath, content] of Object.entries(files || {}).slice(0, 80)) {
    if (typeof content !== 'string') continue
    const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean)
    if (parts.length === 0 || parts.some((part) => part === '..')) continue
    safe[parts.join('/')] = content.slice(0, 80_000)
  }
  return safe
}

export async function fetchStudioPages(input: { url?: string; query?: string; urls?: string[] }) {
  const query = input.query || ''
  const urls = [
    ...(input.urls || []),
    ...(input.url ? [input.url] : []),
    ...extractUrls(query),
    ...(wantsBrandAsset(query) ? brandLogoFetchUrls(query) : []),
  ]
    .map((item) => item.trim())
    .filter(Boolean)
  const pages = []
  for (const url of [...new Set(urls)].slice(0, 4)) {
    try {
      pages.push(await fetchPage(url))
    } catch (error) {
      pages.push({
        url,
        title: url,
        text: error instanceof Error ? error.message : 'Could not fetch',
        status: 0,
        ok: false,
      })
    }
  }
  const hasSvg = pages.some((page) => page.ok !== false && /<svg[\s>]/i.test(page.text || ''))
  const shouldWiki = wantsBrandAsset(query)
    ? !hasSvg
    : pages.length === 0 && query && !extractUrls(query).length
  if (shouldWiki) {
    try {
      pages.push(...(await wikiLookup(query)))
    } catch {
      /* no encyclopedia hit is fine */
    }
  }
  return pages
}

export async function executeStudioTool(
  userId: string,
  tool: StudioTool,
  files: Record<string, string>,
  ctx: { repo?: string; sandboxDir?: string } = {},
): Promise<ToolOutcome> {
  const name = resolveToolName(tool.name)
  const args = tool.args || {}
  const toolResolved = name === tool.name ? tool : { ...tool, name }
  if (
    (name === 'read' || name === 'grep' || name === 'write' || isEditTool(name)) &&
    name !== 'generate_image'
  ) {
    return runLocalTool(toolResolved, files)
  }
  if (name === 'fetch') {
    const pages = await fetchStudioPages({ url: args.url, query: args.query || args.q, urls: extractUrls(`${args.url || ''} ${args.query || ''}`) })
    return {
      name,
      ok: pages.some((page) => page.ok !== false),
      text:
        pages
          .map((page) => {
            const body = redactSecrets(page.text)
            const limit = /<svg[\s>]/i.test(body) ? 12_000 : 4_000
            return `${page.title}\n${page.url}\n${body.slice(0, limit)}`
          })
          .join('\n\n') || 'No pages',
    }
  }
  if (name === 'github') {
    const repo = args.repo || args.fullName || ctx.repo || ''
    const snap = await fetchRepoSnapshot(userId, repo)
    return {
      name,
      ok: true,
      text: `Cloned ${snap.fullName}@${snap.branch} (${snap.count} files${snap.truncated ? ', truncated' : ''})`,
      files: snap.files,
    }
  }
  if (name === 'terminal') {
    const command = args.command || args.cmd || ''
    if (isGitPushCommand(command)) {
      if (!ctx.repo) return { name, ok: false, text: 'Attach a GitHub project to push' }
      const pushed = await commitRepoFiles(userId, ctx.repo, 'Update from Studio', files)
      return { name, ok: true, text: `Pushed ${pushed.count} files to ${pushed.fullName}@${pushed.branch} ${pushed.url}` }
    }
    const ran = await runSandboxed(command, files, { persistDir: ctx.sandboxDir })
    return { name, ok: ran.ok, text: ran.text }
  }
  if (name === 'mcp') {
    if (!pool) return { name, ok: false, text: 'Database is not connected' }
    const listed = await pool.query(`SELECT id, name, mcp_url FROM user_connectors WHERE user_id = $1`, [userId])
    const conn = listed.rows.find(
      (row) => row.name === args.server || row.id === args.server || row.name === args.connector || row.id === args.connector,
    ) as { id: string; name: string; mcp_url: string } | undefined
    if (!conn) {
      return {
        name,
        ok: false,
        text: 'No matching connector. Say “connect” plus the service name to get a sign-in link and a code.',
      }
    }
    const auth = await connectorBearer(userId, conn.id)
    const data = await callMcpTool(
      conn.mcp_url,
      args.tool || args.name,
      Object.fromEntries(Object.entries(args).filter(([key]) => !['server', 'connector', 'tool', 'name'].includes(key))),
      auth,
    )
    return { name, ok: true, text: JSON.stringify(data ?? {}).slice(0, 8000) }
  }
  if (name === 'generate_image') {
    const prompt = String(args.prompt || args.text || '').trim()
    try {
      const modelId = String(args.model || '').trim() || IMAGE_MODEL.id
      const chargeTokens = imageChargeTokens(modelId)
      if (pool) {
        const profile = await pool.query(`SELECT plan FROM profiles WHERE user_id = $1`, [userId])
        const planId = String(profile.rows[0]?.plan || 'hobby')
        const budget = await assertPlatformTokenBudget(pool, userId, planId, chargeTokens)
        if (!budget.ok) {
          return { name, ok: false, text: budget.error }
        }
      }
      const generated = await generateStillImage(prompt, args.model)
      const rel = String(args.path || `assets/generated/${Date.now().toString(36)}.${generated.ext}`).replace(/^\/+/, '')
      let billing = ''
      if (pool) {
        const billed = await recordImageUsage(pool, userId, generated.model.id, generated.model.provider)
        billing = ` Billed ${billed.tokens.toLocaleString()} tokens (~$${billed.chargeUsd.toFixed(2)} incl. platform fee).`
      }
      return {
        name,
        ok: true,
        text: `Generated still image (${generated.model.id}, ${generated.bytes.length} bytes). Save as ${rel} on Desktop.${billing}`,
      }
    } catch (error) {
      return { name, ok: false, text: error instanceof Error ? error.message : 'Image generation failed' }
    }
  }
  if (name === 'examine_media') {
    const raw = String(args.base64 || args.data || '').replace(/^data:[^;]+;base64,/, '')
    if (!raw) {
      return {
        name,
        ok: false,
        text: 'examine_media on web Studio needs base64 bytes. On Desktop, pass a workspace path.',
      }
    }
    try {
      const out = await examineMediaBytes({
        mime: args.mime || 'image/jpeg',
        base64: raw,
        prompt: args.prompt,
      })
      return { name, ok: true, text: `${out.model}\n\n${out.analysis}` }
    } catch (error) {
      return { name, ok: false, text: error instanceof Error ? error.message : 'Examine failed' }
    }
  }
  return { name, ok: false, text: `Unknown tool ${name}` }
}

export async function runStudioTools(
  userId: string,
  tools: StudioTool[],
  files: Record<string, string>,
  ctx: { repo?: string; sandboxDir?: string } = {},
) {
  const owned = !ctx.sandboxDir
  const sandboxDir = ctx.sandboxDir || (await createSandboxDir())
  let next = { ...files }
  const outcomes: ToolOutcome[] = []
  try {
    for (const tool of tools) {
      try {
        const out = await executeStudioTool(userId, tool, next, { ...ctx, sandboxDir })
        outcomes.push(out)
        if (out.files) next = { ...next, ...out.files }
      } catch (error) {
        outcomes.push({ name: tool.name, ok: false, text: error instanceof Error ? error.message : 'Tool failed' })
      }
    }
    return { outcomes, files: next, followUp: formatToolResults(outcomes) }
  } finally {
    if (owned) await removeSandboxDir(sandboxDir)
  }
}

export function registerStudioTools(app: Hono, requireReadyUser: ReadyFn) {
  app.post('/api/studio/tools/fetch', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const body = await c.req.json<{ url?: string; query?: string; urls?: string[] }>()
    const pages = await fetchStudioPages(body)
    return c.json({ pages })
  })

  app.post('/api/studio/tools/mcp', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const body = await c.req.json<{ connectorId?: string; tool?: string; args?: Record<string, unknown> }>()
    if (!body.connectorId || !body.tool) return c.json({ error: 'Pick a connector and a tool' }, 400)
    const row = await pool.query(`SELECT id, name, mcp_url, connected FROM user_connectors WHERE id = $1 AND user_id = $2`, [
      body.connectorId,
      session.user.id,
    ])
    const connector = row.rows[0] as { id: string; name: string; mcp_url: string; connected: boolean } | undefined
    if (!connector) return c.json({ error: 'Connector not found' }, 404)
    try {
      const auth = await connectorBearer(session.user.id, connector.id)
      const result = await callMcpTool(connector.mcp_url, body.tool, body.args || {}, auth)
      return c.json({ ok: true, server: connector.name, tool: body.tool, result })
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'MCP call failed' }, 400)
    }
  })

  app.post('/api/studio/tools/terminal', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const body = await c.req.json<{ command?: string; files?: Record<string, string> }>()
    const command = body.command?.trim() || ''
    if (!command) return c.json({ error: 'Write a command' }, 400)
    const files = body.files && typeof body.files === 'object' ? body.files : {}
    const safe = sanitizeToolFiles(files)
    const result = await runSandboxed(command, safe)
    return c.json(result)
  })

  app.post('/api/studio/tools/run', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const body = await c.req.json<{ tools?: StudioTool[]; files?: Record<string, string>; repo?: string }>()
    const tools = Array.isArray(body.tools) ? body.tools.filter((item) => item && item.kind === 'tool' && item.name).slice(0, 8) : []
    if (tools.length === 0) return c.json({ error: 'No tools to run' }, 400)
    try {
      const ran = await runStudioTools(session.user.id, tools, sanitizeToolFiles(body.files), { repo: body.repo })
      return c.json(ran)
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Tools failed' }, 400)
    }
  })

  app.post('/api/studio/tools/github', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const body = await c.req.json<{ repo?: string }>()
    try {
      const snapshot = await fetchRepoSnapshot(session.user.id, body.repo || '')
      return c.json(snapshot)
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Could not clone' }, 400)
    }
  })

  app.get('/api/studio/tools/context', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const [skills, plugins, connectors, documents] = await Promise.all([
      pool.query(`SELECT id, name, file_name, excerpt FROM user_skills WHERE user_id = $1 ORDER BY created_at DESC LIMIT 40`, [
        session.user.id,
      ]),
      pool.query(`SELECT name, skills, mcps FROM user_plugins WHERE user_id = $1 AND enabled IS DISTINCT FROM false`, [session.user.id]),
      pool.query(`SELECT id, name, connected, mcp_url, last_check FROM user_connectors WHERE user_id = $1`, [session.user.id]),
      pool.query(`SELECT id, title, folder, left(content, 280) AS snippet FROM documents WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 20`, [
        session.user.id,
      ]),
    ])
    return c.json({
      skills: skills.rows,
      plugins: plugins.rows,
      connectors: connectors.rows.map((row) => {
        const check = (row.last_check || {}) as { mcp?: { tools?: { name: string; description: string }[] } }
        return {
          id: row.id,
          name: row.name,
          connected: row.connected,
          mcpUrl: row.mcp_url,
          tools: check.mcp?.tools || [],
        }
      }),
      documents: documents.rows,
    })
  })
}
