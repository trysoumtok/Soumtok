/** Lightweight order bag — local count + toast, no fake checkout. */

let count = 0
let toastTimer: number | undefined

function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null
}

export function showOrderToast(message: string): void {
  const toast = byId<HTMLDivElement>('orderToast')
  if (!toast) return
  toast.textContent = message
  toast.classList.add('is-visible')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2200)
}

function bumpBag(): void {
  const bag = byId<HTMLButtonElement>('orderBag')
  bag?.classList.add('is-bump')
  window.setTimeout(() => bag?.classList.remove('is-bump'), 380)
}

export function addToOrder(name: string): void {
  count += 1
  const el = byId<HTMLSpanElement>('orderCount')
  if (el) el.textContent = String(count)
  bumpBag()
  showOrderToast(`${name} added`)
}

export function wireOrderBag(): void {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    const add = target.closest<HTMLButtonElement>('[data-add]')
    if (add) {
      addToOrder(add.dataset.add || 'Item')
      return
    }
    if (target.closest('#orderBag')) {
      showOrderToast(
        count === 0 ? 'Your bag is empty — pick something from the menu.' : `${count} item${count === 1 ? '' : 's'} ready to order`,
      )
    }
  })
}
