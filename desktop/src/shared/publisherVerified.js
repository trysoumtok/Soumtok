/** VS Marketplace publisher verification — same rules as VS Code gallery. */
;(function (root, factory) {
  const fn = factory()
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { publisherVerified: fn }
  } else {
    root.publisherVerifiedFromGallery = fn
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function publisherVerifiedFactory() {
  return function publisherVerified(pub) {
    if (!pub) return false
    if (pub.isDomainVerified) return true
    const flags = pub.flags
    if (flags === 'verified') return true
    if (typeof flags === 'string' && /verified/i.test(flags)) return true
    if (Array.isArray(flags) && flags.some((f) => String(f).toLowerCase() === 'verified')) return true
    return false
  }
})
