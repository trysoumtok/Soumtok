const FEATURES = [
  { title: 'Fast scaffold', body: 'Vite dev server on port 5173 with TypeScript strict mode out of the box.' },
  { title: 'Accessible layout', body: 'Semantic landmarks, skip link, focus states, and 44px touch targets.' },
  { title: 'Responsive design', body: 'Mobile-first grid that scales to desktop without horizontal scroll.' },
  { title: 'Real content hooks', body: 'Section modules you can rename and extend — not one giant HTML string.' },
]

export function mountFeatures(host: HTMLElement) {
  const section = document.createElement('section')
  section.id = 'features'
  section.className = 'features'
  section.innerHTML = `
    <div class="container">
      <header class="section-head">
        <h2>Everything you need to launch</h2>
        <p>Four feature cards with real copy — replace with your product story.</p>
      </header>
      <ul class="feature-grid">
        ${FEATURES.map(
          (f) => `
          <li class="feature-card">
            <h3>${f.title}</h3>
            <p>${f.body}</p>
          </li>`,
        ).join('')}
      </ul>
    </div>
  `
  host.appendChild(section)
}
