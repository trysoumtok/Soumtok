import { useEffect } from 'react'
import { SITE_URL, applySeo, seoForPath } from '../../shared/seo'
import { usePath } from '../lib/nav'

export function Seo() {
  const path = usePath()

  useEffect(() => {
    const host = window.location.hostname
    const origin = host === 'localhost' || host === '127.0.0.1' ? window.location.origin : SITE_URL
    applySeo(seoForPath(path), origin)
  }, [path])

  return null
}
