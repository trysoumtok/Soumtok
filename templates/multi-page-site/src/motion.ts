/** Scroll reveal + page enter — respects prefers-reduced-motion */
export function initMotion(): void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.body.classList.add('page-enter')
  if (reduced) {
    document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-visible'))
    return
  }
  requestAnimationFrame(() => document.body.classList.add('page-enter-active'))

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
        }
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
  )
  document.querySelectorAll('[data-reveal]').forEach((el) => observer.observe(el))
}
