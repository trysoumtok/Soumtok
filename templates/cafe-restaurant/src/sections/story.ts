export function mountStory(host: HTMLElement): void {
  const section = document.createElement('section')
  section.id = 'story'
  section.className = 'story'
  section.innerHTML = `
    <div class="container story-grid">
      <div class="story-copy" data-reveal>
        <p class="eyebrow">The roastery</p>
        <h2>Eleven farms, one small drum.</h2>
        <p>
          We buy directly from families in Ethiopia, Colombia, and Guatemala —
          paying well above the fair-trade floor — and roast in 12 kg batches
          every morning before the cafe opens.
        </p>
        <ul class="story-list">
          <li>Roast date printed on every bag</li>
          <li>Compostable packaging, no plastic liners</li>
          <li>Free grind match for your brewer</li>
        </ul>
      </div>
      <div class="story-aside" data-reveal>
        <div class="story-stat">
          <strong>Est. 2014</strong>
          <span>Portland, Oregon</span>
        </div>
        <div class="story-stat">
          <strong>480 kg</strong>
          <span>roasted this week</span>
        </div>
      </div>
    </div>
  `
  host.appendChild(section)
}
