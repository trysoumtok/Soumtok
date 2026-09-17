#!/usr/bin/env node
/** Verify /install/* URLs return scripts, not SPA HTML. */
const base = process.argv[2] || 'http://127.0.0.1:8787'
const paths = ['/install/cli.ps1', '/install/cli.sh', '/install/cli-macos.sh', '/install/cli-linux.sh']
let failed = 0

for (const p of paths) {
  const url = `${base.replace(/\/$/, '')}${p}`
  try {
    const res = await fetch(url, { redirect: 'follow' })
    const text = await res.text()
    const ct = res.headers.get('content-type') || ''
    if (!res.ok) {
      console.error('FAIL', p, res.status)
      failed++
      continue
    }
    if (text.trimStart().startsWith('<!doctype html') || text.includes('@context":"https://schema.org"')) {
      console.error('FAIL', p, 'returned HTML instead of script')
      failed++
      continue
    }
    if (p.endsWith('.ps1') && !text.includes('Soumtok CLI')) {
      console.error('FAIL', p, 'missing expected PowerShell content')
      failed++
      continue
    }
    if (p.endsWith('.sh') && !text.includes('#!/usr/bin/env bash')) {
      console.error('FAIL', p, 'missing bash shebang')
      failed++
      continue
    }
    console.log('OK ', p, ct.split(';')[0])
  } catch (err) {
    console.error('FAIL', p, err.message)
    failed++
  }
}

if (failed) process.exit(1)
console.log('\nAll install URLs OK.')
