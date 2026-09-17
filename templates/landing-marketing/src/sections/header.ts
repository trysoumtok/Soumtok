export function mountHeader(host: HTMLElement) {
  host.innerHTML = `
    <header class="site-header">
      <div class="container header-inner">
        <a class="logo" href="#">{{brand}}</a>
        <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">Menu</button>
        <nav id="site-nav" class="site-nav" aria-label="Primary">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#contact">Contact</a>
          <a class="btn btn-primary btn-sm" href="#cta">Get started</a>
        </nav>
      </div>
    </header>
  `
  const toggle = host.querySelector<HTMLButtonElement>('.nav-toggle')
  const nav = host.querySelector('#site-nav')
  toggle?.addEventListener('click', () => {
    const open = nav?.classList.toggle('open')
    toggle.setAttribute('aria-expanded', String(Boolean(open)))
  })
}
