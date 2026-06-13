/* Thin client for the FastAPI backend. Every call may fail when the
   backend is offline — callers catch and keep working on mock data. */
const BASE = 'http://localhost:8000'

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.status === 204 ? (undefined as T) : res.json()
}

export const getSettings = () => api<{ base_currency: string }>('/settings')

export const updateSettings = (base_currency: string) =>
  api<{ base_currency: string }>('/settings', {
    method: 'PATCH',
    body: JSON.stringify({ base_currency }),
  })

export const patchTransaction = (id: number, body: Record<string, unknown>) =>
  api(`/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(body) })

export const createCategoryRule = (pattern: string, category: string) =>
  api('/category-rules', { method: 'POST', body: JSON.stringify({ pattern, category }) })

export const deleteCategoryRule = (id: number) =>
  api(`/category-rules/${id}`, { method: 'DELETE' })
