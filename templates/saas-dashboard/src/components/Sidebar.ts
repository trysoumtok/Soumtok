const NAV = [
  { label: 'Overview', active: true },
  { label: 'Customers', active: false },
  { label: 'Billing', active: false },
  { label: 'Settings', active: false },
]

export function mountSidebar(host: HTMLElement) {
  host.innerHTML = `
    <div class="sidebar-inner">
      <p class="sidebar-brand">{{brand}}</p>
      <nav aria-label="Dashboard">
        <ul>${NAV.map((n) => `<li><a href="#" class="${n.active ? 'active' : ''}">${n.label}</a></li>`).join('')}</ul>
      </nav>
    </div>
  `
}
