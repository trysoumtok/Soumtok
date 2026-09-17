export type PageId = 'home' | 'about' | 'menu' | 'contact'

const NAV: { id: PageId; label: string; href: string }[] = [
  { id: 'home', label: 'Home', href: '/' },
  { id: 'about', label: 'About', href: '/about.html' },
  { id: 'menu', label: 'Menu', href: '/menu.html' },
  { id: 'contact', label: 'Contact', href: '/contact.html' },
]

export function mountHeader(active: PageId): string {
  const links = NAV.map(
    (item) =>
      `<a class="nav-link${item.id === active ? ' is-active' : ''}" href="${item.href}">${item.label}</a>`
  ).join('')
  return `
    <header class="site-header" data-reveal>
      <div class="container header-inner">
        <a class="brand" href="/">{{title}}</a>
        <nav class="nav" aria-label="Main">${links}</nav>
        <a class="btn btn-primary header-cta" href="/contact.html">Visit us</a>
      </div>
    </header>
  `
}

export function mountFooter(): string {
  return `
    <footer class="site-footer" data-reveal>
      <div class="container footer-inner">
        <div>
          <p class="footer-brand">{{title}}</p>
          <p class="muted">{{tagline}}</p>
        </div>
        <nav class="footer-nav" aria-label="Footer">
          <a href="/about.html">About</a>
          <a href="/menu.html">Menu</a>
          <a href="/contact.html">Contact</a>
        </nav>
      </div>
      <p class="footer-copy container">© ${new Date().getFullYear()} {{title}}</p>
    </footer>
  `
}

export function mountPage(active: PageId, mainHtml: string): void {
  const app = document.getElementById('app')
  if (!app) return
  app.innerHTML = mountHeader(active) + `<main class="page-main">${mainHtml}</main>` + mountFooter()
}
