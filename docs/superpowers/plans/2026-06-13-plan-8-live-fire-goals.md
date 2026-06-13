# Plan 8: Live FIRE Goals + Dashboard Hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Settings FIRE goal form to persist to the backend, extend `/analytics/summary` to return `fi_target`, and replace the Dashboard hero's mock `net_worth`/`fi_target` constants with live values.

**Architecture:** Backend-first — extend one existing endpoint and add one test. Frontend wiring follows: api.ts gets fi_goal helpers, Settings gets upsert on save, Dashboard extends its existing `getAnalyticsSummary()` useEffect to also set `netWorth`/`fiTarget` state that replace `S.net_worth`/`S.fi_target` in the hero JSX.

**Tech Stack:** Python/FastAPI/SQLAlchemy (backend), React/TypeScript (frontend)

---

## File Map

| File | Change |
|------|--------|
| `backend/app/routers/analytics.py` | Import `FIGoal`; add fi_goal query + `fi_target` to summary response |
| `backend/tests/test_analytics.py` | Fix `test_summary_empty_db` (add `fi_target`); add `test_summary_includes_fi_target` |
| `frontend/src/lib/api.ts` | Add `fi_target` to `AnalyticsSummary`; add `FIGoalRead`, `FIGoalUpsert`, `getFIGoal`, `upsertFIGoal` |
| `frontend/src/screens/settings.jsx` | Import `getFIGoal`/`upsertFIGoal`; add load-on-mount useEffect; wire Save goal button |
| `frontend/src/screens/dashboard.jsx` | Add `netWorth`/`fiTarget` state; extend existing useEffect; replace `S.net_worth`/`S.fi_target` in JSX |

---

### Task 1: Backend — extend analytics/summary + tests

**Files:**
- Modify: `backend/app/routers/analytics.py`
- Modify: `backend/tests/test_analytics.py`

- [ ] **Step 1: Write the failing test for fi_target in summary**

Open `backend/tests/test_analytics.py`. The existing `test_summary_empty_db` asserts the full response dict — it will break once we add `fi_target`. Fix it and add the new test at the end of the file:

Replace:
```python
def test_summary_empty_db(client):
    s = client.get("/analytics/summary").json()
    assert s == {
        "net_worth": 0.0, "passive_income_monthly": 0.0,
        "monthly_expenses": 0.0, "savings_rate": 0.0, "needs_review": 0,
    }
```
With:
```python
def test_summary_empty_db(client):
    s = client.get("/analytics/summary").json()
    assert s == {
        "net_worth": 0.0, "passive_income_monthly": 0.0,
        "monthly_expenses": 0.0, "savings_rate": 0.0, "needs_review": 0,
        "fi_target": 0.0,
    }


def test_summary_includes_fi_target(client):
    from app.models import User, FIGoal
    user = client.post("/users", json={"name": "Hoa", "email": "hoa@example.com"}).json()
    goal_payload = {
        "user_id": user["id"],
        "target_net_worth": 500000.0,
        "safe_withdrawal_rate": 0.04,
        "investment_return_rate": 0.07,
        "inflation_rate": 0.03,
    }
    client.post("/fi-goals", json=goal_payload)
    s = client.get("/analytics/summary").json()
    assert s["fi_target"] == 500000.0
```

- [ ] **Step 2: Run tests to see them fail**

```
cd backend && .venv/Scripts/python -m pytest tests/test_analytics.py -v
```
Expected: `test_summary_empty_db` FAILS (missing `fi_target` key), `test_summary_includes_fi_target` FAILS.

- [ ] **Step 3: Implement the backend change**

Open `backend/app/routers/analytics.py`. Change the import line:
```python
from app.models import Asset, Transaction
```
To:
```python
from app.models import Asset, Transaction, FIGoal
```

In the `summary()` function, add the fi_goal query after the `needs_review` line and before the return:
```python
    goal = db.query(FIGoal).filter(FIGoal.user_id == 1).first()
    fi_target = float(goal.target_net_worth) if goal and goal.target_net_worth else 0.0
```

Update the return dict to include `fi_target`:
```python
    return {
        "net_worth": round(net_worth, 2),
        "passive_income_monthly": round(passive / 12, 2),
        "monthly_expenses": round(expenses / 12, 2),
        "savings_rate": round((income - expenses) / income, 4) if income > 0 else 0.0,
        "needs_review": needs_review,
        "fi_target": round(fi_target, 2),
    }
```

- [ ] **Step 4: Run all backend tests**

```
cd backend && .venv/Scripts/python -m pytest tests/ -q
```
Expected: 72 passed (70 existing + 2 new), 0 failures.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/analytics.py backend/tests/test_analytics.py
git commit -m "feat: add fi_target to analytics/summary endpoint"
```

---

### Task 2: api.ts — fi_goal types and functions

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Update AnalyticsSummary interface**

Find:
```ts
export interface AnalyticsSummary {
  net_worth: number
  passive_income_monthly: number
  monthly_expenses: number
  savings_rate: number          // fraction 0–1
  needs_review: number
}
```
Replace with:
```ts
export interface AnalyticsSummary {
  net_worth: number
  passive_income_monthly: number
  monthly_expenses: number
  savings_rate: number          // fraction 0–1
  needs_review: number
  fi_target: number
}
```

- [ ] **Step 2: Add FIGoal types and functions**

At the end of `frontend/src/lib/api.ts`, add:
```ts
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
```

- [ ] **Step 3: Verify build**

```
npm run build --prefix frontend
```
Expected: exits 0, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add getFIGoal and upsertFIGoal to api.ts"
```

---

### Task 3: settings.jsx — load and save fi_goal

**Files:**
- Modify: `frontend/src/screens/settings.jsx`

- [ ] **Step 1: Add getFIGoal and upsertFIGoal to the import**

Find:
```js
import { getSettings, updateSettings, deleteCategoryRule, importFile, getImportLogs, getAccounts } from '../lib/api.ts';
```
Replace with:
```js
import { getSettings, updateSettings, deleteCategoryRule, importFile, getImportLogs, getAccounts, getFIGoal, upsertFIGoal } from '../lib/api.ts';
```

- [ ] **Step 2: Add load-on-mount useEffect to SettingsTab**

`SettingsTab` currently opens with:
```js
function SettingsTab({ currency, setCurrency }) {
  const [cats, setCats] = useState(DATA.CATEGORIES);
  const [rules, setRules] = useState(DATA.RULES);
  const [goal, setGoal] = useState({ target: 1500000, date: '2037-01', swr: 3.5, ret: 5.0, infl: 2.0 });
```

After the `goal` state declaration, add a useEffect that loads from the backend and pre-populates the form:
```js
  useEffect(() => {
    getFIGoal(1).then(g => {
      setGoal({
        target: g.target_net_worth ?? 1500000,
        date: g.target_date ? g.target_date.slice(0, 7) : '2037-01',
        swr: +(g.safe_withdrawal_rate * 100).toFixed(2),
        ret: +(g.investment_return_rate * 100).toFixed(2),
        infl: +(g.inflation_rate * 100).toFixed(2),
      });
    }).catch(() => {});
  }, []);
```

- [ ] **Step 3: Wire the Save goal button**

Find:
```js
<button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => showToast('FIRE goal updated')}>Save goal</button>
```
Replace with:
```js
<button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => {
  upsertFIGoal(1, {
    target_net_worth: goal.target,
    target_date: goal.date || undefined,
    safe_withdrawal_rate: goal.swr / 100,
    investment_return_rate: goal.ret / 100,
    inflation_rate: goal.infl / 100,
  })
    .then(() => showToast('FIRE goal saved'))
    .catch(() => showToast('Could not save — backend offline', 'x'));
}}>Save goal</button>
```

- [ ] **Step 4: Verify build**

```
npm run build --prefix frontend
```
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/screens/settings.jsx
git commit -m "feat: load and persist FIRE goal in Settings"
```

---

### Task 4: dashboard.jsx — live net_worth and fi_target in hero

**Files:**
- Modify: `frontend/src/screens/dashboard.jsx`

The hero currently uses `S.net_worth` and `S.fi_target` (mock constants from `data.js`). We add two state variables with those mocks as initial values, set them from the live analytics summary, and replace all JSX references.

- [ ] **Step 1: Add netWorth and fiTarget state**

Find the existing KPI state declarations (after `const S = DATA.SUMMARY`):
```js
  const [needsReview, setNeedsReview] = useState(S.needs_review);
  const [passiveIncome, setPassiveIncome] = useState(S.passive_income);
  const [monthlyExpenses, setMonthlyExpenses] = useState(S.monthly_expenses);
  const [savingsRatePct, setSavingsRatePct] = useState(S.savings_rate_month);
```
Add two more lines after `savingsRatePct`:
```js
  const [netWorth, setNetWorth] = useState(S.net_worth);
  const [fiTarget, setFiTarget] = useState(S.fi_target);
```

- [ ] **Step 2: Extend the existing analytics useEffect**

Find:
```js
  useEffect(() => {
    getAnalyticsSummary()
      .then(s => {
        setNeedsReview(s.needs_review);
        setPassiveIncome(s.passive_income_monthly);
        setMonthlyExpenses(s.monthly_expenses);
        setSavingsRatePct(Math.round(s.savings_rate * 100));
      })
      .catch(() => {});
  }, []);
```
Replace with:
```js
  useEffect(() => {
    getAnalyticsSummary()
      .then(s => {
        setNeedsReview(s.needs_review);
        setPassiveIncome(s.passive_income_monthly);
        setMonthlyExpenses(s.monthly_expenses);
        setSavingsRatePct(Math.round(s.savings_rate * 100));
        if (s.net_worth > 0) setNetWorth(s.net_worth);
        if (s.fi_target > 0) setFiTarget(s.fi_target);
      })
      .catch(() => {});
  }, []);
```

- [ ] **Step 3: Fix the pct derived value**

Find:
```js
  const pct = S.net_worth / S.fi_target;
```
Replace with:
```js
  const pct = fiTarget > 0 ? netWorth / fiTarget : 0;
```

- [ ] **Step 4: Replace S.net_worth and S.fi_target in JSX**

There are multiple occurrences in the hero section. Make these replacements one at a time:

**Hero net worth number (the large "€685k" display):**
```jsx
// Find:
<div className="num" style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-.03em', lineHeight: .95 }}>{M(S.net_worth)}</div>
// Replace with:
<div className="num" style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-.03em', lineHeight: .95 }}>{M(netWorth)}</div>
```

**Hero "/ target" display:**
```jsx
// Find:
<div className="num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-3)', marginBottom: 7 }}>/ {M(S.fi_target)}</div>
// Replace with:
<div className="num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-3)', marginBottom: 7 }}>/ {M(fiTarget)}</div>
```

**Milestone labels array (three S.fi_target references):**
```jsx
// Find:
{[['0%', MC(0)], ['25%', MC(S.fi_target * 0.25)], ['50%', MC(S.fi_target * 0.5)], ['75%', 'Lean FI'], ['100%', 'FI · ' + MC(S.fi_target)]].map((
// Replace with:
{[['0%', MC(0)], ['25%', MC(fiTarget * 0.25)], ['50%', MC(fiTarget * 0.5)], ['75%', 'Lean FI'], ['100%', 'FI · ' + MC(fiTarget)]].map((
```

**AreaChart target props (two S.fi_target references):**
```jsx
// Find:
<AreaChart id="hero" values={DATA.NW_SERIES.map(p => p.value)} h={96}
  color="var(--accent)" target={S.fi_target} targetLabel={MC(S.fi_target) + ' · FI'} gridY={2} max={S.fi_target * 1.04} />
// Replace with:
<AreaChart id="hero" values={DATA.NW_SERIES.map(p => p.value)} h={96}
  color="var(--accent)" target={fiTarget} targetLabel={MC(fiTarget) + ' · FI'} gridY={2} max={fiTarget * 1.04} />
```

- [ ] **Step 5: Verify build**

```
npm run build --prefix frontend
```
Expected: exits 0, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/screens/dashboard.jsx
git commit -m "feat: wire Dashboard hero to live net_worth and fi_target from analytics/summary"
```

---

### Task 5: Final verification + push

- [ ] **Step 1: Full backend test suite**

```
cd backend && .venv/Scripts/python -m pytest tests/ -q
```
Expected: 72 passed, 0 failures.

- [ ] **Step 2: Full frontend build**

```
npm run build --prefix frontend
```
Expected: exits 0.

- [ ] **Step 3: Push to master**

```bash
git push origin master
```

- [ ] **Step 4: Update memory**

Update `C:\Users\hoang\.claude\projects\D--03-Claude-Code-financial-indpendent\memory\fi-tracker-progress.md`:
- Mark Plan 8 as DONE
- Update next candidates to Plan 9
