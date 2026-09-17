const esc = (n) => `\x1b[${n}m`
const wrap = (code, s) => `${esc(code)}${s}${esc(0)}`

export const c = {
  reset: (s) => wrap(0, s),
  bold: (s) => wrap(1, s),
  dim: (s) => wrap(2, s),
  orange: (s) => `\x1b[38;2;245;78;0m${s}\x1b[0m`,
  gray: (s) => wrap(90, s),
  green: (s) => wrap(32, s),
  cyan: (s) => wrap(36, s),
  yellow: (s) => wrap(33, s),
  red: (s) => wrap(31, s),
  blue: (s) => wrap(34, s),
}

export function brand(s) {
  return `\x1b[38;2;245;78;0m${s}\x1b[0m`
}

export function hr(width = 52) {
  return c.dim('─'.repeat(width))
}

export function box(title, bodyLines = []) {
  const w = 54
  const top = `┌ ${brand(title)} ${'─'.repeat(Math.max(0, w - title.length - 3))}┐`
  const bottom = `└${'─'.repeat(w + 1)}┘`
  const mid = bodyLines.map((line) => `│ ${line.padEnd(w)} │`)
  return [top, ...mid, bottom].join('\n')
}
