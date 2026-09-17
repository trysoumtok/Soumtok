export function mountCta(host: HTMLElement) {
  const section = document.createElement('section')
  section.id = 'cta'
  section.className = 'cta-band'
  section.innerHTML = `
    <div class="container cta-inner">
      <div>
        <h2>Ready to ship?</h2>
        <p>Run npm install && npm run dev — then open http://localhost:5173</p>
      </div>
      <a class="btn btn-primary btn-lg" href="#contact">Talk to us</a>
    </div>
  `
  host.appendChild(section)
}
