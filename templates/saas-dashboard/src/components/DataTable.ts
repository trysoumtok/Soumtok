const ROWS = [
  { customer: 'Acme Co', plan: 'Pro', mrr: '$299' },
  { customer: 'Northwind', plan: 'Team', mrr: '$899' },
  { customer: 'Globex', plan: 'Starter', mrr: '$49' },
]

export function mountDataTable(host: HTMLElement) {
  host.innerHTML = `
    <section class="panel">
      <h2>Recent customers</h2>
      <table>
        <thead><tr><th>Customer</th><th>Plan</th><th>MRR</th></tr></thead>
        <tbody>
          ${ROWS.map((r) => `<tr><td>${r.customer}</td><td>${r.plan}</td><td>${r.mrr}</td></tr>`).join('')}
        </tbody>
      </table>
    </section>
  `
}
