export function mountHero(host: HTMLElement): void {
  const section = document.createElement('section')
  section.className = 'hero'
  section.id = 'top'
  section.innerHTML = `
    <div class="container hero-grid">
      <div class="hero-copy" data-reveal>
        <p class="eyebrow">Roasted Tuesday · Shipped Thursday</p>
        <h1>{{title}}</h1>
        <p class="lead">Single-origin espresso, pastry from the oven at 6 a.m., and whole beans bagged the same morning they leave the drum.</p>
        <div class="hero-actions">
          <a class="btn btn-primary btn-lg" href="#menu">Order for pickup</a>
          <a class="btn btn-ghost btn-lg" href="#story">How we source</a>
        </div>
        <ul class="hero-trust">
          <li><strong>4.9</strong><span>Google rating</span></li>
          <li><strong>48h</strong><span>roast to door</span></li>
          <li><strong>11</strong><span>partner farms</span></li>
        </ul>
      </div>
      <figure class="hero-media" data-reveal>
        <img
          src="/assets/generated/hero-coffee.png"
          alt="Latte with rosetta art on a walnut counter"
          width="1200"
          height="675"
          loading="eager"
          onerror="this.src='https://images.unsplash.com/photo-1495474472283-4d71bcdd2085?auto=format&fit=crop&w=1200&h=675&q=80'"
        />
      </figure>
    </div>
  `
  host.appendChild(section)
}
