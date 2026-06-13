# Plan 9: Assets Wiring + Live Expense Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Accounts screen Holdings table to live `/assets` endpoint and Cashflow screen expense breakdown to a new `/analytics/expense-by-category` endpoint.

**Architecture:** New backend analytics endpoint groups expense transactions by category. Frontend builds group-level structure from category-level data using `DATA.CATEGORIES[i].group` as the key. Mock data is the initial state; live data overwrites on success.

**Tech Stack:** FastAPI + SQLAlchemy (backend), React + Vite + TypeScript (frontend), SQLite (DB)

---

### Task 1: Backend — expense-by-category endpoint

**Files:**
- Modify: `backend/app/routers/analytics.py`
- Modify: `backend/tests/test_analytics.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_analytics.py`:

```python
def test_expense_by_category(client):
    user_id, account_id = _setup(client)
    m = date.today().strftime("%Y-%m")
    _tx(client, user_id, account_id, f"{m}-01", -1200.0, "expense", "mortgage")
    _tx(client, user_id, account_id, f"{m}-02", -300.0, "expense", "supermarket")
    _tx(client, user_id, account_id, f"{m}-03", -300.0, "expense", "supermarket")
    _tx(client, user_id, account_id, f"{m}-04", 5000.0, "income", "salary")  # excluded

    response = client.get("/analytics/expense-by-category?months=12")
    assert response.status_code == 200
    rows = response.json()
    cats = {r["category"]: r for r in rows}
    assert "mortgage" in cats
    assert cats["mortgage"]["total_base"] == 1200.0
    assert cats["mortgage"]["txn_count"] == 1
    assert "supermarket" in cats
    assert cats["supermarket"]["total_base"] == 600.0
    assert cats["supermarket"]["txn_count"] == 2
    assert "salary" not in cats
```

- [ ] **Step 2: Run test to verify it fails**

```
cd backend && .venv\Scripts\python -m pytest tests/test_analytics.py::test_expense_by_category -v
```
Expected: FAIL with AttributeError or 404 (endpoint doesn't exist yet)

- [ ] **Step 3: Add the endpoint**

In `backend/app/routers/analytics.py`, after the `cashflow_monthly` route and before the `summary` route, add:

```python
@router.get("/expense-by-category")
def expense_by_category(months: int = Query(default=12, ge=1, le=60), db: Session = Depends(get_db)):
    cutoff = _months_ago(date.today(), months - 1)
    txs = db.query(Transaction).filter(
        Transaction.date >= cutoff,
        Transaction.type.in_(EXPENSE_TYPES)
    ).all()
    totals: dict[str, float] = defaultdict(float)
    counts: dict[str, int] = defaultdict(int)
    for tx in txs:
        cat = tx.category or "uncategorized"
        totals[cat] += abs(_base_amount(tx))
        counts[cat] += 1
    return [
        {"category": cat, "total_base": round(totals[cat], 2), "txn_count": counts[cat]}
        for cat in sorted(totals, key=lambda c: totals[c], reverse=True)
    ]
```

- [ ] **Step 4: Run all analytics tests**

```
cd backend && .venv\Scripts\python -m pytest tests/test_analytics.py -v
```
Expected: All pass (was 6, now 7)

- [ ] **Step 5: Run full test suite**

```
cd backend && .venv\Scripts\python -m pytest tests/ -q
```
Expected: 72 passed (71 + 1 new)

- [ ] **Step 6: Commit**

```
git add backend/app/routers/analytics.py backend/tests/test_analytics.py
git commit -m "feat: add GET /analytics/expense-by-category endpoint"
```

---

### Task 2: Frontend api.ts — new types and functions

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Append to api.ts**

At the end of `frontend/src/lib/api.ts`, add:

```ts
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
```

- [ ] **Step 2: Verify TypeScript build**

```
npm run build --prefix frontend
```
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```
git add frontend/src/lib/api.ts
git commit -m "feat: add AssetRead/getAssets and CategoryExpense/getCategoryExpenses to api.ts"
```

---

### Task 3: Accounts screen — wire assets to live /assets

**Files:**
- Modify: `frontend/src/screens/accounts.jsx`

- [ ] **Step 1: Add import and state**

In `frontend/src/screens/accounts.jsx`:

Change line 8:
```js
import { getAccounts, createAccount } from '../lib/api.ts';
```
to:
```js
import { getAccounts, createAccount, getAssets } from '../lib/api.ts';
```

After the `showCreateModal` state declaration (around line 26), add:
```js
const [liveAssets, setLiveAssets] = useState(DATA.ASSETS);
```

- [ ] **Step 2: Fetch assets in useEffect**

In the existing `useEffect` (lines 27-42), add a second call after the `getAccounts` call:

```js
useEffect(() => {
  getAccounts().then(data => {
    if (data.length > 0) {
      setLiveAccounts(data.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        orig_cur: a.currency,
        cls: typeToClass(a.type),
        base: 0,
        orig_bal: 0,
        is_active: a.is_active,
      })));
    }
  }).catch(() => {});
  getAssets().then(data => {
    if (data.length > 0) setLiveAssets(data);
  }).catch(() => {});
}, []);
```

- [ ] **Step 3: Build display shape from live assets**

Replace the `groups` const (lines 53-58) with:

```js
  const assets = liveAssets.map(a => {
    const rawType = 'symbol_or_name' in a ? a.asset_type : a.type;
    const name = 'symbol_or_name' in a ? a.symbol_or_name : a.name;
    const type = ['etf', 'stock', 'bond'].includes(rawType) ? 'stocks'
      : rawType === 'real_estate' ? 'realestate'
      : rawType;
    const qty = ('qty' in a ? a.qty : a.quantity) ?? 0;
    const currentVal = 'current_value' in a ? (a.current_value ?? 0) : a.qty * a.price;
    const avgCost = ('avg_cost' in a ? a.avg_cost : a.avg) ?? 0;
    return {
      id: a.id,
      name,
      type,
      sub: a.asset_type ?? a.type,
      qty,
      price: qty > 0 ? currentVal / qty : 0,
      avg: avgCost,
      currency: a.currency,
      ownership: ('ownership_pct' in a ? a.ownership_pct : a.ownership) ?? 100,
      monthly_income: ('expected_monthly_income' in a ? a.expected_monthly_income : a.monthly_income) ?? 0,
    };
  });
  const groups = [
    { key: 'stocks', label: 'Stocks & ETFs', items: assets.filter(a => a.type === 'stocks') },
    { key: 'crypto', label: 'Crypto', items: assets.filter(a => a.type === 'crypto') },
    { key: 'gold', label: 'Gold', items: assets.filter(a => a.type === 'gold') },
    { key: 'realestate', label: 'Real estate', items: assets.filter(a => a.type === 'realestate') },
  ];
```

- [ ] **Step 4: Build frontend and check for errors**

```
npm run build --prefix frontend
```
Expected: No errors

- [ ] **Step 5: Commit**

```
git add frontend/src/screens/accounts.jsx
git commit -m "feat: wire Accounts Holdings table to live /assets endpoint"
```

---

### Task 4: Cashflow screen — wire expense groups to live endpoint

**Files:**
- Modify: `frontend/src/screens/cashflow.jsx`

- [ ] **Step 1: Add import and state**

In `frontend/src/screens/cashflow.jsx`:

Change line 10:
```js
import { getCashflowMonthly } from '../lib/api.ts';
```
to:
```js
import { getCashflowMonthly, getCategoryExpenses } from '../lib/api.ts';
```

After the `const [cf, setCf] = useState(DATA.CASHFLOW);` line, add:
```js
  const [liveCatExp, setLiveCatExp] = useState(null);
```

- [ ] **Step 2: Fetch category expenses in useEffect**

In the existing `useEffect`, add a second fetch after `getCashflowMonthly`:

```js
  useEffect(() => {
    getCashflowMonthly(12)
      .then(data => {
        if (data.length > 0) {
          setCf(data.map(m => {
            const [y, mo] = m.month.split('-').map(Number);
            return { label: DATA.MONTHS[mo - 1], year: y, income: m.income, expense: m.expense, net: m.net };
          }));
        }
      })
      .catch(() => {});
    getCategoryExpenses(12).then(setLiveCatExp).catch(() => {});
  }, []);
```

- [ ] **Step 3: Replace periodExp with computed value**

Replace line 38:
```js
  const periodExp = DATA.EXP_TOTAL * scale;
```
with:
```js
  // computed after groups useMemo below
```
(temporarily — will be resolved in step 4 along with groups refactor)

Actually, do steps 3 and 4 together — replace the `periodExp` line and the entire `groups` useMemo block.

Replace lines 38 and 43-50 with:

```js
  const groups = useMemo(() => {
    const GROUP_COLORS = Object.fromEntries(DATA.EXPENSE_GROUPS.map(g => [g.group, g.color]));
    let base;
    if (liveCatExp) {
      const catMap = Object.fromEntries(DATA.CATEGORIES.map(c => [c.id, c]));
      const raw = {};
      for (const { category, total_base, txn_count } of liveCatExp) {
        const cat = catMap[category];
        const groupName = cat?.group ?? 'Other';
        const groupColor = GROUP_COLORS[groupName] ?? '#8595AD';
        if (!raw[groupName]) raw[groupName] = { group: groupName, color: groupColor, total: 0, subs: [] };
        raw[groupName].total += total_base;
        raw[groupName].subs.push({ id: category, name: cat?.name ?? category, amount: total_base, color: cat?.color ?? '#8595AD', txns: txn_count });
      }
      base = Object.values(raw);
    } else {
      base = DATA.EXPENSE_GROUPS.map(x => ({ ...x, subs: [...x.subs] }));
    }
    const cmp = sort === 'amount' ? (a, b) => b.total - a.total : (a, b) => a.group.localeCompare(b.group);
    base.sort(cmp);
    base.forEach(grp => grp.subs.sort(sort === 'amount' ? (a, b) => b.amount - a.amount : (a, b) => a.name.localeCompare(b.name)));
    return base;
  }, [liveCatExp, sort]);

  const expTotal = useMemo(() => groups.reduce((s, g) => s + g.total, 0), [groups]);
  const periodExp = expTotal * scale;
```

- [ ] **Step 4: Replace DATA.EXP_TOTAL references in JSX**

There are two occurrences of `DATA.EXP_TOTAL` in the render (lines ~109 and ~146). Replace both with `expTotal`:

Line ~109 (inside the legend map):
```js
<span className="mono" style={{ fontWeight: 700 }}>{Math.round(g.total / expTotal * 100)}%</span>
```

Line ~146 (inside the expandable table group header):
```js
<span className="mono" style={{ textAlign: 'right', color: 'var(--text-3)', fontSize: 12.5 }}>{Math.round(g.total / expTotal * 100)}%</span>
```

- [ ] **Step 5: Build and verify**

```
npm run build --prefix frontend
```
Expected: No TypeScript/JSX errors

- [ ] **Step 6: Commit**

```
git add frontend/src/screens/cashflow.jsx
git commit -m "feat: wire Cashflow expense groups to live /analytics/expense-by-category"
```

---

### Task 5: Integration smoke test + push

- [ ] **Step 1: Start backend and frontend**

Terminal 1:
```
cd backend && .venv\Scripts\python -m uvicorn app.main:app --reload
```
Terminal 2:
```
npm run dev --prefix frontend
```

- [ ] **Step 2: Verify Accounts screen**

Open http://localhost:5173 → Accounts screen.
- If backend has assets: Holdings table shows live data
- If backend is empty: Holdings table shows mock data (fallback works)

- [ ] **Step 3: Verify Cashflow screen**

Open Cashflow screen.
- If backend has transactions: Donut and expandable table show live category groups
- If backend is empty: Shows mock `DATA.EXPENSE_GROUPS` (fallback works)
- Percentages in legend and table add up to ~100%

- [ ] **Step 4: Run full backend test suite**

```
cd backend && .venv\Scripts\python -m pytest tests/ -q
```
Expected: 72 passed

- [ ] **Step 5: Push to master**

```
git push
```

- [ ] **Step 6: Update memory**

Update `C:\Users\hoang\.claude\projects\D--03-Claude-Code-financial-indpendent\memory\fi-tracker-progress.md` — mark Plan 9 as DONE, add next candidates for Plan 10.
