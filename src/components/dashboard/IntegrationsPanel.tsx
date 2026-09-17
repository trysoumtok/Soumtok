import { useEffect, useState, type ReactNode } from 'react'
import { GITHUB_APP_INSTALL_URL } from '../../../shared/githubApp.ts'
import { fetchGithubRepos, fetchHealth, type GithubRepo } from '../../lib/api'
import { GithubIcon } from './icons'
import { PluginLogo } from './PluginLogos'

function ExternalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M4.2 2.2H9.8V7.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M9.8 2.2 2.4 9.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function GitHubMark() {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-black">
      <GithubIcon />
    </span>
  )
}

function TeamsMark() {
  return (
    <span className="keep-white grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#5059C9] text-white">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
        <path d="M10.2 4.2h4.2A1.4 1.4 0 0 1 15.8 5.6v4.6a2.6 2.6 0 0 1-2.6 2.6h-.4V7.4A3.2 3.2 0 0 0 10.2 4.2Z" />
        <rect x="2.4" y="5.2" width="8.2" height="8.8" rx="1.4" />
        <circle cx="14.2" cy="3.6" r="1.4" />
      </svg>
    </span>
  )
}

function Row({
  mark,
  title,
  body,
  action,
}: {
  mark: ReactNode
  title: string
  body: string
  action: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-white/[0.05] px-4 py-4 first:border-t-0">
      {mark}
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium">{title}</p>
        <p className="mt-0.5 text-[12px] leading-5 text-white/40">{body}</p>
      </div>
      {action}
    </div>
  )
}

export function IntegrationsPanel({
  connected,
  onConnect,
}: {
  connected: boolean
  onConnect: () => void
}) {
  const [login, setLogin] = useState<string | null>(null)
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [installUrl, setInstallUrl] = useState(GITHUB_APP_INSTALL_URL)
  const [status, setStatus] = useState('')
  const [githubReady, setGithubReady] = useState(true)

  useEffect(() => {
    fetchHealth().then((health) => setGithubReady(health.github)).catch(() => undefined)
  }, [])

  const [linked, setLinked] = useState(connected)

  useEffect(() => {
    setStatus('Loading projects…')
    fetchGithubRepos()
      .then((data) => {
        setLinked(data.connected)
        setLogin(data.login)
        setRepos(data.repos)
        setInstallUrl(data.installUrl)
        if (data.expired) setStatus('GitHub access expired. Connect again to list your projects.')
        else if (!data.connected) setStatus('')
        else if (data.repos.length === 0) {
          setStatus(
            data.grantReposKind === 'oauth'
              ? 'No projects yet. Open Manage and confirm Soumtok can access your repositories on GitHub.'
              : 'No projects yet. Grant Soumtok access to your repositories.',
          )
        }
        else setStatus('')
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Could not load GitHub projects')
      })
  }, [])

  function connect() {
    if (!githubReady) {
      window.location.href = '/api/setup/github/start'
      return
    }
    onConnect()
  }

  return (
    <div className="space-y-8">
      <p className="text-[13px] text-white/45">Connect external tools to extend your team's workflow.</p>

      <section>
        <h2 className="text-[15px] font-medium">Source Control</h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.06] bg-[#141413]">
          <Row
            mark={<GitHubMark />}
            title="GitHub"
            body={
              login
                ? `Connected as @${login}. Cloud agents and Codebase use this account.`
                : 'Connect GitHub for cloud agents and codebase context.'
            }
            action={
              linked ? (
                <a href={installUrl} className="connect-btn">
                  Manage
                  <ExternalIcon />
                </a>
              ) : (
                <button type="button" onClick={connect} className="connect-btn">
                  Connect
                  <ExternalIcon />
                </button>
              )
            }
          />
          <div className="border-t border-white/[0.05] px-4 py-3">
            <p className="text-[12px] text-white/35">More source control providers coming soon.</p>
          </div>
        </div>
        {status && <p className="mt-3 text-[13px] text-white/45">{status}</p>}
        {repos.length > 0 && (
          <div className="mt-3 divide-y divide-white/[0.04] overflow-hidden rounded-xl border border-white/[0.06] bg-[#141413]">
            {repos.map((repo) => (
              <a
                key={repo.id}
                href={repo.url}
                target="_blank"
                rel="noreferrer"
                className="block px-4 py-2.5 hover:bg-white/[0.03]"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-[13px]">{repo.fullName}</span>
                  <span className="text-[11px] text-white/35">{repo.private ? 'Private' : 'Public'}</span>
                </span>
                <span className="mt-0.5 block text-[12px] text-white/40">
                  {repo.language || 'Code'}
                  {repo.description ? ` · ${repo.description}` : ''}
                </span>
              </a>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-[15px] font-medium">Integrations</h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.06] bg-[#141413]">
          <Row
            mark={<PluginLogo id="linear" />}
            title="Linear"
            body="Track issues and ship from Linear next to Studio."
            action={<span className="connect-btn is-soon">Soon</span>}
          />
          <Row
            mark={<PluginLogo id="slack" />}
            title="Slack"
            body="Work with Soumtok from Slack."
            action={<span className="connect-btn is-soon">Soon</span>}
          />
          <Row
            mark={<TeamsMark />}
            title="Microsoft Teams"
            body="Work with Soumtok from Microsoft Teams."
            action={<span className="connect-btn is-soon">Soon</span>}
          />
        </div>
      </section>
    </div>
  )
}
