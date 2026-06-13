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

export interface ImportLogRead {
  id: number
  account_id: number
  filename: string
  source_type: string
  status: string
  rows_imported: number
  rows_skipped: number
  rows_uncategorized: number
  imported_at: string
}

export async function importFile(
  file: File,
  accountId: number,
  userId: number,
): Promise<ImportLogRead> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('account_id', String(accountId))
  fd.append('user_id', String(userId))
  const res = await fetch(`${BASE}/import`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

export const getImportLogs = (accountId?: number) => {
  const q = accountId != null ? `?account_id=${accountId}` : ''
  return api<ImportLogRead[]>(`/import/logs${q}`)
}

export interface AnalyticsSummary {
  net_worth: number
  passive_income_monthly: number
  monthly_expenses: number
  savings_rate: number          // fraction 0–1
  needs_review: number
}

export interface CashflowMonth {
  month: string   // "YYYY-MM"
  income: number
  expense: number
  net: number
}

export const getAnalyticsSummary = () =>
  api<AnalyticsSummary>('/analytics/summary')

export const getCashflowMonthly = (months = 12) =>
  api<CashflowMonth[]>(`/analytics/cashflow-monthly?months=${months}`)
