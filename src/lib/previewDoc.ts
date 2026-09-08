import { fileLookup, inlineAssets } from '../../shared/preview.ts'

const FRAME_SCROLL = `<style id="soumtok-scroll">html{height:100%;overflow-x:hidden;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.28) transparent}body{margin:0;min-height:100%;overflow:visible}html::-webkit-scrollbar{width:8px}html::-webkit-scrollbar-track,html::-webkit-scrollbar-button,html::-webkit-scrollbar-corner{display:none;width:0;height:0;background:transparent}html::-webkit-scrollbar-thumb{background:rgba(0,0,0,.28);border-radius:999px}</style>`

export { fileLookup, inlineAssets }

export function previewDocument(html: string) {
  if (!html.trim()) return html
  if (html.includes('id="soumtok-scroll"')) return html
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${FRAME_SCROLL}</head>`)
  return `<!doctype html><html><head>${FRAME_SCROLL}</head><body>${html}</body></html>`
}

export function stubPage(label: string, files: Record<string, string>) {
  const css =
    files['styles/main.css'] ||
    files['src/index.css'] ||
    files['index.css'] ||
    files['styles.css'] ||
    ''
  const title = label.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${css}body{font-family:Georgia,serif;margin:0;background:#f6f1e8;color:#2a1910}main{max-width:720px;margin:0 auto;padding:72px 24px}a{color:#4a2e1d}</style></head><body><main><p><a href="index.html">← Home</a></p><h1>${title}</h1><p>This page is part of the preview. Use the header to move around the site.</p></main></body></html>`
}

export function pageDocument(html: string, files: Record<string, string>, route: string) {
  const home = files['index.html'] || files['public/index.html'] || html || ''
  if (!home) return ''
  if (route === 'index.html' || route === '/' || route === '') {
    return previewDocument(inlineAssets(home, files))
  }
  const page = fileLookup(files, route)
  if (page) return previewDocument(inlineAssets(page, files))
  const hash = route.replace(/\.html$/i, '').replace(/^\//, '')
  return previewDocument(inlineAssets(stubPage(hash || 'Page', files), files))
}
