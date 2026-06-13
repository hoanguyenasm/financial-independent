# Plan 7 Design: User ID Mapping + Account Creation UI

Date: 2026-06-13

## Problem

Two usability gaps remain after Plan 6:

1. **Broken User filter** — live transactions store `user_id` as an integer (1, 2), but the Transactions screen filters by `'you'`/`'partner'` strings. The User dropdown does nothing with live data.
2. **No account creation UI** — accounts can only be created via direct API calls; there is no frontend form.

## Scope

Frontend-only changes. All required backend endpoints (POST `/accounts`, GET `/accounts`, etc.) already exist from Plan 1. No Python changes, no schema changes, no new Alembic migration.

## Architecture

### Files changed

| File | Change |
|------|--------|
| `frontend/src/lib/api.ts` | Add `createAccount()` POST function |
| `frontend/src/screens/settings.jsx` | Write `fi_my_user_id` to localStorage after successful import |
| `frontend/src/App.tsx` | Read `fi_my_user_id` from localStorage; derive `partnerUserId`; pass both as props |
| `frontend/src/screens/transactions.jsx` | Map `'you'`/`'partner'` to integer user ids in filter + household comparison + Avatar |
| `frontend/src/screens/accounts.jsx` | Add `+ Add account` button + `CreateAccountModal` component |

### Files unchanged

- All backend Python files
- `frontend/src/data.js` (mock data untouched)
- `frontend/src/screens/cashflow.jsx`
- `frontend/src/screens/dashboard.jsx`

## User ID Mapping

### Write (settings.jsx)

After a successful import response, store the selected user id:

```js
localStorage.setItem('fi_my_user_id', String(selectedUserId))
```

`selectedUserId` is already in state from Plan 6.

### Read (App.tsx)

On startup:

```ts
const myUserId = Number(localStorage.getItem('fi_my_user_id') ?? '1')
```

`partnerUserId` is derived at render time: the first distinct `user_id` seen in loaded transactions that is not `myUserId`. Falls back to `myUserId === 1 ? 2 : 1` before transactions load.

Both are passed as props to `TransactionsScreen`.

### Filter fix (transactions.jsx)

```js
// User dropdown filter
const resolvedId = fUser === 'you' ? myUserId : partnerUserId
if (fUser !== 'all' && t.user_id !== resolvedId) return false

// Household prop comparison (was: t.user_id !== household)
if (household !== 'household' && t.user_id !== myUserId) return false
```

Avatar column: map `t.user_id === myUserId ? 'you' : 'partner'` before passing to `<Avatar>`.

### Default behavior

If `fi_my_user_id` is missing from localStorage (never imported), `myUserId` defaults to 1. The User filter may show incorrect results until the user's first import — same situation as today, acceptable.

## Account Creation Modal

### api.ts addition

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

### CreateAccountModal component

Location: inline in `accounts.jsx`.

Fields:
- **Name** — required text input
- **Type** — select: `bank` / `brokerage` / `crypto` / `realestate` / `gold`
- **Currency** — text input, default `EUR`
- **Institution** — optional text input

On submit:
1. Client-side: require name is non-empty
2. Call `createAccount(body)`
3. On success: append returned account to `liveAccounts` state, close modal
4. On error: show inline error message, keep modal open (do not reset form)

Trigger: `+ Add account` button in the `page-h` header of `AccountsScreen`, styled as `btn ghost sm` matching the "Import statement" button in TransactionsScreen.

### Error states

| Condition | Behavior |
|-----------|----------|
| Name empty | Client validation, no API call |
| Backend offline | Catch block → "Could not connect to server" inside modal |
| Backend 400 (e.g. duplicate) | Error text shown inside modal |

## Testing

No automated tests added (backend unchanged). Manual verification:

1. Import a file with userId=2 selected → check `localStorage.fi_my_user_id === '2'` in DevTools
2. Transactions → User filter "You" → shows only rows where `user_id = 2`
3. Accounts → `+ Add account` → fill form → submit → new row appears without reload
4. Accounts → `+ Add account` with backend offline → error shown inside modal, modal stays open
