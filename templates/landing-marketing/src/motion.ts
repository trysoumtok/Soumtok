export function wireScrollReveal(): void {
  const nodes = document.querySelectorAll<HTMLElement>('[data-reveal]')
  if (!nodes.length) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    nodes.forEach((n) => n.classList.add('is-visible'))
    return
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-visible')
        io.unobserve(entry.target)
      })
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
  )
  nodes.forEach((node, i) => {
    node.style.setProperty('--reveal-delay', `${Math.min(i * 45, 240)}ms`)
    io.observe(node)
  })
}
