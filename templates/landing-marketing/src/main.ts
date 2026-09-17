import './style.css'
import { mountHeader } from './sections/header'
import { mountHero } from './sections/hero'
import { mountFeatures } from './sections/features'
import { mountCta } from './sections/cta'
import { mountFooter } from './sections/footer'
import { wireScrollReveal } from './motion'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('#app missing')

app.innerHTML = `
  <a class="skip-link" href="#main">Skip to content</a>
  <div id="site-header"></div>
  <main id="main"></main>
  <div id="site-footer"></div>
`

mountHeader(document.querySelector('#site-header')!)
const main = document.querySelector<HTMLElement>('#main')!
mountHero(main)
mountFeatures(main)
mountCta(main)
mountFooter(document.querySelector('#site-footer')!)
wireScrollReveal()
