import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Hono } from 'hono'
import { env, hasGithub } from './env.ts'

const CALLBACK = `${env.betterAuthUrl}/api/auth/callback/github`
const SETUP_REDIRECT = `${env.betterAuthUrl}/api/setup/github`

const manifest = {
  name: 'Soumtok',
  url: env.betterAuthUrl,
  redirect_url: SETUP_REDIRECT,
  callback_urls: [CALLBACK],
  setup_url: `${env.betterAuthUrl}/login`,
  description: 'Sign in to Soumtok with GitHub',
  public: true,
  default_permissions: { metadata: 'read', contents: 'read', pull_requests: 'write' },
}

function upsertEnv(key: string, value: string) {
  const file = resolve(process.cwd(), '.env')
  const line = `${key}=${value}`
  let text = readFileSync(file, 'utf8')
  if (new RegExp(`^${key}=`, 'm').test(text)) {
    text = text.replace(new RegExp(`^${key}=.*$`, 'm'), line)
  } else {
    text = `${text.trimEnd()}\n${line}\n`
  }
  writeFileSync(file, text)
}

function page(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    html,body{margin:0;min-height:100%;background:#0b0b0a;color:#fff;font:16px/1.5 ui-sans-serif,system-ui}
    main{max-width:460px;margin:18vh auto;padding:0 24px}
    h1{font-size:28px;letter-spacing:-.04em;margin:0 0 8px}
    p{color:#ffffff88}
    button,.btn{display:block;width:100%;border:0;border-radius:10px;background:#262626;color:#fff;font:600 15px/1 ui-sans-serif,system-ui;padding:14px;cursor:pointer;text-align:center;text-decoration:none}
    button:hover,.btn:hover{background:#303030}
    .note{font-size:13px;color:#ffffff55}
  </style>
</head>
<body><main>${body}</main></body>
</html>`
}

export function registerGithubSetup(app: Hono) {
  app.get('/api/setup/github/start', (c) => {
    if (hasGithub()) {
      return c.html(
        page(
          'GitHub already connected',
          `<h1>GitHub is already connected</h1>
           <p>Soumtok can already sign people in with GitHub.</p>
           <a class="btn" href="/login">Go to sign in</a>`,
        ),
      )
    }

    return c.html(
      page(
        'Connect Soumtok GitHub',
        `<h1>Connect the Soumtok GitHub</h1>
         <p>In the next tab, GitHub will ask you to create the Soumtok app. Sign in as <strong>Soumtok</strong>, not another personal account.</p>
         <form action="https://github.com/settings/apps/new" method="post">
           <input type="hidden" name="manifest" value='${JSON.stringify(manifest)}' />
           <button type="submit">Connect Soumtok GitHub</button>
         </form>
         <p class="note">Callback used for user sign-in: ${CALLBACK}</p>`,
      ),
    )
  })

  app.get('/api/setup/github', async (c) => {
    const code = c.req.query('code')
    if (!code) {
      return c.html(
        page(
          'GitHub setup',
          `<h1>Missing GitHub code</h1>
           <p>Start the connect flow again.</p>
           <a class="btn" href="/api/setup/github/start">Try again</a>`,
        ),
        400,
      )
    }

    const res = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    const data = (await res.json()) as {
      name?: string
      html_url?: string
      owner?: { login?: string }
      client_id?: string
      client_secret?: string
      message?: string
    }

    if (!res.ok || !data.client_id || !data.client_secret) {
      return c.html(
        page(
          'GitHub setup failed',
          `<h1>Could not finish GitHub setup</h1>
           <p>${data.message || 'GitHub did not return app credentials.'}</p>
           <a class="btn" href="/api/setup/github/start">Try again</a>`,
        ),
        400,
      )
    }

    upsertEnv('GITHUB_CLIENT_ID', data.client_id)
    upsertEnv('GITHUB_CLIENT_SECRET', data.client_secret)
    env.githubClientId = data.client_id
    env.githubClientSecret = data.client_secret

    return c.html(
      page(
        'GitHub connected',
        `<h1>Soumtok GitHub is connected</h1>
         <p>App owner: <strong>${data.owner?.login || 'Soumtok'}</strong>. Restart the Soumtok server, then people can sign in with GitHub.</p>
         <a class="btn" href="/login">Back to sign in</a>`,
      ),
    )
  })
}
