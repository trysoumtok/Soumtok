export function mountHeader(host: HTMLElement) {
  host.innerHTML = `
    <header class="site-header" id="siteHeader">
      <div class="container header-inner">
        <a class="logo" href="#top">{{brand}}</a>
        <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">Menu</button>
        <nav id="site-nav" class="site-nav" aria-label="Primary">
          <a href="#menu">Menu</a>
          <a href="#story">Story</a>
          <a href="#visit">Visit</a>
          <a class="btn btn-primary btn-sm" href="#menu">Order</a>
        </nav>
        <button type="button" class="order-bag" id="orderBag" aria-label="Order bag">
          <span class="order-bag__label">Bag</span>
          <span class="order-bag__count" id="orderCount">0</span>
        </button>
      </div>
    </header>
  `
  const toggle = host.querySelector<HTMLButtonElement>('.nav-toggle')
  const nav = host.querySelector('#site-nav')
  toggle?.addEventListener('click', () => {
    const open = nav?.classList.toggle('open')
    toggle.setAttribute('aria-expanded', String(Boolean(open)))
  })

  const header = host.querySelector('#siteHeader')
  const onScroll = (): void => {
    header?.classList.toggle('is-stuck', window.scrollY > 16)
  }
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
}
