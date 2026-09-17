import './style.css'

const app = document.querySelector<HTMLDivElement>('#app')
if (app) {
  app.innerHTML = `
    <main class="shell">
      <h1>{{title}}</h1>
      <p>Proven Vite + TypeScript starter. Open <a href="http://localhost:5173">localhost:5173</a>.</p>
    </main>
  `
}
