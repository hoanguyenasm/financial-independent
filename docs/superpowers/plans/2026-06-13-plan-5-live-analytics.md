# Plan 5 — Live Analytics Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hard-coded mock aggregates in the Dashboard and Cash Flow screens with live data from the `/analytics/summary` and `/analytics/cashflow-monthly` endpoints, falling back to mock data when the backend is offline.

**Architecture:** Each screen calls its API function inside a `useEffect` on mount and updates isolated state fields — the rest of the screen keeps reading from `DATA.*` mock objects so FIRE calculations and category breakdowns (which have no backend equivalent yet) continue to work. No loading spinners; backend failure is silent (offline-first UX).

**Tech Stack:** React `useState` / `useEffect`, existing `api.ts` helper, FastAPI `/analytics` endpoints already running.

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `frontend/src/lib/api.ts` | Add `AnalyticsSummary` interface, `CashflowMonth` interface, `getAnalyticsSummary()`, `getCashflowMonthly()` |
| Modify | `frontend/src/screens/dashboard.jsx` | Wire 4 KPI fields (needs_review, passive_income_monthly, monthly_expenses, savings_rate) to live API; fall back to DATA.SUMMARY |
| Modify | `frontend/src/screens/cashflow.jsx` | Wire CashBars chart data and income KPI to `/analytics/cashflow-monthly`; fall back to DATA.CASHFLOW |

---

## Task 1: Analytics API functions in api.ts

**Files:**
- Modify: `frontend/src/lib/api.ts`

### Background

`api.ts` already exports a generic `api<T>()` helper that throws on non-OK responses. We add two typed wrappers. No tests — verified by TypeScript compilation (`npm run build --prefix frontend`).

The `/analytics/summary` endpoint returns:
```json
{ "net_worth": 0, "passive_income_monthly": 0, "monthly_expenses": 0, "savings_rate": 0, "needs_review": 0 }
```

The `/analytics/cashflow-monthly` endpoint returns an array:
```json
[{ "month": "2026-05", "income": 0, "expense": 0, "net": 0 }]
```

- [ ] **Step 1: Add interfaces and API functions**

Open `frontend/src/lib/api.ts`. After the last export in the file (after `getImportLogs`), add:

```typescript
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
```

- [ ] **Step 2: Verify build**

Run from repo root `D:/03_Claude_Code/financial-indpendent`:
```
npm run build --prefix frontend
```
Expected: `✓ built` with 0 TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add getAnalyticsSummary and getCashflowMonthly API functions"
```

---

## Task 2: Wire Dashboard KPI cards to live analytics

**Files:**
- Modify: `frontend/src/screens/dashboard.jsx`

### Background

`DashboardScreen` currently reads all metrics from `const S = DATA.SUMMARY` (a static object). Four of its KPI cards can now be live:

| Card | Mock source | Live source |
|------|-------------|-------------|
| Needs Review count | `S.needs_review` | `summary.needs_review` |
| Passive income coverage ring | `S.passive_income / S.monthly_expenses` | `summary.passive_income_monthly / summary.monthly_expenses` |
| Monthly expenses (coverage ring sub-label) | `S.monthly_expenses` | `summary.monthly_expenses` |
| Savings rate (this month) | `S.savings_rate_month` | `Math.round(summary.savings_rate * 100)` |

The FIRE hero (net worth, FI date, scenario slider) stays on mock data because it requires `fi_target` and `base_monthly_savings` which live only in `DATA.SUMMARY`.

**Wiring strategy:** Add four `useState` fields that start with mock values, then get overwritten on successful API fetch.

- [ ] **Step 1: Add `useEffect` import and API import**

In `dashboard.jsx`, the first two lines are:
```jsx
import React, { useState, useMemo } from 'react';
import { DATA, FMT, FIRE } from '../data.js';
```

Change them to:
```jsx
import React, { useState, useMemo, useEffect } from 'react';
import { DATA, FMT, FIRE } from '../data.js';
import { getAnalyticsSummary } from '../lib/api.ts';
```

- [ ] **Step 2: Add live state to DashboardScreen**

In `DashboardScreen`, after `const S = DATA.SUMMARY;` and before the `useMemo` lines, add:

```jsx
  const [needsReview, setNeedsReview] = useState(S.needs_review);
  const [passiveIncome, setPassiveIncome] = useState(S.passive_income);
  const [monthlyExpenses, setMonthlyExpenses] = useState(S.monthly_expenses);
  const [savingsRatePct, setSavingsRatePct] = useState(S.savings_rate_month);

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

- [ ] **Step 3: Replace the four mock references with live state**

After the state additions, the component uses `S.passive_income`, `S.monthly_expenses`, `S.needs_review`, and `S.savings_rate_month` in its JSX. Replace each:

**Passive income coverage (line ~23 of current file):**
```jsx
// Before:
const coverage = S.passive_income / S.monthly_expenses;
// After:
const coverage = passiveIncome / (monthlyExpenses || 1);
```

**Savings rate card (search for `S.savings_rate_month`):**
```jsx
// Before:
<div className="num pos-c" style={{ fontSize: 32, fontWeight: 800 }}>{S.savings_rate_month}%</div>
// After:
<div className="num pos-c" style={{ fontSize: 32, fontWeight: 800 }}>{savingsRatePct}%</div>
```

**Passive income value in ring card (search for `S.passive_income`):**
```jsx
// Before:
<div className="num" style={{ fontSize: 19, fontWeight: 800 }}>{M(S.passive_income)}<span ...>
// After:
<div className="num" style={{ fontSize: 19, fontWeight: 800 }}>{M(passiveIncome)}<span ...>
```

**Monthly expenses sub-label in ring card (search for `S.monthly_expenses`):**
```jsx
// Before:
<div className="kpi-sub">of {M(S.monthly_expenses)} expenses</div>
// After:
<div className="kpi-sub">of {M(monthlyExpenses)} expenses</div>
```

**Needs Review count (search for `S.needs_review`):**
```jsx
// Before:
<div className="num warn-c" style={{ fontSize: 44, fontWeight: 800, marginTop: 10 }}>{S.needs_review}</div>
// After:
<div className="num warn-c" style={{ fontSize: 44, fontWeight: 800, marginTop: 10 }}>{needsReview}</div>
```

- [ ] **Step 4: Verify build**

```
npm run build --prefix frontend
```
Expected: `✓ built` with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/screens/dashboard.jsx
git commit -m "feat: wire Dashboard KPI cards (needs-review, passive income, expenses, savings rate) to live analytics"
```

---

## Task 3: Wire CashFlow chart to live cashflow-monthly data

**Files:**
- Modify: `frontend/src/screens/cashflow.jsx`

### Background

`CashFlowScreen` uses `const cf = DATA.CASHFLOW` (an array of `{label, year, income, expense, net}`) in two places:
1. `<CashBars data={cf} h={232} />` — the income vs expenses bar chart
2. `periodInc` — income KPI for the current month (monthly view) or trailing 12 months (yearly view)

The backend returns `CashflowMonth[]` with shape `{month: "YYYY-MM", income, expense, net}`. The `CashBars` component only needs `income`, `expense`, `net` — the `label` and `year` fields are only used by other things. So we can add a `label` field by parsing the month string.

**Live data shape adapter:**
```javascript
// Convert "2026-05" → { label: "May", year: 2026, income, expense, net }
const adaptMonth = (m) => {
  const [y, mo] = m.month.split('-').map(Number);
  return { label: DATA.MONTHS[mo - 1], year: y, income: m.income, expense: m.expense, net: m.net };
};
```

- [ ] **Step 1: Add `useEffect` import and API imports**

In `cashflow.jsx`, line 7:
```jsx
import { useState, useMemo } from 'react';
```
Change to:
```jsx
import { useState, useMemo, useEffect } from 'react';
```

Add after line 9 (after the `../ui.jsx` import):
```jsx
import { getCashflowMonthly } from '../lib/api.ts';
```

- [ ] **Step 2: Replace `const cf = DATA.CASHFLOW` with state**

Find line 20:
```jsx
  const cf = DATA.CASHFLOW;
```

Replace with:
```jsx
  const [cf, setCf] = useState(DATA.CASHFLOW);

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
  }, []);
```

- [ ] **Step 3: Verify build**

```
npm run build --prefix frontend
```
Expected: `✓ built` with 0 errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/screens/cashflow.jsx
git commit -m "feat: wire CashFlow bar chart to live /analytics/cashflow-monthly endpoint"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|-------------|------|
| `getAnalyticsSummary()` and `getCashflowMonthly()` added to api.ts | Task 1 |
| Dashboard needs_review counter wired to live API | Task 2 |
| Dashboard passive income / monthly expenses wired to live API | Task 2 |
| Dashboard savings rate wired to live API | Task 2 |
| CashFlow bar chart wired to live API | Task 3 |
| Offline fallback to mock data | Tasks 2 & 3 |
| FIRE calculations stay on mock (fi_target / base_monthly_savings not in API) | Tasks 2 & 3 (do not touch FIRE hero) |

### Placeholder scan

No TBDs. Every step has exact code.

### Type consistency

- `AnalyticsSummary.passive_income_monthly` defined in Task 1, read as `s.passive_income_monthly` in Task 2 — matches.
- `CashflowMonth.month` defined in Task 1 as `string` ("YYYY-MM"), parsed with `.split('-')` in Task 3 — consistent.
- `DATA.MONTHS` array used in Task 3 adapter — already exported from `data.js` as `export const DATA = { ..., MONTHS, ... }`.
- `getCashflowMonthly` imported in Task 3 from `../lib/api.ts` — defined in Task 1 with that exact name.
- `coverage` variable renamed from `S.passive_income / S.monthly_expenses` → `passiveIncome / (monthlyExpenses || 1)` — guard against divide-by-zero when API returns 0 expenses (empty DB).
