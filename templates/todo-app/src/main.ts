import './style.css'
import { filterTodos, loadTodos, saveTodos, type Filter, type Todo } from './todo'

let todos = loadTodos()
let filter: Filter = 'all'

const app = document.querySelector<HTMLDivElement>('#app')!

function render() {
  const visible = filterTodos(todos, filter)
  const active = todos.filter((t) => !t.done).length
  app.innerHTML = `
    <main class="todo-app">
      <h1>{{title}}</h1>
      <form class="todo-form" id="add-form">
        <input id="new-todo" type="text" placeholder="What needs doing?" autocomplete="off" aria-label="New task" />
        <button type="submit" class="btn">Add</button>
      </form>
      <ul class="todo-list" aria-live="polite">
        ${
          visible.length
            ? visible
                .map(
                  (t) => `
            <li class="todo-item${t.done ? ' done' : ''}" data-id="${t.id}">
              <label><input type="checkbox" ${t.done ? 'checked' : ''} /> ${escapeHtml(t.text)}</label>
              <button type="button" class="delete" aria-label="Delete">×</button>
            </li>`,
                )
                .join('')
            : '<li class="empty">No tasks yet — add one above.</li>'
        }
      </ul>
      <div class="todo-footer">
        <span>${active} active</span>
        <div class="filters" role="tablist">
          ${(['all', 'active', 'done'] as Filter[])
            .map((f) => `<button type="button" class="filter${filter === f ? ' on' : ''}" data-filter="${f}">${f}</button>`)
            .join('')}
        </div>
        <button type="button" class="clear" ${todos.some((t) => t.done) ? '' : 'disabled'}>Clear done</button>
      </div>
    </main>
  `
  wire()
}

function wire() {
  app.querySelector('#add-form')?.addEventListener('submit', (e) => {
    e.preventDefault()
    const input = app.querySelector<HTMLInputElement>('#new-todo')
    const text = input?.value.trim()
    if (!text) return
    todos = [...todos, { id: crypto.randomUUID(), text, done: false }]
    saveTodos(todos)
    if (input) input.value = ''
    render()
  })
  app.querySelectorAll('.todo-item').forEach((li) => {
    const id = li.getAttribute('data-id')!
    li.querySelector('input')?.addEventListener('change', () => {
      todos = todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
      saveTodos(todos)
      render()
    })
    li.querySelector('.delete')?.addEventListener('click', () => {
      todos = todos.filter((t) => t.id !== id)
      saveTodos(todos)
      render()
    })
  })
  app.querySelectorAll('.filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      filter = btn.getAttribute('data-filter') as Filter
      render()
    })
  })
  app.querySelector('.clear')?.addEventListener('click', () => {
    todos = todos.filter((t) => !t.done)
    saveTodos(todos)
    render()
  })
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

render()
