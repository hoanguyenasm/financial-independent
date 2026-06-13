# Plan 7: User ID Mapping + Account Creation UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken User filter in Transactions (live user_ids are integers but UI compared against strings), and add an Account creation modal to the Accounts screen.

**Architecture:** Frontend-only — all backend CRUD already exists from Plan 1. User identity is auto-detected by writing the selected userId to `localStorage` during import, then read by App.tsx and threaded as a prop to TransactionsScreen. Account creation is a modal component added inline to accounts.jsx that POSTs to `/accounts` and appends the result to local state.

**Tech Stack:** React (JSX/TSX), TypeScript (api.ts only), localStorage

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/lib/api.ts` | Add `AccountCreate` interface + `createAccount()` function |
| `frontend/src/screens/settings.jsx` | Add `selectedUserId` state, "Imported by" selector, write `fire.my_user_id` to localStorage after successful import |
| `frontend/src/App.tsx` | Read `my_user_id` from localStorage; pass `myUserId` prop to `TransactionsScreen` |
| `frontend/src/screens/transactions.jsx` | Derive `partnerUserId`; fix User filter, household filter, and Avatar mapping |
| `frontend/src/screens/accounts.jsx` | Add `createAccount` import, `showCreateModal` state, `+ Add account` button, `CreateAccountModal` component |

---

### Task 1: api.ts — add createAccount()

**Files:**
- Modify: `frontend/src/lib/api.ts`

The file already exports `AccountRead`. Add `AccountCreate` interface and `createAccount` function after the existing `getAccounts` export.

- [ ] **Step 1: Add AccountCreate interface and createAccount function**

Open `frontend/src/lib/api.ts`. After the line:
```ts
export const getAccounts = (activeOnly = false) =>
  api<AccountRead[]>(`/accounts${activeOnly ? '?active_only=true' : ''}`)
```

Add:
```ts
export interface AccountCreate {
  name: string
  type: string
  currency: string
  institution?: string
}

export const createAccount = (body: AccountCreate) =>
  api<AccountRead>('/accounts', { method: 'POST', body: JSON.stringify(body) })
```

- [ ] **Step 2: Verify TypeScript compiles**

Run from the project root:
```
npm run build --prefix frontend
```
Expected: build succeeds with no TypeScript errors. (Warnings about unused vars are OK.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add createAccount() to api.ts"
```

---

### Task 2: settings.jsx — userId selector + localStorage write

**Files:**
- Modify: `frontend/src/screens/settings.jsx`

The `ImportTab` function currently hardcodes `userId=1` in `importFile(file, selectedAccountId ?? 1, 1)`. We need to add:
1. `selectedUserId` state (default 1)
2. A "Imported by" UI in the right panel
3. Write `fire.my_user_id` to localStorage after a successful import

- [ ] **Step 1: Add selectedUserId state to ImportTab**

In `ImportTab()`, after the `selectedAccountId` state declaration (around line 49), add:
```js
const [selectedUserId, setSelectedUserId] = useState(1);
```

- [ ] **Step 2: Write userId to localStorage and pass to importFile**

In `handleFile`, replace:
```js
const log = await importFile(file, selectedAccountId ?? 1, 1);
```
With:
```js
const log = await importFile(file, selectedAccountId ?? 1, selectedUserId);
localStorage.setItem('fire.my_user_id', String(selectedUserId));
```

- [ ] **Step 3: Add "Imported by" selector to the right panel**

In the right-side card (the card that contains the `Target account` section), after the closing `</div>` of the accounts list section and before the card's closing `</div>`, add:

```jsx
<div style={{ marginTop: 16 }}>
  <label className="fld">Imported by</label>
  <div style={{ display: 'flex', gap: 8 }}>
    {[{ id: 1, label: 'You' }, { id: 2, label: 'Partner' }].map(u => (
      <button
        key={u.id}
        className={'btn ' + (selectedUserId === u.id ? 'primary' : 'ghost') + ' sm'}
        style={{ flex: 1, justifyContent: 'center' }}
        onClick={() => setSelectedUserId(u.id)}
      >
        {u.label}
      </button>
    ))}
  </div>
</div>
```

The right-side card in the JSX (line ~147) currently ends after the `accounts.length === 0` empty state block. The full card structure is:
```jsx
<div className="card tight">
  <label className="fld">Target account</label>
  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
    {accounts.map(...)}
    {accounts.length === 0 && (...)}
  </div>
  {/* ADD THE "Imported by" BLOCK HERE */}
</div>
```

- [ ] **Step 4: Verify the import tab renders correctly**

Start the frontend dev server:
```
npm run dev --prefix frontend
```
Navigate to Settings → Import tab. Confirm the right-side card now shows "Imported by" with "You" / "Partner" toggle buttons below the account list.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/screens/settings.jsx
git commit -m "feat: add userId selector to Import tab; write fire.my_user_id to localStorage"
```

---

### Task 3: App.tsx — read myUserId, pass to TransactionsScreen

**Files:**
- Modify: `frontend/src/App.tsx`

`App.tsx` already has a `ls(key, fallback)` helper that reads from `localStorage` with the `fire.` prefix. Use it to read `my_user_id` and pass it as a prop to `TransactionsScreen`.

- [ ] **Step 1: Add myUserId state**

In `App()`, after the `reviewCount` state (line 36), add:
```ts
const [myUserId] = useState(() => Number(ls('my_user_id', '1')))
```

- [ ] **Step 2: Pass myUserId to TransactionsScreen**

Replace:
```tsx
body = <TransactionsScreen {...common} initialFilter={params} registerSetReview={setReviewCount} />
```
With:
```tsx
body = <TransactionsScreen {...common} initialFilter={params} registerSetReview={setReviewCount} myUserId={myUserId} />
```

- [ ] **Step 3: Verify build**

```
npm run build --prefix frontend
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: read fire.my_user_id from localStorage in App; pass myUserId to TransactionsScreen"
```

---

### Task 4: transactions.jsx — fix User filter, household filter, Avatar

**Files:**
- Modify: `frontend/src/screens/transactions.jsx`

Currently the User filter compares `t.user_id` (integer from live API) against `'you'`/`'partner'` strings — always false. The household comparison has the same bug. The Avatar receives an integer instead of the `'you'`/`'partner'` string it expects.

- [ ] **Step 1: Accept myUserId prop with default**

Change the function signature from:
```js
export function TransactionsScreen({ go, currency, household, initialFilter, registerSetReview }) {
```
To:
```js
export function TransactionsScreen({ go, currency, household, initialFilter, registerSetReview, myUserId = 1 }) {
```

- [ ] **Step 2: Derive partnerUserId**

After the `acctMap` useMemo (line ~24), add:
```js
const partnerUserId = useMemo(() => {
  const other = tx.find(t => t.user_id !== myUserId);
  return other ? other.user_id : (myUserId === 1 ? 2 : 1);
}, [tx, myUserId]);
```

- [ ] **Step 3: Fix User filter in filtered useMemo**

In the `filtered` useMemo, find:
```js
if (fUser !== 'all' && t.user_id !== fUser) return false;
```
Replace with:
```js
if (fUser !== 'all') {
  const resolvedUser = fUser === 'you' ? myUserId : partnerUserId;
  if (t.user_id !== resolvedUser) return false;
}
```

- [ ] **Step 4: Fix household filter in filtered useMemo**

In the same `filtered` useMemo, find:
```js
if (household !== 'household' && t.user_id !== household) return false;
```
Replace with:
```js
if (household !== 'household') {
  const resolvedHousehold = household === 'you' ? myUserId : partnerUserId;
  if (t.user_id !== resolvedHousehold) return false;
}
```

- [ ] **Step 5: Fix Avatar user prop**

In the table `<tbody>`, find:
```jsx
<td className="c"><Avatar user={t.user_id} size={22} /></td>
```
Replace with:
```jsx
<td className="c"><Avatar user={t.user_id === myUserId ? 'you' : 'partner'} size={22} /></td>
```

- [ ] **Step 6: Manual verification**

With backend running and transactions loaded:
1. In DevTools console: `localStorage.setItem('fire.my_user_id', '1')`; reload. Transactions User filter "You" → should show rows where `user_id === 1`.
2. Change to `localStorage.setItem('fire.my_user_id', '2')`; reload. User filter "You" → should show rows where `user_id === 2`.
3. Avatar icons should display correctly (no blank/broken avatars).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/screens/transactions.jsx
git commit -m "fix: map you/partner string to integer user_id in Transactions filter and Avatar"
```

---

### Task 5: accounts.jsx — CreateAccountModal

**Files:**
- Modify: `frontend/src/screens/accounts.jsx`

- [ ] **Step 1: Add createAccount import**

At the top of `accounts.jsx`, change:
```js
import { getAccounts } from '../lib/api.ts';
```
To:
```js
import { getAccounts, createAccount } from '../lib/api.ts';
```

- [ ] **Step 2: Add showCreateModal state to AccountsScreen**

Inside `AccountsScreen()`, after the `liveAccounts` state (line ~24), add:
```js
const [showCreateModal, setShowCreateModal] = useState(false);
```

- [ ] **Step 3: Add "+ Add account" button to page-h**

In the `page-h` div, the current content is:
```jsx
<div className="page-h">
  <h1>Accounts & Net Worth</h1>
  <span className="sub">{liveAccounts.filter(a => a.is_active).length} active accounts · {currency} base</span>
</div>
```
Replace with:
```jsx
<div className="page-h">
  <h1>Accounts & Net Worth</h1>
  <span className="sub">{liveAccounts.filter(a => a.is_active).length} active accounts · {currency} base</span>
  <div style={{ marginLeft: 'auto' }}>
    <button className="btn ghost sm" onClick={() => setShowCreateModal(true)}>
      <Icon n="plus" s={15} />Add account
    </button>
  </div>
</div>
```

- [ ] **Step 4: Render modal at bottom of AccountsScreen**

At the very end of `AccountsScreen`'s return, just before the final closing `</div>`, add:
```jsx
{showCreateModal && (
  <CreateAccountModal
    onClose={() => setShowCreateModal(false)}
    onCreated={account => {
      setLiveAccounts(prev => [...prev, {
        id: account.id,
        name: account.name,
        type: account.type,
        orig_cur: account.currency,
        cls: typeToClass(account.type),
        base: 0,
        orig_bal: 0,
        is_active: account.is_active,
      }]);
    }}
  />
)}
```

- [ ] **Step 5: Add CreateAccountModal component**

At the end of the file (after the closing `}` of `AccountsScreen`), add:

```jsx
function CreateAccountModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('bank');
  const [acctCurrency, setAcctCurrency] = useState('EUR');
  const [institution, setInstitution] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const account = await createAccount({
        name: name.trim(),
        type,
        currency: acctCurrency.trim() || 'EUR',
        institution: institution.trim() || undefined,
      });
      onCreated(account);
      onClose();
    } catch (err) {
      setError(err.message || 'Could not connect to server');
      setSaving(false);
    }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="row" style={{ gap: 11, marginBottom: 18 }}>
          <span style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon n="wallet" s={20} c="var(--accent)" />
          </span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>New account</div>
            <div className="kpi-sub">Add a bank, brokerage, or asset account</div>
          </div>
          <button className="btn icon" style={{ marginLeft: 'auto', padding: 4, background: 'transparent', border: 0 }} onClick={onClose}>
            <Icon n="x" s={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="fld">Name *</label>
            <input className="inp" placeholder="e.g. Comdirect Checking" value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="fld">Type</label>
            <select className="inp" value={type} onChange={e => setType(e.target.value)}>
              {[['bank', 'Bank'], ['brokerage', 'Brokerage'], ['crypto', 'Crypto'], ['realestate', 'Real estate'], ['gold', 'Gold']].map(([v, l]) =>
                <option key={v} value={v}>{l}</option>
              )}
            </select>
          </div>
          <div>
            <label className="fld">Currency</label>
            <input className="inp mono" placeholder="EUR" value={acctCurrency} onChange={e => setAcctCurrency(e.target.value.toUpperCase())} maxLength={3} />
          </div>
          <div>
            <label className="fld">Institution <span className="fx">(optional)</span></label>
            <input className="inp" placeholder="e.g. Deutsche Bank" value={institution} onChange={e => setInstitution(e.target.value)} />
          </div>
        </div>

        {error && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--neg)', fontWeight: 600 }}>{error}</div>}

        <div className="row" style={{ gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={saving} onClick={handleSubmit}>
            {saving ? 'Saving…' : 'Create account'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

Note: The modal uses `useState` which is already imported at the top of the file. It uses `Icon` which is also already imported. `createAccount` is imported in Step 1.

- [ ] **Step 6: Manual verification**

With backend running:
1. Navigate to Accounts screen → confirm "+ Add account" button appears in the header.
2. Click it → modal opens with Name, Type, Currency, Institution fields.
3. Submit with empty name → "Name is required" error appears; modal stays open.
4. Fill in valid data → submit → new account card appears in the Accounts list immediately.
5. Kill the backend, try to create → "Could not connect to server" shown inside modal; modal stays open.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/screens/accounts.jsx
git commit -m "feat: add CreateAccountModal to Accounts screen"
```

---

### Task 6: Final build verification + push

- [ ] **Step 1: Full build**

```
npm run build --prefix frontend
```
Expected: exits 0, no TypeScript errors.

- [ ] **Step 2: Run backend tests (no Python changes, should still be 70 green)**

```
backend/.venv/Scripts/python -m pytest tests/ -q
```
Expected: 70 passed.

- [ ] **Step 3: Push to master**

```bash
git push origin master
```

- [ ] **Step 4: Update memory**

Update `C:\Users\hoang\.claude\projects\D--03-Claude-Code-financial-indpendent\memory\fi-tracker-progress.md`:
- Mark Plan 7 as DONE
- Update next candidates to Plan 8
