export function mountVisit(host: HTMLElement) {
  const section = document.createElement('section')
  section.id = 'visit'
  section.className = 'visit'
  section.innerHTML = `
    <div class="container visit-inner">
      <div>
        <h2>Visit {{brand}}</h2>
        <p class="address">124 Roastery Lane, Your City</p>
        <dl class="hours">
          <div><dt>Mon–Fri</dt><dd>7:00 – 18:00</dd></div>
          <div><dt>Sat–Sun</dt><dd>8:00 – 17:00</dd></div>
        </dl>
      </div>
      <a class="btn btn-primary btn-lg" href="#contact">Order pickup</a>
    </div>
  `
  host.appendChild(section)
}
