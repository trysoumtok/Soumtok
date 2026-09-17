import { mountPage } from '../shared/layout'
import { initMotion } from '../motion'

mountPage('about', `
  <section class="page-hero" data-reveal>
    <div class="container narrow">
      <p class="eyebrow">About</p>
      <h1>Our story</h1>
      <p class="lead">We opened with a simple idea: great food and drink in a space that feels like home.</p>
    </div>
  </section>

  <section class="section" data-reveal>
    <div class="container narrow prose">
      <p>What started as a weekend pop-up grew into a neighborhood staple. Every recipe is tested in our kitchen before it lands on the menu.</p>
      <p>We source locally when we can, waste less where it matters, and treat every guest like a regular.</p>
    </div>
  </section>

  <section class="section section-muted" data-reveal>
    <div class="container">
      <p class="eyebrow">Values</p>
      <h2>What we stand for</h2>
      <div class="card-grid">
        <article class="card"><h3>Quality</h3><p class="muted">No shortcuts on ingredients or craft.</p></article>
        <article class="card"><h3>Community</h3><p class="muted">Events, local artists, and open tables.</p></article>
        <article class="card"><h3>Care</h3><p class="muted">For our team, our guests, and the planet.</p></article>
      </div>
    </div>
  </section>
`)

initMotion()
