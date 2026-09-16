const headers = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
}

const urls = [
  'https://openai.com/index/openai-o3-mini/',
  'https://openai.com/index/introducing-o3-and-o4-mini/',
  'https://openai.com/index/gpt-5-6/',
  'https://developers.openai.com/api/docs/models/o3-mini',
  'https://developers.openai.com/api/docs/models/gpt-5-6',
  'https://docs.x.ai/docs/models/grok-4-6',
  'https://x.ai/news/grok-4',
]

for (const u of urls) {
  const res = await fetch(u, { headers })
  const html = await res.text()
  const og = [...html.matchAll(/property="og:image" content="([^"]+)"/g)].map((m) => m[1])
  const tw = [...html.matchAll(/name="twitter:image" content="([^"]+)"/g)].map((m) => m[1])
  console.log('\n', u, res.status)
  ;[...new Set([...og, ...tw])].forEach((x) => console.log(' ', x))
}
