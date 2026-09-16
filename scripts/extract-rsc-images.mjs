import fs from 'node:fs'

for (const file of ['scripts/_probe-o3.html', 'scripts/_probe-gpt56.html', 'scripts/_probe-opus45.html']) {
  const html = fs.readFileSync(file, 'utf8')
  const hits = new Set()
  for (const re of [
    /https:\\\/\\\/cdn\.openai\.com[^"\\]+/g,
    /https:\/\/cdn\.openai\.com[^"\\]+/g,
    /images\/[^"\\]+\.(?:png|jpg|webp)/g,
    /(?:png|jpg|webp)-[a-f0-9-]+\.(?:png|jpg|webp)/gi,
  ]) {
    for (const m of html.matchAll(re)) {
      let v = m[0].replace(/\\+/g, '')
      if (v.startsWith('images/')) v = `https://www-cdn.anthropic.com/${v}`
      hits.add(v)
    }
  }
  console.log('\n===', file, '===')
  ;[...hits].filter((x) => /\.(png|jpg|webp)/i.test(x) || x.includes('cdn.openai')).slice(0, 30).forEach((x) => console.log(x))
}
