export function notifyAvatar() {
  window.dispatchEvent(new CustomEvent('soumtok-avatar', { detail: Date.now() }))
}

export function avatarUrl(bust = 0) {
  return `/api/me/photo/avatar?v=${bust}`
}
