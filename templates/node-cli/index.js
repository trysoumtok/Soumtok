#!/usr/bin/env node
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({
  options: {
    help: { type: 'boolean', short: 'h' },
    upper: { type: 'boolean', short: 'u' },
  },
  allowPositionals: true,
})

if (values.help) {
  console.log(`Usage: node index.js [words...]\n  -u, --upper   uppercase output\n  -h, --help    show help`)
  process.exit(0)
}

let line = positionals.join(' ')
if (!line && !process.stdin.isTTY) {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  line = Buffer.concat(chunks).toString('utf8').trim()
}
line = line || 'hello'
if (values.upper) line = line.toUpperCase()
console.log(line)
