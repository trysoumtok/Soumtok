import type { ReactNode } from 'react'

export function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      {children}
    </svg>
  )
}

export function OverviewIcon() {
  return (
    <Icon>
      <rect x="1.75" y="1.75" width="5.5" height="5.5" rx="1.1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="8.75" y="1.75" width="5.5" height="5.5" rx="1.1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="1.75" y="8.75" width="5.5" height="5.5" rx="1.1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="8.75" y="8.75" width="5.5" height="5.5" rx="1.1" stroke="currentColor" strokeWidth="1.3" />
    </Icon>
  )
}

export function SettingsIcon() {
  return (
    <Icon>
      <path
        d="M6.5 1.8h3l.45 1.55 1.5-.4 2.15 2.15-.4 1.5L14.75 7v2l-1.55.4.4 1.5-2.15 2.15-1.5-.4L9.5 14.2h-3l-.45-1.55-1.5.4-2.15-2.15.4-1.5L1.25 9V7l1.55-.4-.4-1.5 2.15-2.15 1.5.4Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.25" />
    </Icon>
  )
}

export function ModelsIcon() {
  return (
    <Icon>
      <path d="M3.1 6.1 8 3.6l4.9 2.5L8 8.6Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M3.1 8.4 8 10.9l4.9-2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.1 10.7 8 13.2l4.9-2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function StudioIcon() {
  return (
    <Icon>
      <path d="M5.4 4.8 2.6 8l2.8 3.2M10.6 4.8 13.4 8l-2.8 3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.1 3.8 6.9 12.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </Icon>
  )
}

export function AgentsIcon() {
  return (
    <Icon>
      <path
        d="M4.5 11.6h7.1a2.35 2.35 0 0 0 .35-4.68 3.15 3.15 0 0 0-6-1.12A2.55 2.55 0 0 0 4.5 11.6Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M8 7.2v3.1M6.7 8.7h2.6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </Icon>
  )
}

export function PluginsIcon() {
  return (
    <Icon>
      <path
        d="M2.7 2.7h3.8v1.35a1.25 1.25 0 1 0 2.5 0V2.7h3.3v3.8h-1.35a1.25 1.25 0 1 0 0 2.5H12.3v3.3H8.5v-1.35a1.25 1.25 0 1 0-2.5 0v1.35H2.7V8.5h1.35a1.25 1.25 0 1 0 0-2.5H2.7Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </Icon>
  )
}

export function SkillsIcon() {
  return (
    <Icon>
      <path d="M4.2 3.2h7.6v10.4H4.2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6 6h4M6 8.4h4M6 10.8h2.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </Icon>
  )
}

export function ConnectorsIcon() {
  return (
    <Icon>
      <path d="M6.2 4.2 8 2.4l1.8 1.8M6.2 11.8 8 13.6l1.8-1.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="5.2" y="5.6" width="5.6" height="4.8" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
    </Icon>
  )
}

export function IntegrationsIcon() {
  return (
    <Icon>
      <circle cx="4.2" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="11.8" cy="4.4" r="2" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="11.8" cy="11.6" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6 7.2 10 5.2M6 8.8l4 2" stroke="currentColor" strokeWidth="1.3" />
    </Icon>
  )
}

export function KeysIcon() {
  return (
    <Icon>
      <circle cx="5.4" cy="8" r="2.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7.8 8h6.2v2.2M11.4 8v2.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </Icon>
  )
}

export function MembersIcon() {
  return (
    <Icon>
      <circle cx="6" cy="5.6" r="2.1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.4 12.8c.4-2.2 1.8-3.4 3.6-3.4s3.2 1.2 3.6 3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="11.4" cy="6.2" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10.4 12.6c.3-1.4 1.2-2.2 2.4-2.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </Icon>
  )
}

export function UsageIcon() {
  return (
    <Icon>
      <path d="M2.4 12.6 6 7.8l2.6 3 5-6.6" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </Icon>
  )
}

export function SpendingIcon() {
  return (
    <Icon>
      <rect x="2.2" y="4.6" width="11.6" height="8" rx="1.7" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.2 7.2h11.6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="11.1" cy="9.8" r="0.85" fill="currentColor" />
    </Icon>
  )
}

export function BillingIcon() {
  return (
    <Icon>
      <rect x="2.2" y="3.4" width="11.6" height="9.2" rx="1.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.2 6.4h11.6M5 10.2h2.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </Icon>
  )
}

export function SidebarIcon() {
  return (
    <Icon>
      <rect x="2.2" y="2.4" width="11.6" height="11.2" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6.4 2.4v11.2" stroke="currentColor" strokeWidth="1.3" />
    </Icon>
  )
}

export function SearchIcon() {
  return (
    <Icon>
      <circle cx="7" cy="7" r="4.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10.2 10.2 13.4 13.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </Icon>
  )
}

export function ComposeIcon() {
  return (
    <Icon>
      <rect x="2.4" y="2.6" width="11.2" height="10.8" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9.2 5.1 12.2 8l-5.4 3.1-.9-3Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </Icon>
  )
}

export function NewChatIcon() {
  return (
    <Icon>
      <path
        d="M3 3.6h8.4A1.6 1.6 0 0 1 13 5.2v4.2a1.6 1.6 0 0 1-1.6 1.6H7.4L4.6 13.4V11H3A1.4 1.4 0 0 1 1.6 9.6V5A1.4 1.4 0 0 1 3 3.6Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M7.2 5.6v3.2M5.6 7.2h3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </Icon>
  )
}

export function AutomationsIcon() {
  return (
    <Icon>
      <path d="M8 2.2 9.1 5.4 12.4 6.4 9.1 7.5 8 10.6 6.9 7.5 3.6 6.4 6.9 5.4Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M12.4 9.4 13 11.2 14.8 11.8 13 12.4 12.4 14.2 11.8 12.4 10 11.8 11.8 11.2Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </Icon>
  )
}

export function CodebaseIcon() {
  return (
    <Icon>
      <path d="M8 2.4 13.2 5.2v5.6L8 13.6 2.8 10.8V5.2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8 8.2 13.2 5.2M8 8.2 2.8 5.2M8 8.2v5.4" stroke="currentColor" strokeWidth="1.3" />
    </Icon>
  )
}

export function HomeIcon() {
  return (
    <Icon>
      <path d="M2.6 7.2 8 2.8l5.4 4.4V13a1 1 0 0 1-1 1H3.6a1 1 0 0 1-1-1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6.2 14V9.2h3.6V14" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </Icon>
  )
}

export function FilterIcon() {
  return (
    <Icon>
      <path d="M2.6 4.2h10.8M4.2 8h7.6M6 11.8h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </Icon>
  )
}

export function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="5.4" y="2.2" width="5.2" height="7.2" rx="2.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.6 7.6a4.4 4.4 0 0 0 8.8 0M8 12v1.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function MoreIcon() {
  return (
    <Icon>
      <circle cx="3.4" cy="8" r="1.1" fill="currentColor" />
      <circle cx="8" cy="8" r="1.1" fill="currentColor" />
      <circle cx="12.6" cy="8" r="1.1" fill="currentColor" />
    </Icon>
  )
}

export function MultitaskIcon() {
  return (
    <Icon>
      <circle cx="6" cy="8" r="3.1" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="10" cy="8" r="3.1" stroke="currentColor" strokeWidth="1.3" />
    </Icon>
  )
}

export function PaperclipIcon() {
  return (
    <Icon>
      <path
        d="M10.6 7.1 6.4 11.3a2.1 2.1 0 1 1-3-3l5.4-5.4a2.6 2.6 0 0 1 3.7 3.7L7.2 11.9"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  )
}

export function BookIcon() {
  return (
    <Icon>
      <path d="M3.2 3.4h4.2A1.6 1.6 0 0 1 9 5v8.2H4.6A1.4 1.4 0 0 1 3.2 11.8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M12.8 3.4H8.6A1.6 1.6 0 0 0 7 5v8.2h4.4A1.4 1.4 0 0 0 12.8 11.8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </Icon>
  )
}

export function StackIcon() {
  return (
    <Icon>
      <path d="M2.6 6.2 8 3.6l5.4 2.6L8 8.8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M2.6 9.2 8 11.8l5.4-2.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.6 11.6 8 14.2l5.4-2.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  )
}

export function GithubIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.68 7.68 0 0 1 8 4.14c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}
