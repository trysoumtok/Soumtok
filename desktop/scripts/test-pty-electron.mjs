import { createRequire } from 'module'
const require = createRequire(import.meta.url)
try {
  const pty = require('@homebridge/node-pty-prebuilt-multiarch')
  const t = pty.spawn('cmd.exe', ['/d', '/q', '/k'], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    useConpty: true,
  })
  let out = ''
  t.onData((d) => {
    out += d
  })
  setTimeout(() => {
    t.write('echo SOUMTOK_PTY_OK\r\n')
  }, 400)
  setTimeout(() => {
    console.log(out.includes('SOUMTOK_PTY_OK') ? 'PTY_OK' : 'PTY_NO_ECHO')
    console.log('snippet:', out.slice(-200).replace(/\r/g, '\\r').replace(/\n/g, '\\n'))
    t.kill()
    process.exit(out.includes('SOUMTOK_PTY_OK') ? 0 : 1)
  }, 2000)
} catch (e) {
  console.error('PTY_FAIL', e.message)
  process.exit(2)
}
