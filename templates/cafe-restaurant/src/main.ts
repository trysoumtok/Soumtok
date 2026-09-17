import './style.css'
import { mountHeader } from './sections/header'
import { mountHero } from './sections/hero'
import { mountMenu } from './sections/menu'
import { mountStory } from './sections/story'
import { mountVisit } from './sections/visit'
import { mountFooter } from './sections/footer'
import { wireScrollReveal } from './motion'
import { wireOrderBag } from './cart'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('#app missing')

app.innerHTML = `
  <a class="skip-link" href="#menu">Skip to menu</a>
  <div id="site-header"></div>
  <main id="main"></main>
  <div id="site-footer"></div>
  <div class="order-toast" id="orderToast" role="status" aria-live="polite"></div>
`

mountHeader(document.querySelector('#site-header')!)
const main = document.querySelector<HTMLElement>('#main')!
mountHero(main)
mountMenu(main)
mountStory(main)
mountVisit(main)
mountFooter(document.querySelector('#site-footer')!)

wireScrollReveal()
wireOrderBag()

const year = document.querySelector<HTMLElement>('#year')
if (year) year.textContent = String(new Date().getFullYear())
