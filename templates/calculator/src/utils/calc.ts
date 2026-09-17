export type Op = '+' | '−' | '×' | '÷'

export function compute(a: number, b: number, op: Op): number | 'Error' {
  if (op === '÷' && b === 0) return 'Error'
  switch (op) {
    case '+':
      return a + b
    case '−':
      return a - b
    case '×':
      return a * b
    case '÷':
      return a / b
    default:
      return b
  }
}

export function formatDisplay(n: number | 'Error'): string {
  if (n === 'Error') return 'Error'
  const s = String(n)
  return s.length > 12 ? n.toExponential(6) : s
}
