import { mountPage } from '../shared/layout'
import { initMotion } from '../motion'

mountPage('home', `
  <section class="hero" data-reveal>
    <div class="container hero-grid">
      <div class="hero-copy">
        <p class="eyebrow">Welcome</p>
        <h1>{{title}}</h1>
        <p class="lead">{{tagline}}</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="/menu.html">View menu</a>
          <a class="btn btn-ghost" href="/about.html">Our story</a>
        </div>
      </div>
      <div class="hero-media hero-media--placeholder" role="img" aria-label="Hero image — replace via generate_image 16:9"></div>
    </div>
  </section>

  <section class="section" data-reveal>
    <div class="container">
      <p class="eyebrow">Why visit</p>
      <h2>Thoughtfully crafted, every day</h2>
      <div class="card-grid">
        <article class="card"><h3>Fresh daily</h3><p class="muted">Seasonal ingredients and small-batch prep.</p></article>
        <article class="card"><h3>Warm space</h3><p class="muted">A calm corner to meet, work, or unwind.</p></article>
        <article class="card"><h3>Local roots</h3><p class="muted">Partners and producers from our neighborhood.</p></article>
      </div>
    </div>
  </section>

  <section class="section section-muted" data-reveal>
    <div class="container split">
      <div>
        <p class="eyebrow">Explore</p>
        <h2>More than a single scroll</h2>
        <p class="muted">Each page has its own focus — story on About, full menu on Menu, hours and form on Contact.</p>
        <a class="btn btn-primary" href="/about.html">Read our story</a>
      </div>
      <ul class="link-list">
        <li><a href="/about.html">About →</a></li>
        <li><a href="/menu.html">Menu →</a></li>
        <li><a href="/contact.html">Contact →</a></li>
      </ul>
    </div>
  </section>
`)

initMotion()
