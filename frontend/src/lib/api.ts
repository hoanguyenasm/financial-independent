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
  fi_target: number
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

export interface AccountRead {
  id: number
  name: string
  type: string
  currency: string
  institution: string | null
  is_active: boolean
}

export const getAccounts = (activeOnly = false) =>
  api<AccountRead[]>(`/accounts${activeOnly ? '?active_only=true' : ''}`)

export interface AccountCreate {
  name: string
  type: string
  currency: string
  institution?: string
}

export const createAccount = (body: AccountCreate) =>
  api<AccountRead>('/accounts', { method: 'POST', body: JSON.stringify(body) })

export interface TransactionRead {
  id: number
  account_id: number
  user_id: number
  date: string          // "YYYY-MM-DD"
  amount: number
  currency: string
  amount_base: number | null
  description: string
  category: string
  type: string
  needs_review: boolean
}

export const getTransactions = (limit = 500) =>
  api<TransactionRead[]>(`/transactions?limit=${limit}`)

export interface FIGoalRead {
  id: number
  user_id: number
  target_net_worth: number | null
  target_date: string | null
  safe_withdrawal_rate: number
  investment_return_rate: number
  inflation_rate: number
}

export interface FIGoalUpsert {
  target_net_worth: number
  target_date?: string
  safe_withdrawal_rate: number
  investment_return_rate: number
  inflation_rate: number
}

export const getFIGoal = (userId: number) =>
  api<FIGoalRead>(`/fi-goals/user/${userId}`)

export const upsertFIGoal = async (userId: number, body: FIGoalUpsert): Promise<FIGoalRead> => {
  try {
    const existing = await getFIGoal(userId)
    return api<FIGoalRead>(`/fi-goals/${existing.id}`, { method: 'PATCH', body: JSON.stringify(body) })
  } catch {
    return api<FIGoalRead>('/fi-goals', { method: 'POST', body: JSON.stringify({ user_id: userId, ...body }) })
  }
}

export interface AssetRead {
  id: number
  account_id: number
  symbol_or_name: string
  asset_type: string
  quantity: number | null
  avg_cost: number | null
  current_value: number | null
  currency: string
  expected_monthly_income: number | null
  ownership_pct: number
}

export const getAssets = (accountId?: number) => {
  const q = accountId != null ? `?account_id=${accountId}` : ''
  return api<AssetRead[]>(`/assets${q}`)
}

export interface CategoryExpense {
  category: string
  total_base: number
  txn_count: number
}

export const getCategoryExpenses = (months = 12) =>
  api<CategoryExpense[]>(`/analytics/expense-by-category?months=${months}`)
