import { mountPage } from '../shared/layout'
import { initMotion } from '../motion'

mountPage('contact', `
  <section class="page-hero" data-reveal>
    <div class="container narrow">
      <p class="eyebrow">Contact</p>
      <h1>Visit or reach out</h1>
      <p class="lead">We reply within one business day.</p>
    </div>
  </section>

  <section class="section" data-reveal>
    <div class="container contact-grid">
      <form class="contact-form" id="contact-form">
        <label>Name<input name="name" required autocomplete="name" /></label>
        <label>Email<input name="email" type="email" required autocomplete="email" /></label>
        <label>Message<textarea name="message" rows="4" required></textarea></label>
        <button type="submit" class="btn btn-primary">Send message</button>
        <p class="form-note muted" id="form-note" hidden>Thanks — we will be in touch soon.</p>
      </form>
      <aside class="contact-aside">
        <h2>Hours</h2>
        <ul class="hours-list">
          <li><span>Mon–Fri</span><span>7:00 – 18:00</span></li>
          <li><span>Sat–Sun</span><span>8:00 – 17:00</span></li>
        </ul>
        <h2>Location</h2>
        <p class="muted">123 Main Street<br />Your City</p>
        <a class="btn btn-ghost" href="https://maps.google.com" target="_blank" rel="noopener">Open in maps</a>
      </aside>
    </div>
  </section>
`)

initMotion()

document.getElementById('contact-form')?.addEventListener('submit', (e) => {
  e.preventDefault()
  const note = document.getElementById('form-note')
  if (note) note.hidden = false
  ;(e.target as HTMLFormElement).reset()
})
