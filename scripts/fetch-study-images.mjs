/**
 * Download real public study images (vendor / HF) into public + desktop studies folders.
 * Usage: node scripts/fetch-study-images.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const targets = [
  path.join(root, 'public', 'images', 'studies'),
  path.join(root, 'desktop', 'resources', 'studies'),
]

/** Real public images — vendor blogs, HF model cards, docs OG plates. */
const ASSETS = [
  {
    file: 'dsv41-agentic.png',
    url: 'https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/resolve/main/assets/dsv41_agentic_performance.png',
  },
  {
    file: 'dsv41-kvcache.png',
    url: 'https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/resolve/main/assets/dsv41_kv_cache.png',
  },
  {
    file: 'openai-o3-mini-hero.png',
    url: 'https://images.ctfassets.net/kftzwdyauwt9/BQXodBZ63FtQq6CGcPQQh/955ea49d3cf09e7ad33129d8a81b4087/o3-mini_1.1.png?w=1600&h=900&fit=fill',
  },
  {
    file: 'openai-o3-o4-hero.png',
    url: 'https://images.ctfassets.net/kftzwdyauwt9/4hwOw0gdB26Czan75DOKai/3d3978172f4104809aa522e7db87a0d9/o3_1__Animated_.png?w=1600&h=900&fit=fill',
  },
  {
    file: 'openai-o3-mini-docs.png',
    url: 'https://developers.openai.com/og/api/docs/models/o3-mini.png',
  },
  {
    file: 'openai-gpt56-hero.png',
    url: 'https://images.ctfassets.net/kftzwdyauwt9/3T0kxQLJk1VcXVxMwXF97J/4345df401f2b08ed6a1eef88c9588d2e/OAI_ChatGPTWork_ModelBlog_OpenGraph_16x9_1200x630.png?w=1600&h=900&fit=fill',
  },
  {
    file: 'anthropic-opus45-hero.jpg',
    url: 'https://www-cdn.anthropic.com/images/4zrzovbb/website/6d4a0d28992ade92d6fa63646fd9c9d318245c6c-2400x1260.jpg',
  },
  {
    file: 'anthropic-opus45-chart.png',
    url: 'https://www-cdn.anthropic.com/images/4zrzovbb/website/52303b11db76017fd0c2f73c7fafa5c752515979-2600x2236.png',
  },
  {
    file: 'anthropic-opus45-safety.png',
    url: 'https://www-cdn.anthropic.com/images/4zrzovbb/website/e42d6b0db866320caa34b57152fcc32dbbcdc4e0-3840x2160.png',
  },
  {
    file: 'xai-grok-hero.webp',
    url: 'https://media.x.ai/v1/website/grok-4-6bdb0520.webp',
  },
]

async function fetchOk(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
  })
  if (!res.ok) return null
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('image') && !ct.includes('octet-stream')) return null
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 2000) return null
  return buf
}

async function main() {
  for (const dir of targets) fs.mkdirSync(dir, { recursive: true })

  const removeFake = [
    'study-ced-arch.png',
    'study-claude-work.png',
    'study-flash-ui.png',
    'study-grok-work.png',
    'study-openai-work.png',
  ]
  for (const dir of targets) {
    for (const name of removeFake) {
      const p = path.join(dir, name)
      if (fs.existsSync(p)) {
        fs.unlinkSync(p)
        console.log('removed fake', name)
      }
    }
  }

  const ok = []
  const fail = []
  for (const asset of ASSETS) {
    const buf = await fetchOk(asset.url)
    if (!buf) {
      fail.push(asset)
      continue
    }
    for (const dir of targets) fs.writeFileSync(path.join(dir, asset.file), buf)
    ok.push(asset.file)
    console.log('saved', asset.file, buf.length, 'bytes')
  }

  console.log('\nOK:', ok.length, 'FAIL:', fail.length)
  if (fail.length) for (const f of fail) console.log('FAIL', f.file, f.url)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
