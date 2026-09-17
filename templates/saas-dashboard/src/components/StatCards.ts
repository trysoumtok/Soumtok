const STATS = [
  { label: 'MRR', value: '$12,480', delta: '+8%' },
  { label: 'Active users', value: '1,204', delta: '+3%' },
  { label: 'Churn', value: '2.1%', delta: '-0.4%' },
]

export function mountStatCards(host: HTMLElement) {
  host.innerHTML = `
    <section class="stat-grid" aria-label="Metrics">
      ${STATS.map((s) => `
        <article class="stat-card">
          <p class="stat-label">${s.label}</p>
          <p class="stat-value">${s.value}</p>
          <p class="stat-delta">${s.delta}</p>
        </article>`).join('')}
    </section>
  `
}
