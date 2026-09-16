/** Smoke test: study PDF renders multi-page content without clipping. */
import electron from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = electron.app
const { BrowserWindow } = electron

function rewriteStudyAssetUrls(html) {
  const resourcesRoot = path.join(__dirname, '../resources')
  const base = `${pathToFileURL(resourcesRoot).href}/`
  return String(html || '').replace(/\.\.\/\.\.\/resources\//g, base)
}

function countPdfPages(buf) {
  const text = buf.toString('latin1')
  const matches = text.match(/\/Type\s*\/Page\b/g)
  return matches ? matches.length : 0
}

const longBody = Array.from({ length: 14 }, (_, i) => (
  `<section class="ms-chapter">
    <p class="ms-ch-kicker">0${(i % 9) + 1} · Chapter</p>
    <h2>Section ${i + 1} — model deep dive</h2>
    <p>This paragraph tests pagination across A4 pages. Models like GPT-6 Astra ship with large context windows, published benchmark tables, gallery images, and long-form study chapters that must flow naturally from page to page without being clipped or cut off mid-sentence.</p>
    <p>Output-heavy coding turns, reasoning traces, and multi-file refactors all belong in a readable PDF export. Each section should break cleanly while keeping headings attached to their first paragraph.</p>
    <ul class="ms-list"><li>First bullet for section ${i + 1}</li><li>Second bullet with enough text to wrap across the printable width on A4 paper.</li></ul>
  </section>`
)).join('')

const sampleHtml = rewriteStudyAssetUrls(`<article class="ms-doc">
  <header class="ms-cover">
    <div class="ms-cover-top">
      <span class="ms-lockup">Soumtok</span>
      <p class="ms-powered">Powered by Soumtok</p>
    </div>
    <div class="ms-cover-center">
      <div class="ms-provider-mark">OpenAI</div>
      <p class="ms-cover-provider">OpenAI</p>
      <h1>GPT-6 Astra</h1>
      <p class="ms-cover-line">Strongest GPT general repo work</p>
      <p class="ms-cover-price">$10.00 in · $50.00 out / 1M tokens</p>
    </div>
    <div class="ms-cover-bottom"><span>soumtok.com</span><span>gpt-6-astra</span></div>
  </header>
  <div class="ms-body">
    <p class="ms-hero">GPT-6 Astra is an OpenAI model. Strongest GPT General repo work. Context 1.1M tokens, max output 128K tokens.</p>
    <div class="ms-stats">
      <div class="ms-stat"><p class="ms-stat-hint">Window</p><p class="ms-stat-value">1.1M</p><p class="ms-stat-label">Context</p></div>
      <div class="ms-stat"><p class="ms-stat-hint">Output</p><p class="ms-stat-value">128K</p><p class="ms-stat-label">Max completion</p></div>
      <div class="ms-stat"><p class="ms-stat-hint">Vendor</p><p class="ms-stat-value">$10 / $50</p><p class="ms-stat-label">List price</p></div>
      <div class="ms-stat"><p class="ms-stat-hint">Gen</p><p class="ms-stat-value">GPT-6</p><p class="ms-stat-label">Generation</p></div>
    </div>
    <div class="ms-split"><h2>Published scores</h2><span class="ms-eyebrow">Exams</span></div>
    <div class="ms-table-wrap"><table class="ms-table"><thead><tr><th>Exam</th><th>Score</th></tr></thead><tbody>${Array.from({ length: 12 }, (_, i) => `<tr><td class="strong">Benchmark ${i + 1}</td><td>${90 - i}%</td></tr>`).join('')}</tbody></table></div>
    ${longBody}
  </div>
  <footer class="ms-footer"><span>Soumtok Model Study · GPT-6 Astra</span><span>Powered by Soumtok</span></footer>
</article>`)

async function renderPdf(tmpHtml) {
  const printWin = new BrowserWindow({
    show: false,
    width: 794,
    height: 1123,
    webPreferences: { sandbox: true },
  })
  await printWin.loadFile(tmpHtml)
  const pdf = await printWin.webContents.printToPDF({
    printBackground: true,
    preferCSSPageSize: true,
    pageSize: 'A4',
  })
  printWin.destroy()
  return pdf
}

app.whenReady().then(async () => {
  const cssPath = path.join(__dirname, '../src/renderer/study-print.css')
  const css = fs.readFileSync(cssPath, 'utf8')
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-study-test-'))
  const tmpHtml = path.join(tmpDir, 'study.html')
  const outPdf = path.join(tmpDir, 'study.pdf')
  fs.writeFileSync(
    tmpHtml,
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${sampleHtml}</body></html>`,
    'utf8',
  )

  const pdf = await renderPdf(tmpHtml)
  fs.writeFileSync(outPdf, pdf)
  const pages = countPdfPages(pdf)
  if (pdf.length < 8000) {
    console.error('FAIL: PDF too small (%d bytes) — likely blank', pdf.length)
    process.exitCode = 1
  } else if (pages < 4) {
    console.error('FAIL: expected multi-page PDF, got %d pages (%d bytes)', pages, pdf.length)
    process.exitCode = 1
  } else {
    console.log('OK: study PDF %d pages, %d bytes -> %s', pages, pdf.length, outPdf)
  }
  app.quit()
})
