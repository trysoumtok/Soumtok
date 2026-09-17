export type Filter = 'all' | 'active' | 'done'

export type Todo = { id: string; text: string; done: boolean }

const KEY = 'soumtok-todos'

export function loadTodos(): Todo[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Todo[]) : []
  } catch {
    return []
  }
}

export function saveTodos(todos: Todo[]) {
  localStorage.setItem(KEY, JSON.stringify(todos))
}

export function filterTodos(todos: Todo[], filter: Filter): Todo[] {
  if (filter === 'active') return todos.filter((t) => !t.done)
  if (filter === 'done') return todos.filter((t) => t.done)
  return todos
}
