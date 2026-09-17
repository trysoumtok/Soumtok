import { mountSidebar } from '../components/Sidebar'
import { mountStatCards } from '../components/StatCards'
import { mountDataTable } from '../components/DataTable'

export function mountDashboard(host: HTMLElement) {
  host.innerHTML = `
    <div class="dashboard">
      <aside id="sidebar"></aside>
      <div class="main">
        <header class="topbar"><h1>{{title}}</h1><button type="button" class="menu-btn" aria-label="Toggle menu">☰</button></header>
        <div id="stats"></div>
        <div id="table"></div>
      </div>
    </div>
  `
  mountSidebar(host.querySelector('#sidebar')!)
  mountStatCards(host.querySelector('#stats')!)
  mountDataTable(host.querySelector('#table')!)
  host.querySelector('.menu-btn')?.addEventListener('click', () => {
    host.querySelector('.dashboard')?.classList.toggle('sidebar-open')
  })
}
