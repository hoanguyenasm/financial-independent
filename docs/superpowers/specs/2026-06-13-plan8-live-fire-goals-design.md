# Plan 8 Design: Live FIRE Goals + Dashboard Hero

Date: 2026-06-13

## Problem

The Dashboard hero (net worth progress bar, FI target, % to FI) and the Accounts NW chart still use hardcoded mock constants from `data.js`. The Settings FIRE goal form has a "Save goal" button that writes to local state only — nothing persists to the backend. As a result, changing the FI target in Settings has no effect on the dashboard.

## Scope

Minimal wiring: no new models, no Alembic migration. The `fi_goals` table and all CRUD endpoints exist from Plan 1.

**In:**
- Extend `GET /analytics/summary` to include `fi_target` from the fi_goal for user_id=1
- Wire Settings FIRE goal form: load on mount, upsert on "Save goal"
- Wire Dashboard hero to use live `net_worth` + `fi_target`
- One new backend test for the extended summary

**Out (Plan 9+):**
- Net-worth snapshot history (requires new model)
- FIRE calculation using live `base_monthly_savings` (scenario slider stays on mock)
- Assets/holdings wiring
- Per-user fi_goal (user_id hardcoded to 1 for now)

## Architecture

### Files changed

| File | Change |
|------|--------|
| `backend/app/routers/analytics.py` | Import `FIGoal`; add `fi_target` to summary response |
| `backend/tests/test_analytics.py` | Add test for summary with fi_goal present |
| `frontend/src/lib/api.ts` | Add `fi_target` to `AnalyticsSummary`; add `FIGoalRead`, `FIGoalUpsert`, `getFIGoal`, `upsertFIGoal` |
| `frontend/src/screens/settings.jsx` | Load fi_goal on mount; wire "Save goal" to `upsertFIGoal` |
| `frontend/src/screens/dashboard.jsx` | Add `netWorth`/`fiTarget` state; set from analytics summary; replace `S.net_worth`/`S.fi_target` in hero JSX |

### Files unchanged

- All other backend files
- `frontend/src/screens/accounts.jsx`, `transactions.jsx`, `cashflow.jsx`
- `frontend/src/App.tsx`

---

## Backend: analytics/summary extension

Add `FIGoal` import to `analytics.py`:

```python
from app.models import Asset, Transaction, FIGoal
```

At the end of `summary()`, before the return statement:

```python
goal = db.query(FIGoal).filter(FIGoal.user_id == 1).first()
fi_target = float(goal.target_net_worth) if goal and goal.target_net_worth else 0.0
```

Updated return dict:

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

### New backend test

File: `backend/tests/test_analytics.py` (add to existing file)

```python
def test_summary_includes_fi_target(client, db_session):
    # create user + fi_goal
    from app.models import User, FIGoal
    user = User(name="Test", email="t@t.com")
    db_session.add(user)
    db_session.commit()
    goal = FIGoal(user_id=user.id, target_net_worth=500000, safe_withdrawal_rate=0.04,
                  investment_return_rate=0.07, inflation_rate=0.03)
    db_session.add(goal)
    db_session.commit()
    r = client.get("/analytics/summary")
    assert r.status_code == 200
    assert r.json()["fi_target"] == 500000.0
```

---

## Frontend: api.ts additions

### Updated AnalyticsSummary interface

```ts
export interface AnalyticsSummary {
  net_worth: number
  passive_income_monthly: number
  monthly_expenses: number
  savings_rate: number
  needs_review: number
  fi_target: number          // ← new
}
```

### New types and functions

```ts
export interface FIGoalRead {
  id: number
  user_id: number
  target_net_worth: number
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

---

## Frontend: settings.jsx — SettingsTab

### Load on mount

Add `useEffect` inside `SettingsTab`:

```js
useEffect(() => {
  getFIGoal(1).then(g => {
    setGoal({
      target: g.target_net_worth,
      date: g.target_date ? g.target_date.slice(0, 7) : '',   // "YYYY-MM"
      swr: +(g.safe_withdrawal_rate * 100).toFixed(2),
      ret: +(g.investment_return_rate * 100).toFixed(2),
      infl: +(g.inflation_rate * 100).toFixed(2),
    });
  }).catch(() => {});   // backend offline → keep mock defaults
}, []);
```

Also add `getFIGoal, upsertFIGoal` to the import from `api.ts`.

### Wire "Save goal" button

Replace:
```js
onClick={() => showToast('FIRE goal updated')}
```
With:
```js
onClick={() => {
  upsertFIGoal(1, {
    target_net_worth: goal.target,
    target_date: goal.date || undefined,
    safe_withdrawal_rate: goal.swr / 100,
    investment_return_rate: goal.ret / 100,
    inflation_rate: goal.infl / 100,
  })
    .then(() => showToast('FIRE goal saved'))
    .catch(() => showToast('Could not save — backend offline', 'x'));
}}
```

**Note:** The form stores SWR/return/inflation as display percentages (e.g. `3.5`). The backend stores fractions (`0.035`). Conversion happens at the call site: divide by 100 on save, multiply by 100 on load.

---

## Frontend: dashboard.jsx — Hero wiring

### New state variables

Add alongside existing KPI state (after `savingsRatePct`):

```js
const [netWorth, setNetWorth] = useState(S.net_worth)
const [fiTarget, setFiTarget] = useState(S.fi_target)
```

### Extended useEffect

In the existing `getAnalyticsSummary().then(s => { ... })` block, add two lines:

```js
if (s.net_worth > 0) setNetWorth(s.net_worth)
if (s.fi_target > 0) setFiTarget(s.fi_target)
```

### JSX replacements

Replace all occurrences of `S.net_worth` and `S.fi_target` in the Dashboard JSX with `netWorth` and `fiTarget`:

| Old | New |
|-----|-----|
| `S.net_worth` (hero number, progress bar `pct`) | `netWorth` |
| `S.fi_target` (hero `/target`, `pct` calc, milestone labels, SubStat) | `fiTarget` |

The `pct` derived value:
```js
// Replace:
const pct = S.net_worth / S.fi_target
// With:
const pct = fiTarget > 0 ? netWorth / fiTarget : 0
```

### Mock fallback

`S.net_worth` and `S.fi_target` remain the initial state values, so the dashboard displays correct mock data when the backend is offline.

---

## Error handling

| Scenario | Behavior |
|----------|----------|
| Backend offline at dashboard load | Keeps mock `S.net_worth` / `S.fi_target` initial values |
| Backend offline at settings load | Keeps local mock defaults in FIRE goal form |
| Save goal with backend offline | Toast: "Could not save — backend offline" |
| Save goal success | Toast: "FIRE goal saved" |
| `fi_target = 0` from summary (no goal set yet) | Dashboard keeps mock fi_target (guard: `if (s.fi_target > 0)`) |
