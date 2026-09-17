import type { ReactNode } from 'react'

type Props = { title: string; children: ReactNode }

export function Layout({ title, children }: Props) {
  return (
    <div className="layout">
      <header className="topbar">
        <strong>{title}</strong>
      </header>
      <main className="content">{children}</main>
    </div>
  )
}
