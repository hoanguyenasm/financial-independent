# Plan 6 — Live Screens Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Accounts list section, Transactions table + account filter, and Import account selector to live backend data, replacing hardcoded mock references with API calls that fall back silently to mock data when the backend is offline.

**Architecture:** Same best-effort pattern as Plans 5 and 4: `useState` initialized from mock, `useEffect` fetches on mount, `.catch(() => {})` falls back silently. A `typeToClass(type)` helper converts backend account type strings (`"checking"`, `"brokerage"`, `"crypto"`, etc.) to the UI color-class names the JSX already uses (`"bank"`, `"stocks"`, `"crypto"`, `"realestate"`, `"gold"`, `"other"`). Accounts and transactions share live integer ids so map lookups are consistent; mock fallback paths continue to use the existing mock string ids transparently.

**Tech Stack:** React `useState` / `useEffect` / `useMemo`, existing `api<T>()` generic in `frontend/src/lib/api.ts`, FastAPI `GET /accounts` and `GET /transactions` endpoints already running.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `frontend/src/lib/api.ts` | Add `AccountRead` interface, `getAccounts()`, `TransactionRead` interface, `getTransactions()` |
| Modify | `frontend/src/screens/accounts.jsx` | Wire accounts list cards and active-count subtitle to live `/accounts`; NW chart, allocation donut, and holdings table stay on mock |
| Modify | `frontend/src/screens/transactions.jsx` | Wire account filter dropdown and transaction table to live API; build live `acctMap` from accounts state |
| Modify | `frontend/src/screens/settings.jsx` | Load accounts from API, convert Target Account section from display-only to real selector, use `selectedAccountId` in `importFile` call |

---

## Task 1: API functions in api.ts

**Files:**
- Modify: `frontend/src/lib/api.ts`

### Background

`api.ts` already exports a generic `api<T>()` helper. We add two typed wrappers for the accounts and transactions endpoints. No tests — verified by TypeScript build (`npm run build --prefix frontend`).

`GET /accounts` returns:
```json
[{ "id": 1, "name": "ING Checking", "type": "checking", "currency": "EUR", "institution": "ING", "is_active": true }]
```

`GET /transactions?limit=500` returns:
```json
[{ "id": 1, "account_id": 1, "user_id": 1, "date": "2026-05-15", "amount": -42.50, "currency": "EUR", "amount_base": -42.50, "description": "Supermarkt REWE", "category": "groceries", "type": "expense", "needs_review": false }]
```

- [ ] **Step 1: Add interfaces and API functions**

Open `frontend/src/lib/api.ts`. After the last export in the file (after `getCashflowMonthly`), add:

```typescript
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
git commit -m "feat: add getAccounts and getTransactions API functions"
```

---

## Task 2: Wire Accounts screen accounts list

**Files:**
- Modify: `frontend/src/screens/accounts.jsx`

### Background

`AccountsScreen` reads `DATA.ACCOUNTS` in exactly two places:
1. Line 35 — subtitle: `DATA.ACCOUNTS.filter(a => a.is_active).length`
2. Lines 81–97 — accounts list cards: `DATA.ACCOUNTS.map(a => ...)`

The live `AccountRead` shape lacks `cls`, `base`, and `orig_bal` fields that the cards use. We adapt on load:
- `cls` — derived via `typeToClass(a.type)`
- `base` — 0 (no balance from API yet; the balance display condition `a.base > 0` suppresses the sub-label so "€0" shows cleanly)
- `orig_bal` — 0
- `orig_cur` — maps to `a.currency`

Everything else in the screen (net worth chart, allocation donut, holdings table) stays on `DATA.*` mock.

- [ ] **Step 1: Add `useEffect` import and API import**

In `accounts.jsx`, line 5:
```jsx
import React, { useState } from 'react';
```
Change to:
```jsx
import React, { useState, useEffect } from 'react';
```

After line 7 (`import { Icon, Donut, AreaChart } from '../ui.jsx';`), add:
```jsx
import { getAccounts } from '../lib/api.ts';
```

- [ ] **Step 2: Add `typeToClass` helper before the component**

After the imports and before `export function AccountsScreen`, add:

```jsx
function typeToClass(type) {
  if (type === 'crypto') return 'crypto';
  if (type === 'realestate' || type === 'real_estate') return 'realestate';
  if (type === 'gold') return 'gold';
  if (type === 'brokerage' || type === 'investment' || type === 'stocks') return 'stocks';
  return 'bank';
}
```

- [ ] **Step 3: Add live accounts state + useEffect inside AccountsScreen**

In `AccountsScreen`, after `const [range, setRange] = useState('24');` (line 13), add:

```jsx
  const [liveAccounts, setLiveAccounts] = useState(DATA.ACCOUNTS);

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
  }, []);
```

- [ ] **Step 4: Replace the two DATA.ACCOUNTS references**

**Subtitle (search for `DATA.ACCOUNTS.filter(a => a.is_active).length`):**
```jsx
// Before:
<span className="sub">{DATA.ACCOUNTS.filter(a => a.is_active).length} active accounts · {currency} base</span>
// After:
<span className="sub">{liveAccounts.filter(a => a.is_active).length} active accounts · {currency} base</span>
```

**Accounts list cards (search for `DATA.ACCOUNTS.map(a =>`):**
```jsx
// Before:
{DATA.ACCOUNTS.map(a => (
// After:
{liveAccounts.map(a => (
```

- [ ] **Step 5: Verify build**

```
npm run build --prefix frontend
```
Expected: `✓ built` with 0 errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/screens/accounts.jsx
git commit -m "feat: wire Accounts screen list to live /accounts endpoint"
```

---

## Task 3: Wire Transactions screen (accounts filter + transaction table)

**Files:**
- Modify: `frontend/src/screens/transactions.jsx`

### Background

The Transactions screen uses mock data in four ways:

| Usage | Mock source | Lines | Live replacement |
|-------|-------------|-------|------------------|
| Filter dropdown options | `DATA.ACCOUNTS.filter(a => a.is_active)` | 94 | `accounts` state from API |
| Filter dropdown display label | `DATA.ACCT[fAcct].name` | 91 | `acctMap[fAcct]?.name ?? 'Account'` |
| Account color dot in table rows | `DATA.ACCT[t.account_id].cls` | 158 | `acctMap[t.account_id]?.cls ?? 'other'` |
| Account name in table rows | `DATA.ACCT[t.account_id].name` | 158 | `acctMap[t.account_id]?.name ?? 'Unknown'` |
| Transaction list | `DATA.TX.map(t => ({ ...t }))` | 11 | adapted `TransactionRead[]` from API |

**Shape adapter** — `TransactionRead` uses `date` and `description`; the screen uses `t.d` and `t.desc`:
```js
{ ...t, d: new Date(t.date), desc: t.description, amount_base: t.amount_base ?? t.amount }
```

**`acctMap`** — built from `accounts` state (whichever source it comes from), keyed by `a.id`:
```js
const acctMap = useMemo(() =>
  Object.fromEntries(accounts.map(a => [a.id, a])), [accounts]);
```

When the API is unreachable, `accounts` stays as `DATA.ACCOUNTS` (mock) and `tx` stays as `DATA.TX` (mock). Mock account ids are strings (`'acct1'`), mock tx account_ids are the same strings — so `acctMap['acct1']` works. Live ids are integers throughout — `acctMap[1]` works. No cross-contamination.

Note: the `user_id` filter (`fUser`) uses `'you'`/`'partner'` string ids. Live transactions carry integer `user_id` (1, 2). With live data the user filter passes through all transactions — acceptable for this plan; a full user-id mapping is a future task.

- [ ] **Step 1: Add API imports**

In `transactions.jsx`, line 8:
```jsx
import { patchTransaction, createCategoryRule } from '../lib/api.ts';
```
Change to:
```jsx
import { patchTransaction, createCategoryRule, getAccounts, getTransactions } from '../lib/api.ts';
```

- [ ] **Step 2: Add `typeToClass` helper before the component**

After the import block and before `export function TransactionsScreen`, add:

```jsx
function typeToClass(type) {
  if (type === 'crypto') return 'crypto';
  if (type === 'realestate' || type === 'real_estate') return 'realestate';
  if (type === 'gold') return 'gold';
  if (type === 'brokerage' || type === 'investment' || type === 'stocks') return 'stocks';
  return 'bank';
}
```

- [ ] **Step 3: Add live `accounts` state and `acctMap` inside TransactionsScreen**

In `TransactionsScreen`, the current state block starts at line 11. After `const [tx, setTx] = ...` (line 11), add two new state declarations and one memo:

```jsx
  const [accounts, setAccounts] = useState(DATA.ACCOUNTS);
  const acctMap = useMemo(
    () => Object.fromEntries(accounts.map(a => [a.id, a])),
    [accounts]
  );
```

Then after all existing state declarations (after `const pageSize = 11;`, around line 23), add two `useEffect` calls:

```jsx
  useEffect(() => {
    getAccounts().then(data => {
      if (data.length > 0) {
        setAccounts(data.map(a => ({
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
  }, []);

  useEffect(() => {
    getTransactions(500).then(data => {
      if (data.length > 0) {
        setTx(data.map(t => ({
          ...t,
          d: new Date(t.date),
          desc: t.description,
          amount_base: t.amount_base ?? t.amount,
        })));
      }
    }).catch(() => {});
  }, []);
```

**Important:** Place the `getTransactions` `useEffect` AFTER the two `useEffect` calls that already exist at lines 25–27 (the `initialFilter` and `registerSetReview` effects), so it does not interfere with their initialisation order.

- [ ] **Step 4: Replace the four DATA references in JSX**

**Account filter dropdown display label** (line ~91, search for `DATA.ACCT[fAcct].name`):
```jsx
// Before:
<Dropdown label="Account" display={fAcct === 'all' ? 'All' : DATA.ACCT[fAcct].name}>
// After:
<Dropdown label="Account" display={fAcct === 'all' ? 'All' : (acctMap[fAcct]?.name ?? 'Account')}>
```

**Account filter dropdown options** (line ~94, search for `DATA.ACCOUNTS.filter(a => a.is_active)`):
```jsx
// Before:
{DATA.ACCOUNTS.filter(a => a.is_active).map(a => <DDItem key={a.id} on={fAcct === a.id} onClick={() => setFAcct(a.id)}>{a.name}</DDItem>)}
// After:
{accounts.filter(a => a.is_active).map(a => <DDItem key={a.id} on={fAcct === a.id} onClick={() => setFAcct(a.id)}>{a.name}</DDItem>)}
```

**Account color dot in table rows** (line ~158, search for `DATA.ACCT[t.account_id].cls`):
```jsx
// Before:
<span style={{ width: 7, height: 7, borderRadius: 2, background: `var(--c-${DATA.ACCT[t.account_id].cls})` }} />{DATA.ACCT[t.account_id].name}
// After:
<span style={{ width: 7, height: 7, borderRadius: 2, background: `var(--c-${acctMap[t.account_id]?.cls ?? 'other'})` }} />{acctMap[t.account_id]?.name ?? 'Unknown'}
```

- [ ] **Step 5: Verify build**

```
npm run build --prefix frontend
```
Expected: `✓ built` with 0 errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/screens/transactions.jsx
git commit -m "feat: wire Transactions screen accounts filter and table to live API"
```

---

## Task 4: Wire Import account selector

**Files:**
- Modify: `frontend/src/screens/settings.jsx`

### Background

`ImportTab` currently calls `importFile(file, 1, 1)` with a hardcoded `account_id=1`. There is already a "Target account" card (lines 117–128) that renders `DATA.ACCOUNTS.filter(a => a.is_active)` as display-only buttons with no selection state.

This task:
1. Adds `selectedAccountId` state (defaults to first active account id)
2. Loads live accounts from API on mount
3. Converts the Target Account buttons into a real selector (selected = highlighted border)
4. Passes `selectedAccountId` to `importFile` instead of `1`

If the backend is offline, accounts falls back to `DATA.ACCOUNTS.filter(a => a.is_active)` and `selectedAccountId` uses the first mock account's id.

- [ ] **Step 1: Add `getAccounts` import**

In `settings.jsx`, line 8:
```jsx
import { getSettings, updateSettings, deleteCategoryRule, importFile, getImportLogs } from '../lib/api.ts';
```
Change to:
```jsx
import { getSettings, updateSettings, deleteCategoryRule, importFile, getImportLogs, getAccounts } from '../lib/api.ts';
```

- [ ] **Step 2: Add accounts state inside `ImportTab`**

In `ImportTab`, after the existing state declarations (`phase`, `over`, `result`, `history`) but before `loadHistory`, add:

```jsx
  const defaultAccounts = DATA.ACCOUNTS.filter(a => a.is_active);
  const [accounts, setAccounts] = useState(defaultAccounts);
  const [selectedAccountId, setSelectedAccountId] = useState(
    defaultAccounts.length > 0 ? defaultAccounts[0].id : null
  );

  useEffect(() => {
    getAccounts(true).then(data => {
      if (data.length > 0) {
        const adapted = data.map(a => ({
          id: a.id,
          name: a.name,
          type: a.type,
          cls: typeToClass(a.type),
          is_active: a.is_active,
        }));
        setAccounts(adapted);
        setSelectedAccountId(adapted[0].id);
      }
    }).catch(() => {});
  }, []);
```

- [ ] **Step 3: Add `typeToClass` helper before `ImportTab`**

After the `SettingsScreen` component (after its closing `}`) and before `function ImportTab()`, add:

```jsx
function typeToClass(type) {
  if (type === 'crypto') return 'crypto';
  if (type === 'realestate' || type === 'real_estate') return 'realestate';
  if (type === 'gold') return 'gold';
  if (type === 'brokerage' || type === 'investment' || type === 'stocks') return 'stocks';
  return 'bank';
}
```

- [ ] **Step 4: Wire `selectedAccountId` into `handleFile`**

Find `handleFile` (lines 42–55). Change the `importFile` call:
```jsx
// Before:
const log = await importFile(file, 1, 1);
// After:
const log = await importFile(file, selectedAccountId ?? 1, 1);
```

- [ ] **Step 5: Replace the Target Account static list with a real selector**

Find the Target Account card (lines 117–128):
```jsx
        <div className="card tight">
          <label className="fld">Target account</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {DATA.ACCOUNTS.filter(a => a.is_active).map(a => (
              <button key={a.id} className="dd-item"
                style={{ border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: `var(--c-${a.cls})` }} />
                <span style={{ flex: 1 }}>{a.name}</span>
              </button>
            ))}
          </div>
        </div>
```

Replace with:
```jsx
        <div className="card tight">
          <label className="fld">Target account</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {accounts.map(a => (
              <button key={a.id} className="dd-item"
                onClick={() => setSelectedAccountId(a.id)}
                style={{
                  border: `1px solid ${a.id === selectedAccountId ? 'var(--accent)' : 'var(--border)'}`,
                  background: a.id === selectedAccountId ? 'var(--accent-soft)' : 'var(--surface-2)',
                }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: `var(--c-${a.cls})` }} />
                <span style={{ flex: 1 }}>{a.name}</span>
                {a.id === selectedAccountId && <Icon n="check" s={14} c="var(--accent)" />}
              </button>
            ))}
            {accounts.length === 0 && (
              <div className="fx" style={{ padding: '8px 4px' }}>No accounts found. Create one first.</div>
            )}
          </div>
        </div>
```

- [ ] **Step 6: Verify build**

```
npm run build --prefix frontend
```
Expected: `✓ built` with 0 errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/screens/settings.jsx
git commit -m "feat: wire Import account selector to live /accounts endpoint"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|-------------|------|
| `getAccounts()` and `getTransactions()` added to api.ts | Task 1 |
| Accounts screen list wired to live `/accounts` | Task 2 |
| Accounts screen active-count subtitle uses live count | Task 2 |
| Transactions account filter dropdown uses live accounts | Task 3 |
| Transactions table account name + color dot uses live data | Task 3 |
| Transactions table rows loaded from live `/transactions` | Task 3 |
| Import Target Account picker loads from live API | Task 4 |
| Import passes `selectedAccountId` to `importFile` | Task 4 |
| All screens fall back to mock data on backend offline | Tasks 2, 3, 4 |
| Net worth chart / allocation donut / holdings table stay on mock | Task 2 (not touched) |
| FIRE hero stays on mock | Not touched |

### Placeholder scan

No TBDs. Every step has exact code.

### Type consistency

- `AccountRead.id` is `number` (Task 1) → used as `acctMap` key (integer) and `selectedAccountId` (number) — consistent.
- `TransactionRead.date` is `string` ("YYYY-MM-DD") → adapted via `new Date(t.date)` to `d` field — same pattern as `DATA.TODAY` usage.
- `TransactionRead.amount_base` is `number | null` → guarded with `?? t.amount` — no null propagation.
- `typeToClass` defined identically in accounts.jsx (before component), transactions.jsx (before component), and settings.jsx (between SettingsScreen and ImportTab) — three copies, no shared import needed.
- `getAccounts(true)` in Task 4 passes `activeOnly=true` → maps to `?active_only=true` query param (Task 1 definition) → backend `active_only: bool = False` param — matches.
- `acctMap[fAcct]?.name ?? 'Account'` (Task 3) — optional chaining guards the case where `fAcct` is a live id not yet in `acctMap` during initial render.
