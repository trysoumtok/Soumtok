export function mountHero(host: HTMLElement) {
  const section = document.createElement('section')
  section.className = 'hero'
  section.innerHTML = `
    <div class="container hero-grid">
      <div class="hero-copy" data-reveal>
        <p class="eyebrow">Built with proven patterns</p>
        <h1>{{title}}</h1>
        <p class="lead">Ship a polished marketing page with real structure — header, hero, features, and CTA — ready to customize for your brand.</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#cta">Start free</a>
          <a class="btn btn-ghost" href="#features">See features</a>
        </div>
      </div>
      <figure class="hero-media" data-reveal>
        <img src="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80" alt="Modern workspace with laptop and natural light" width="1200" height="675" loading="eager" />
      </figure>
    </div>
  `
  host.appendChild(section)
}
