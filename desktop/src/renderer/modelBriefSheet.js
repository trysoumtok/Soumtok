/** Full Soumtok model study overlay — print to PDF. */

;(function () {

  const BRIEF = () => window.SoumtokModelBrief || {}

  const CATALOG = () => window.SOUMTOK_MODEL_CATALOG || { MODELS: [] }

  const LOCKUP = '../../resources/lockup.png'

  const MARK = '../../resources/icon.png'

  const PROVIDER_LOGO = {

    deepseek: '../../resources/logos/deepseek.svg',

    openai: '../../resources/logos/openai.svg',

    anthropic: '../../resources/logos/anthropic.svg',

    google: '../../resources/logos/google-g.svg',

    xai: '../../resources/logos/xai.svg',

    openrouter: '../../resources/logos/openai.svg',

  }



  function escapeHtml(s) {

    return String(s || '')

      .replace(/&/g, '&amp;')

      .replace(/</g, '&lt;')

      .replace(/>/g, '&gt;')

      .replace(/"/g, '&quot;')

  }



  function findModel(id) {

    return (CATALOG().MODELS || []).find((m) => m.id === id)

  }



  function barsHtml(scores) {

    return (scores || [])

      .map(

        (row) => `<div class="ms-bar">

          <div class="ms-bar-top"><span>${escapeHtml(row.label)}</span><span class="ms-bar-n">${row.value}</span></div>

          <div class="ms-bar-track"><div class="ms-bar-fill" style="width:${Math.max(0, Math.min(100, row.value))}%"></div></div>

          <p class="ms-bar-note">${escapeHtml(row.note)}</p>

        </div>`,

      )

      .join('')

  }



  function chapterHtml(ch) {

    const paras = (ch.paragraphs || []).map((p) => `<p>${escapeHtml(p)}</p>`).join('')

    const bullets = ch.bullets?.length

      ? `<ul class="ms-list">${ch.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`

      : ''

    return `<section class="ms-chapter">

      <p class="ms-ch-kicker">${escapeHtml(ch.n)} · ${escapeHtml(ch.kicker)}</p>

      <h2>${escapeHtml(ch.title)}</h2>

      ${paras}${bullets}

    </section>`

  }



  function tableHtml(headers, rows) {

    const head = `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`

    const body = `<tbody>${rows

      .map((r) => `<tr>${r.map((c, i) => `<td class="${i === 0 ? 'strong' : ''}">${escapeHtml(c)}</td>`).join('')}</tr>`)

      .join('')}</tbody>`

    return `<div class="ms-table-wrap"><table class="ms-table">${head}${body}</table></div>`

  }



  function specTable(specs) {

    const body = (specs || [])

      .map((s) => `<tr><th>${escapeHtml(s.label)}</th><td>${escapeHtml(s.value)}</td></tr>`)

      .join('')

    return `<div class="ms-table-wrap"><table class="ms-table ms-spec">${body}</table></div>`

  }



  function renderDoc(study) {

    const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

    const stats = (study.stats || [])

      .map(

        (s) => `<div class="ms-stat"><p class="ms-stat-hint">${escapeHtml(s.hint)}</p><p class="ms-stat-value">${escapeHtml(s.value)}</p><p class="ms-stat-label">${escapeHtml(s.label)}</p></div>`,

      )

      .join('')

    const toc = (study.chapters || [])

      .map((ch) => `<li><span class="ms-toc-n">${escapeHtml(ch.n)}</span>${escapeHtml(ch.title)}</li>`)

      .join('')

    const family = (study.family || [])

      .slice(0, 6)

      .map(

        (m) => `<div class="ms-card"><p class="ms-card-title">${escapeHtml(m.name)}</p><p class="ms-card-body">${escapeHtml(m.role)}</p><p class="ms-card-meta">${escapeHtml(m.cost)}</p></div>`,

      )

      .join('')

    const timeline = (study.timeline || [])

      .map(

        (ev) => `<li><p class="ms-time-when">${escapeHtml(ev.when)}</p><p class="ms-time-title">${escapeHtml(ev.title)}</p><p>${escapeHtml(ev.body)}</p></li>`,

      )

      .join('')

    const labs = (study.classroom || [])

      .map((lab) => `<div class="ms-card"><p class="ms-card-meta">${escapeHtml(lab.title)}</p><p class="ms-card-body">${escapeHtml(lab.body)}</p></div>`)

      .join('')

    const faq = (study.faq || [])

      .map((item) => `<div class="ms-faq"><p class="ms-faq-q">${escapeHtml(item.q)}</p><p>${escapeHtml(item.a)}</p></div>`)

      .join('')

    const gloss = (study.glossary || [])

      .map((g) => `<tr><th>${escapeHtml(g.term)}</th><td>${escapeHtml(g.def)}</td></tr>`)

      .join('')

    const gallery = (study.gallery || [])

      .map(

        (g) => `<figure class="ms-figure"><img src="../../resources/studies/${escapeHtml(g.file)}" alt="${escapeHtml(g.caption)}" /><figcaption>${escapeHtml(g.caption)}<span>${escapeHtml(g.credit)}</span></figcaption></figure>`,

      )

      .join('')

    const reviews = (study.reviews || [])

      .map((r) => `<blockquote class="ms-quote"><p>“${escapeHtml(r.quote)}”</p><cite>${escapeHtml(r.source)}</cite></blockquote>`)

      .join('')

    const sources = (study.sources || [])

      .map((s) => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noreferrer">${escapeHtml(s.label)}</a> <span class="ms-url">${escapeHtml(s.url)}</span></li>`)

      .join('')

    const chaptersA = (study.chapters || []).slice(0, 5).map(chapterHtml).join('')

    const chaptersB = (study.chapters || []).slice(5).map(chapterHtml).join('')

    const workRows = (study.workloads || []).map((r) => [r.task, r.fit, String(r.score), r.note])

    return `<article class="ms-doc" id="model-brief-print">

      <header class="ms-cover">

        <div class="ms-cover-top">

          <img class="ms-lockup invert" src="${LOCKUP}" alt="Soumtok" />

          <p class="ms-powered">Powered by Soumtok</p>

        </div>

        <div class="ms-cover-center">

          <div class="ms-provider-mark"><img src="${escapeHtml(PROVIDER_LOGO[study.provider] || PROVIDER_LOGO.deepseek)}" alt="${escapeHtml(study.providerLabel)}" /></div>

          <p class="ms-cover-provider">${escapeHtml(study.providerLabel)}</p>

          <h1>${escapeHtml(study.name)}</h1>

          <p class="ms-cover-line">${escapeHtml(study.coverLine)}</p>

          ${study.pricing?.vendor ? `<p class="ms-cover-price">${escapeHtml(`${study.pricing.headline} / 1M tokens`)}</p>` : ''}

          <p class="ms-cover-gen">${escapeHtml(study.generation)} · ${escapeHtml(study.launched)}</p>

        </div>

        <div class="ms-cover-bottom">

          <span>soumtok.com</span>

          <span>${escapeHtml(study.id)}</span>

        </div>

      </header>

      <div class="ms-body">

        <p class="ms-hero">${escapeHtml(study.hero)}</p>

        <div class="ms-stats">${stats}</div>

        <div class="ms-split"><h2>Images — official plates and what it does</h2><span class="ms-eyebrow">Gallery</span></div>

        <div class="ms-gallery">${gallery}</div>

        <div class="ms-split"><h2>Official envelope</h2><span class="ms-eyebrow">Record</span></div>

        ${specTable(study.official)}

        <p class="ms-lead">${escapeHtml(study.benchmarkNote || '')}</p>

        <div class="ms-split"><h2>${escapeHtml(study.benchmarkTitle || 'Published scores')}</h2><span class="ms-eyebrow">Exams</span></div>

        ${tableHtml(study.benchmarkHeaders || [], study.benchmarkRows || [])}

        <div class="ms-split"><h2>What people wrote</h2><span class="ms-eyebrow">Reviews</span></div>

        ${reviews}

        <div class="ms-split"><h2>Read the primary pages</h2><span class="ms-eyebrow">Sources</span></div>

        <ul class="ms-sources">${sources}</ul>

        <div class="ms-toc"><p class="ms-eyebrow">Contents</p><ol>${toc}</ol></div>

        <div class="ms-split"><h2>Operating envelope</h2><span class="ms-eyebrow">Specs</span></div>

        ${specTable(study.specs)}

        <div class="ms-split"><h2>Working profile</h2><span class="ms-eyebrow">Charts</span></div>

        <p class="ms-lead">These bars are a builder’s grade for picking a classroom — not a vendor press chart.</p>

        <div class="ms-chart">${barsHtml(study.scores)}</div>

        ${chaptersA}

        <div class="ms-split"><h2>Family comparison</h2><span class="ms-eyebrow">Lineup</span></div>

        ${tableHtml(study.comparisonHeaders || [], study.comparisonRows || [])}

        <div class="ms-cards">${family}</div>

        <div class="ms-split"><h2>Workload classroom</h2><span class="ms-eyebrow">Syllabus</span></div>

        ${tableHtml(['Assignment', 'Fit', 'Grade', 'Notes'], workRows)}

        ${chaptersB}

        <div class="ms-split"><h2>How this line arrived</h2><span class="ms-eyebrow">Timeline</span></div>

        <ol class="ms-timeline">${timeline}</ol>

        <div class="ms-split"><h2>Hands-on labs</h2><span class="ms-eyebrow">Labs</span></div>

        <div class="ms-cards">${labs}</div>

        <div class="ms-split"><h2>Questions from the picker</h2><span class="ms-eyebrow">FAQ</span></div>

        ${faq}

        <div class="ms-split"><h2>Words this study uses</h2><span class="ms-eyebrow">Glossary</span></div>

        <div class="ms-table-wrap"><table class="ms-table ms-spec">${gloss}</table></div>

      </div>

      <footer class="ms-footer">

        <span><img src="${MARK}" alt="" /> Model Study · ${escapeHtml(study.name)}</span>

        <span>Powered by Soumtok · soumtok.com · ${escapeHtml(date)}</span>

      </footer>

    </article>`

  }



  let currentStudy = null



  function ensureShell() {

    let root = document.getElementById('model-brief-sheet')

    if (root) return root

    root = document.createElement('div')

    root.id = 'model-brief-sheet'

    root.hidden = true

    root.innerHTML = `<div class="model-brief-overlay" id="model-brief-overlay">

      <div class="model-brief-toolbar">

        <p class="model-brief-toolbar-title" id="model-brief-toolbar-title"></p>

        <div class="model-brief-toolbar-actions">

          <button type="button" class="model-brief-print-btn" id="model-brief-print-btn">Download PDF</button>

          <button type="button" class="model-brief-close-btn" id="model-brief-close-btn" aria-label="Close">Close</button>

        </div>

      </div>

      <div class="model-brief-scroll" id="model-brief-scroll"></div>

    </div>`

    document.body.appendChild(root)

    return root

  }



  function wireShell(root) {

    if (root.dataset.wired === '1') return

    root.dataset.wired = '1'



    root.querySelector('#model-brief-close-btn')?.addEventListener('click', (e) => {

      e.preventDefault()

      e.stopPropagation()

      close()

    })



    root.querySelector('#model-brief-overlay')?.addEventListener('click', (e) => {

      if (e.target?.id === 'model-brief-overlay') close()

    })



    root.querySelector('.model-brief-toolbar')?.addEventListener('click', (e) => {

      e.stopPropagation()

    })



    root.querySelector('#model-brief-print-btn')?.addEventListener('click', async (e) => {

      e.preventDefault()

      e.stopPropagation()

      const article = document.getElementById('model-brief-print')

      if (!article) return

      const title = currentStudy?.name ? `${currentStudy.name} — Soumtok Study` : 'Soumtok Study'

      const api = window.soumtok

      if (api?.studySavePdf) {

        const res = await api.studySavePdf({ title, html: article.outerHTML })

        if (res?.error) {

          window.alert?.(res.error)

          return

        }

        if (res?.path && api.showItemInFolder) api.showItemInFolder(res.path)

        return

      }

      window.print()

    })



    document.addEventListener('keydown', (e) => {

      const sheet = document.getElementById('model-brief-sheet')

      if (e.key === 'Escape' && sheet && !sheet.hidden) close()

    })

  }



  function open(modelId) {

    const model = findModel(modelId)

    if (!model) return

    const study = BRIEF().buildModelBrief?.(model) || BRIEF().buildModelStudy?.(model)

    if (!study) return

    currentStudy = study

    const root = ensureShell()

    wireShell(root)

    const title = root.querySelector('#model-brief-toolbar-title')

    if (title) title.textContent = `Model Study · ${study.name}`

    const scroll = root.querySelector('#model-brief-scroll')

    if (scroll) scroll.innerHTML = renderDoc(study)

    root.hidden = false

    root.removeAttribute('hidden')

    document.body.classList.add('model-brief-open')

  }



  function close() {

    const root = document.getElementById('model-brief-sheet')

    if (!root) return

    root.hidden = true

    root.setAttribute('hidden', '')

    currentStudy = null

    document.body.classList.remove('model-brief-open')

  }



  window.SoumtokModelBriefSheet = { open, close }

})()


