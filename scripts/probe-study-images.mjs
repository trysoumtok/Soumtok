import fs from 'node:fs'

const headers = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
}

const urls = [
  ['o3', 'https://openai.com/index/introducing-o3-and-o4-mini/'],
  ['gpt56', 'https://openai.com/index/gpt-5-6/'],
  ['opus45', 'https://www.anthropic.com/news/claude-opus-4-5'],
]

for (const [name, u] of urls) {
  const res = await fetch(u, { headers })
  const html = await res.text()
  fs.writeFileSync(`scripts/_probe-${name}.html`, html)
  const hits = []
  for (const re of [
    /https:\/\/cdn\.openai\.com[^"'\\]+/g,
    /https:\/\/www-cdn\.anthropic\.com[^"'\\]+/g,
    /images\/[^"'\\]+\.(png|webp|jpg)/g,
    /"path":"images\/[^"]+"/g,
  ]) {
    for (const m of html.matchAll(re)) hits.push(m[0])
  }
  console.log('\n===', name, res.status, '===')
  ;[...new Set(hits)].slice(0, 25).forEach((x) => console.log(x))
}
