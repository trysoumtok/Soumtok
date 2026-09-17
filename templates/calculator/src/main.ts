import './style.css'
import { compute, formatDisplay, type Op } from './utils/calc'

const KEYS: { label: string; kind: 'digit' | 'op' | 'action'; value?: string }[] = [
  { label: 'C', kind: 'action', value: 'clear' },
  { label: '±', kind: 'action', value: 'sign' },
  { label: '%', kind: 'action', value: 'pct' },
  { label: '÷', kind: 'op', value: '÷' },
  { label: '7', kind: 'digit', value: '7' },
  { label: '8', kind: 'digit', value: '8' },
  { label: '9', kind: 'digit', value: '9' },
  { label: '×', kind: 'op', value: '×' },
  { label: '4', kind: 'digit', value: '4' },
  { label: '5', kind: 'digit', value: '5' },
  { label: '6', kind: 'digit', value: '6' },
  { label: '−', kind: 'op', value: '−' },
  { label: '1', kind: 'digit', value: '1' },
  { label: '2', kind: 'digit', value: '2' },
  { label: '3', kind: 'digit', value: '3' },
  { label: '+', kind: 'op', value: '+' },
  { label: '0', kind: 'digit', value: '0' },
  { label: '.', kind: 'digit', value: '.' },
  { label: '=', kind: 'action', value: 'eq' },
]

let display = '0'
let acc: number | null = null
let pending: Op | null = null
let fresh = true

const app = document.querySelector<HTMLDivElement>('#app')!

function render() {
  app.innerHTML = `
    <main class="calc">
      <h1 class="sr-only">{{title}}</h1>
      <div class="display" aria-live="polite">${display}</div>
      <div class="keypad">
        ${KEYS.map((k) => `<button type="button" class="key ${k.kind}" data-value="${k.value}">${k.label}</button>`).join('')}
      </div>
    </main>
  `
  app.querySelectorAll('.key').forEach((btn) => {
    btn.addEventListener('click', () => press(btn.getAttribute('data-value')!))
  })
}

function press(value: string) {
  if (value === 'clear') {
    display = '0'
    acc = null
    pending = null
    fresh = true
    render()
    return
  }
  if (value === 'sign') {
    if (display !== 'Error') display = String(-Number(display))
    render()
    return
  }
  if (value === 'pct') {
    if (display !== 'Error') display = String(Number(display) / 100)
    render()
    return
  }
  if (['+', '−', '×', '÷'].includes(value)) {
    const n = Number(display)
    if (acc !== null && pending && !fresh) {
      const r = compute(acc, n, pending)
      display = formatDisplay(r)
      acc = r === 'Error' ? null : r
    } else {
      acc = n
    }
    pending = value as Op
    fresh = true
    render()
    return
  }
  if (value === 'eq') {
    if (acc !== null && pending) {
      const r = compute(acc, Number(display), pending)
      display = formatDisplay(r)
      acc = null
      pending = null
      fresh = true
    }
    render()
    return
  }
  if (display === 'Error') display = '0'
  if (fresh) {
    display = value === '.' ? '0.' : value
    fresh = false
  } else if (value === '.' && display.includes('.')) {
    /* noop */
  } else {
    display = display === '0' && value !== '.' ? value : display + value
  }
  render()
}

window.addEventListener('keydown', (e) => {
  const map: Record<string, string> = {
    '0': '0', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
    '.': '.', '+': '+', '-': '−', '*': '×', '/': '÷', Enter: 'eq', Escape: 'clear', Backspace: 'clear',
  }
  const v = map[e.key]
  if (v) {
    e.preventDefault()
    press(v)
  }
})

render()
