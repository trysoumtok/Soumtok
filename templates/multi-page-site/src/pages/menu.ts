import { mountPage } from '../shared/layout'
import { initMotion } from '../motion'

const ITEMS = [
  { name: 'House blend', price: '$4', cat: 'Coffee', desc: 'Smooth, chocolate notes.' },
  { name: 'Cold brew', price: '$5', cat: 'Coffee', desc: 'Steeped 18 hours.' },
  { name: 'Avocado toast', price: '$12', cat: 'Food', desc: 'Sourdough, chili flakes.' },
  { name: 'Seasonal bowl', price: '$14', cat: 'Food', desc: 'Grains, greens, tahini.' },
  { name: 'Almond croissant', price: '$6', cat: 'Pastry', desc: 'Baked each morning.' },
  { name: 'Matcha latte', price: '$6', cat: 'Coffee', desc: 'Ceremonial grade.' },
]

mountPage('menu', `
  <section class="page-hero" data-reveal>
    <div class="container narrow">
      <p class="eyebrow">Menu</p>
      <h1>What we serve</h1>
      <p class="lead">Filter by category or browse everything below.</p>
    </div>
  </section>

  <section class="section" data-reveal>
    <div class="container">
      <div class="filter-bar" role="tablist" aria-label="Menu categories">
        <button type="button" class="filter is-active" data-filter="all">All</button>
        <button type="button" class="filter" data-filter="Coffee">Coffee</button>
        <button type="button" class="filter" data-filter="Food">Food</button>
        <button type="button" class="filter" data-filter="Pastry">Pastry</button>
      </div>
      <ul class="menu-grid" id="menu-grid">
        ${ITEMS.map(
          (item) =>
            `<li class="menu-item" data-cat="${item.cat}"><div><strong>${item.name}</strong><span class="muted">${item.desc}</span></div><span class="price">${item.price}</span></li>`
        ).join('')}
      </ul>
    </div>
  </section>
`)

initMotion()

document.querySelectorAll('.filter').forEach((btn) => {
  btn.addEventListener('click', () => {
    const cat = (btn as HTMLButtonElement).dataset.filter ?? 'all'
    document.querySelectorAll('.filter').forEach((b) => b.classList.toggle('is-active', b === btn))
    document.querySelectorAll('.menu-item').forEach((row) => {
      const rowCat = (row as HTMLElement).dataset.cat
      ;(row as HTMLElement).hidden = cat !== 'all' && rowCat !== cat
    })
  })
})
