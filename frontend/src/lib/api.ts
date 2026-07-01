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

export interface CategoryRuleRead {
  id: number
  pattern: string
  category: string
  account_id: number | null
  created_at: string
  match_count: number | null
}

export const getCategoryRules = () =>
  api<CategoryRuleRead[]>('/category-rules')

export const createCategoryRule = (pattern: string, category: string) =>
  api('/category-rules', { method: 'POST', body: JSON.stringify({ pattern, category }) })

export const updateCategoryRule = (id: number, body: { pattern?: string; category?: string }) =>
  api<CategoryRuleRead>(`/category-rules/${id}`, { method: 'PATCH', body: JSON.stringify(body) })

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
  autoDetect = false,
): Promise<ImportLogRead> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('account_id', String(accountId))
  fd.append('user_id', String(userId))
  fd.append('auto_detect', String(autoDetect))
  const res = await fetch(`${BASE}/import`, { method: 'POST', body: fd })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `${res.status} ${res.statusText}`)
  }
  return res.json()
}

export interface PathImportResult {
  files_processed: number
  rows_imported: number
  rows_skipped: number
  rows_uncategorized: number
  errors: string[]
}

export async function importFromPath(
  path: string,
  accountId: number,
  userId: number,
): Promise<PathImportResult> {
  const fd = new FormData()
  fd.append('path', path)
  fd.append('account_id', String(accountId))
  fd.append('user_id', String(userId))
  const res = await fetch(`${BASE}/import/from-path`, { method: 'POST', body: fd })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `${res.status} ${res.statusText}`)
  }
  return res.json()
}

export interface TreeImportFile {
  file: string
  bank: string | null
  owner: string | null
  account_id?: number
  status: string
  imported?: number
  skipped?: number
  uncategorized?: number
  balance?: number | null
}

export interface TreeImportResult {
  files_processed: number
  rows_imported: number
  rows_skipped: number
  rows_uncategorized: number
  files: TreeImportFile[]
  errors: string[]
}

// Auto-detecting path import: routes each file to the account matching its
// bank + owner, instead of forcing everything into one account.
export async function importFromTree(
  path: string,
  userId: number,
): Promise<TreeImportResult> {
  const fd = new FormData()
  fd.append('path', path)
  fd.append('user_id', String(userId))
  const res = await fetch(`${BASE}/import/from-tree`, { method: 'POST', body: fd })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `${res.status} ${res.statusText}`)
  }
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
  base_monthly_savings: number
  cash: number
  invested: number
  re_equity: number
  savings_series: number[]      // 12 monthly rates in percent, oldest first
  savings_rate_avg: number      // percent, avg over months with income
  rental_monthly_avg: number
  rental_series: number[]       // 12 monthly rental+airbnb sums, oldest first
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

export const getTransactions = (
  limit = 500,
  category?: string,
  period?: { month?: string; months?: number },
) => {
  const q = new URLSearchParams({ limit: String(limit) })
  if (category) q.set('category', category)
  if (period?.month) q.set('month', period.month)
  else if (period?.months) q.set('months', String(period.months))
  return api<TransactionRead[]>(`/transactions?${q}`)
}

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

export interface AssetWrite {
  account_id: number
  symbol_or_name: string
  asset_type: string
  current_value: number
  ownership_pct: number
  currency: string
  expected_monthly_income?: number | null
  quantity?: number
}

export const createAsset = (payload: AssetWrite) =>
  api<AssetRead>('/assets', { method: 'POST', body: JSON.stringify(payload) })

export const updateAsset = (id: number, payload: Partial<AssetWrite>) =>
  api<AssetRead>(`/assets/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })

export const deleteAsset = (id: number) =>
  api<void>(`/assets/${id}`, { method: 'DELETE' })

export interface CategoryExpense {
  category: string
  total_base: number
  txn_count: number
}

type CategoryOpts = number | { months?: number; month?: string }

const categoryParams = (opts: CategoryOpts): Record<string, string> =>
  typeof opts === 'number' ? { months: String(opts) }
  : opts.month ? { month: opts.month }
  : { months: String(opts.months ?? 12) }

export const getCategoryExpenses = (opts: CategoryOpts = 12) =>
  api<CategoryExpense[]>(`/analytics/expense-by-category?${new URLSearchParams(categoryParams(opts))}`)

export const getCategoryIncome = (opts: CategoryOpts = 12) =>
  api<CategoryExpense[]>(`/analytics/income-by-category?${new URLSearchParams(categoryParams(opts))}`)

export const getCategoryInvestments = (opts: CategoryOpts = 12) =>
  api<CategoryExpense[]>(`/analytics/investment-by-category?${new URLSearchParams(categoryParams(opts))}`)

export interface NWSnapshotRead {
  id: number
  date: string   // "YYYY-MM-DD"
  net_worth: number
}

export const captureNWSnapshot = () =>
  api<NWSnapshotRead>('/nw-snapshots', { method: 'POST' })

export const getNWSnapshots = (limit = 24) =>
  api<NWSnapshotRead[]>(`/nw-snapshots?limit=${limit}`)

export const clearAllTransactions = () =>
  api<void>('/transactions', { method: 'DELETE' })

export const deleteImportLog = (id: number) =>
  api<void>(`/import/logs/${id}`, { method: 'DELETE' })

export const reassignImportLog = (id: number, accountId: number) =>
  api<ImportLogRead>(`/import/logs/${id}/account`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: accountId }),
  })

export const clearAllImportLogs = () =>
  api<void>('/import/logs', { method: 'DELETE' })

export const recategorizeAll = () =>
  api<{ updated: number }>('/import/recategorize', { method: 'POST' })
