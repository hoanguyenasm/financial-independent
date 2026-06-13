# Plan 9: Assets Wiring + Live Expense Categories Design

## Goal

Wire the Accounts screen's Holdings table and the Cashflow screen's expense breakdown from mock data to live backend data.

## Architecture

**Backend change (1 new endpoint):**
- `GET /analytics/expense-by-category?months=N` — returns expense totals grouped by category for the last N months, sorted by total descending.

**Frontend changes (3 files):**
- `api.ts` — add `AssetRead`, `getAssets()`, `CategoryExpense`, `getCategoryExpenses()`
- `accounts.jsx` — replace `DATA.ASSETS` with live `/assets` response; map backend field names to display shape
- `cashflow.jsx` — replace `DATA.EXPENSE_GROUPS` / `DATA.EXP_TOTAL` with live category totals aggregated into display groups

**Mock fallback:** All screens keep mock data as initial state; live data overwrites only on successful API response.

## Backend: expense-by-category endpoint

File: `backend/app/routers/analytics.py`

New route added to existing analytics router:
```
GET /analytics/expense-by-category?months=12
Response: [{category, total_base, txn_count}]  sorted by total_base desc
```

Logic:
- Filter transactions to last N months (reuse `_months_ago` helper) and `type IN ('expense', 'fee')`
- Sum `abs(amount_base ?? amount)` per category
- Return sorted list

## Frontend: api.ts additions

Append to `frontend/src/lib/api.ts`:

```ts
export interface AssetRead {
  id: number; account_id: number; symbol_or_name: string; asset_type: string
  quantity: number | null; avg_cost: number | null; current_value: number | null
  currency: string; expected_monthly_income: number | null; ownership_pct: number
}
export const getAssets = (accountId?: number) => {
  const q = accountId != null ? `?account_id=${accountId}` : ''
  return api<AssetRead[]>(`/assets${q}`)
}

export interface CategoryExpense { category: string; total_base: number; txn_count: number }
export const getCategoryExpenses = (months = 12) =>
  api<CategoryExpense[]>(`/analytics/expense-by-category?months=${months}`)
```

## Frontend: Accounts screen — assets wiring

File: `frontend/src/screens/accounts.jsx`

- Import `getAssets` from api.ts
- State: `const [liveAssets, setLiveAssets] = useState(DATA.ASSETS)`
- In existing useEffect: `getAssets().then(setLiveAssets).catch(() => {})`
- Derive display shape via inline map:
  - `symbol_or_name → name`
  - `asset_type` normalized: etf/stock/bond → 'stocks', real_estate → 'realestate'
  - `quantity → qty`, `current_value/quantity → price`, `avg_cost → avg`
  - `ownership_pct → ownership`, `expected_monthly_income → monthly_income`
- Replace all `DATA.ASSETS` in JSX with the mapped array

## Frontend: Cashflow screen — expense groups wiring

File: `frontend/src/screens/cashflow.jsx`

- Import `getCategoryExpenses` from api.ts
- State: `const [liveCatExp, setLiveCatExp] = useState(null)`
- In existing useEffect: `getCategoryExpenses(12).then(setLiveCatExp).catch(() => {})`
- `groups` useMemo: when `liveCatExp` is null use `DATA.EXPENSE_GROUPS`; otherwise aggregate categories into groups using `DATA.CATEGORIES[i].group` lookup, color from `GROUP_DEFS[group].color`, unknown → 'Other'
- `periodExp` useMemo: when `liveCatExp` is null use `DATA.EXP_TOTAL * scale`; otherwise `groups.reduce(sum of amount) * scale`
- Donut and table already consume `groups` and `periodExp` — no render changes needed

## Testing

One new backend test: `test_expense_by_category` — insert 2 expense transactions in different categories, call endpoint, verify both categories appear with correct totals.

## Out of scope

- DrillModal transaction list (stays on `DATA.TX` mock)
- Net-worth snapshot history
- FIRE scenario slider with live base_monthly_savings
