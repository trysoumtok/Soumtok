import { useState, type ReactNode } from 'react'
import { isTeamPlan, teamSetupPath } from '../../../shared/plans'
import { navigate } from '../../lib/nav'

function FeatureIcon({ children }: { children: ReactNode }) {
  return (
    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center text-white/70">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
        {children}
      </svg>
    </span>
  )
}

const FEATURES = [
  {
    title: 'Team Management',
    body: 'Invite members, manage roles, and control access',
    icon: (
      <>
        <circle cx="7.2" cy="6.2" r="2.2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M3.4 14c.4-2.4 1.9-3.6 3.8-3.6s3.4 1.2 3.8 3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M13.2 5.4v4M11.2 7.4h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </>
    ),
  },
  {
    title: 'Usage Analytics',
    body: 'Track team usage and optimize your subscription',
    icon: (
      <>
        <path d="M4 13.4V8.6M9 13.4V4.6M14 13.4V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </>
    ),
  },
  {
    title: 'Admin Controls',
    body: 'Centralized billing and privacy mode controls',
    icon: (
      <>
        <path
          d="M9 2.6 14.2 5v4.2c0 3.3-2.2 5.4-5.2 6.4-3-1-5.2-3.1-5.2-6.4V5Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  {
    title: 'Rules & Commands',
    body: 'Share rules and commands across your team',
    icon: (
      <>
        <circle cx="5" cy="9" r="2" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="13" cy="5.2" r="2" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="13" cy="12.8" r="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6.8 8.2 11.2 6M6.8 9.8l4.4 2" stroke="currentColor" strokeWidth="1.4" />
      </>
    ),
  },
]

export function MembersPanel({
  plan,
  name,
  email,
}: {
  plan?: string
  name: string
  email?: string | null
}) {
  const [invite, setInvite] = useState('')
  const [note, setNote] = useState('')

  if (!isTeamPlan(plan)) {
    return (
      <div>
        <h1 className="text-[28px] font-medium tracking-[-0.04em] md:text-[32px]">Upgrade to Teams</h1>
        <p className="mt-2 text-[14px] text-white/45">Work with your team and unlock collaborative features</p>

        <div className="mt-8 rounded-xl border border-white/[0.06] bg-[#141413] p-6 md:p-8">
          <div className="grid gap-8 sm:grid-cols-2">
            {FEATURES.map((item) => (
              <div key={item.title} className="flex gap-3">
                <FeatureIcon>{item.icon}</FeatureIcon>
                <div>
                  <p className="text-[14px] font-medium">{item.title}</p>
                  <p className="mt-1 text-[13px] leading-5 text-white/45">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => navigate(teamSetupPath())}
            className="mt-8 inline-flex items-center justify-center rounded-md bg-white px-3.5 py-1.5 text-[13px] font-medium text-black hover:bg-[#f2f2f0]"
          >
            Create team
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-[#141413] px-6 py-5">
          <div>
            <p className="text-[14px] font-medium">Need enterprise features?</p>
            <p className="mt-1 text-[13px] text-white/45">
              Get pooled usage, SCIM seat management, and granular admin controls
            </p>
          </div>
          <a
            href="mailto:info@soumtok.com?subject=Soumtok%20Enterprise"
            className="rounded-md border border-white/15 px-3.5 py-1.5 text-[13px] text-white hover:bg-white/[0.04]"
          >
            Contact sales
          </a>
        </div>
      </div>
    )
  }

  function sendInvite() {
    const value = invite.trim()
    if (!value.includes('@')) {
      setNote('Enter a work email to invite.')
      return
    }
    setNote(`Invite saved for ${value}. They will join this Team workspace.`)
    setInvite('')
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-medium tracking-[-0.04em] md:text-[32px]">Members</h1>
          <p className="mt-2 text-[14px] text-white/45">People on this Team workspace</p>
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            sendInvite()
          }}
        >
          <input
            type="email"
            value={invite}
            onChange={(event) => setInvite(event.target.value)}
            placeholder="Invite email"
            className="w-[220px] rounded-md border border-white/10 bg-transparent px-3 py-1.5 text-[13px] outline-none placeholder:text-white/30"
          />
          <button
            type="submit"
            className="rounded-md bg-white px-3 py-1.5 text-[13px] font-medium text-black hover:bg-[#f2f2f0]"
          >
            Invite
          </button>
        </form>
      </div>

      <div className="mt-8 rounded-xl border border-white/[0.06] bg-[#141413] p-2">
        <div className="flex items-center gap-3 rounded-lg px-3 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-[12px]">
            {name.slice(0, 1).toUpperCase()}
          </span>
          <span>
            <span className="block text-[14px]">{name}</span>
            <span className="block text-[12px] text-white/40">{email}</span>
          </span>
          <span className="ml-auto text-[12px] text-white/35">Owner</span>
        </div>
      </div>
      {note && <p className="mt-3 text-[13px] text-white/45">{note}</p>}
    </div>
  )
}
