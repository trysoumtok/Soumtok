export type MenuCategory = 'drinks' | 'food' | 'beans'

export interface MenuItem {
  id: string
  name: string
  price: string
  desc: string
  category: MenuCategory
  tag?: string
}

const MENU: MenuItem[] = [
  { id: 'espresso', name: 'House Espresso', price: '$3.50', desc: 'Double shot, chocolate finish', category: 'drinks', tag: 'Popular' },
  { id: 'flat-white', name: 'Oat Flat White', price: '$5.25', desc: 'Steamed oat milk, 6 oz', category: 'drinks' },
  { id: 'cold-brew', name: 'Cold Brew', price: '$4.75', desc: '18-hour steep, single ice cube', category: 'drinks' },
  { id: 'croissant', name: 'Almond Croissant', price: '$4.50', desc: 'Twice-baked, same-day', category: 'food' },
  { id: 'toast', name: 'Avocado Toast', price: '$9.00', desc: 'Sourdough, chili, lemon', category: 'food' },
  { id: 'guji', name: 'Ethiopia Guji — 250g', price: '$18.00', desc: 'Washed heirloom, roasted Tuesday', category: 'beans', tag: 'New' },
  { id: 'huila', name: 'Colombia Huila — 250g', price: '$16.50', desc: 'Apple, caramel, milk chocolate', category: 'beans' },
  { id: 'decaf', name: 'Swiss Water Decaf — 250g', price: '$15.00', desc: 'Evening-friendly, full body', category: 'beans' },
]

function card(item: MenuItem): string {
  const tag = item.tag ? `<span class="menu-tag">${item.tag}</span>` : ''
  return `
    <li class="menu-item" data-category="${item.category}">
      <div class="menu-row">
        <h3>${item.name}</h3>
        <span class="price">${item.price}</span>
      </div>
      <p>${item.desc}</p>
      <div class="menu-foot">
        ${tag}
        <button type="button" class="btn btn-sm btn-primary" data-add="${item.name}">Add to order</button>
      </div>
    </li>`
}

export function mountMenu(host: HTMLElement): void {
  const section = document.createElement('section')
  section.id = 'menu'
  section.className = 'menu'
  section.innerHTML = `
    <div class="container">
      <header class="section-head" data-reveal>
        <p class="eyebrow">Order</p>
        <h2>Menu</h2>
        <p>Drinks served in-house; beans ship within 48 hours of roast.</p>
      </header>
      <div class="menu-filters" role="tablist" aria-label="Filter menu" data-reveal>
        <button type="button" class="filter is-active" data-filter="all" role="tab" aria-selected="true">All</button>
        <button type="button" class="filter" data-filter="drinks" role="tab" aria-selected="false">Drinks</button>
        <button type="button" class="filter" data-filter="food" role="tab" aria-selected="false">Food</button>
        <button type="button" class="filter" data-filter="beans" role="tab" aria-selected="false">Beans</button>
      </div>
      <ul class="menu-grid" id="menuGrid">
        ${MENU.map(card).join('')}
      </ul>
    </div>
  `
  host.appendChild(section)

  const filters = section.querySelector('.menu-filters')
  const grid = section.querySelector('#menuGrid')
  if (!filters || !grid) return

  filters.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('.filter')
    if (!btn) return
    const cat = btn.dataset.filter || 'all'
    filters.querySelectorAll<HTMLButtonElement>('.filter').forEach((chip) => {
      const on = chip === btn
      chip.classList.toggle('is-active', on)
      chip.setAttribute('aria-selected', String(on))
    })
    grid.querySelectorAll<HTMLElement>('.menu-item').forEach((item) => {
      const show = cat === 'all' || item.dataset.category === cat
      item.hidden = !show
    })
  })
}
