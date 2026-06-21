# Net Worth from Account Balances + AmEx Accounting — Design

**Date:** 2026-06-21
**Status:** Approved (pending spec review)

## Goal

Make the dashboard/Accounts net worth reflect reality instead of €0, by:
1. Auto-extracting each account's **closing balance** from its statement on import.
2. Computing net worth as **deposits + manual assets − credit-card liabilities**.
3. Letting the user **add/edit manual assets** (apartment, ETF portfolio value) in the UI.
4. Stopping AmEx double-counting: the monthly Comdirect→AmEx settlement is an internal
   **transfer**, not a second expense.

## Decisions (from brainstorm)

- Balances are **auto-extracted from statements** (latest statement per account wins).
- AmEx (credit card) balance is a **liability** that nets against cash.
- **Current** net worth now; historical trend deferred (the `NWSnapshot` table already
  exists for a later iteration).
- A UI **Add/Edit asset** form is in scope.
- ING genuinely holds ~€0 (rental in, transferred out) — a €0 balance there is correct.

## Background facts (verified against real 2026 data)

Closing-balance source per bank:

| Bank | Balance line |
|---|---|
| Comdirect (CSV) | `"Neuer Kontostand";"1.375,84 EUR";` (preamble) |
| Scalable | `Kontostand am 30.04.2026 1.075,16 EUR` (take the later date) |
| Trade Republic | `ENDSALDO` summary / last running `SALDO` |
| Revolut | `Schlusssaldo` summary / last `Kontostand` |
| ING | `Neuer Saldo 0,00` |
| AmEx | `Neuer Saldo` / `Zu zahlender Betrag` (amount owed) |

AmEx settlement debits already present in Comdirect (account 10): monthly
`Auftraggeber: AMERICAN EXPRESS EUROPE S.A.` (e.g. −€2,361.29 on 27 Feb, −€1,468.66 on
28 Apr). These must be categorized `transfer`, not expense.

Existing pieces reused: `assets` table + `/assets` CRUD (POST/GET/PATCH/DELETE);
`analytics.py` net_worth currently sums only assets; `account_router`, `from-tree`,
`seed_category_rules`, the transfer-exclusion in analytics.

## Scope

In scope: AmEx→transfer seed rule; `accounts.balance` + `balance_as_of` columns +
migration; per-bank balance extractor; from-tree wiring (latest-statement-wins); net
worth = deposits − liabilities + assets in `/analytics/summary`; Add/Edit asset UI.

Out of scope: historical net-worth trend/snapshots; live securities/portfolio valuation
(ETF market value is entered as a manual asset); multi-currency balance conversion (all
EUR here); deriving balances from transaction running sums (we use the printed closing
balance).

## Components

### 1. AmEx settlement rule (companion to Q1)
Add to `SEED_RULES` (in `app/services/category_seed.py`): `("American Express", "transfer")`
and `("AMERICAN EXPRESS", "transfer")` (expense-side category `transfer`, already
excluded from analytics). After seeding + recategorize, the Comdirect AmEx debits move
to `transfer` and drop out of expenses. The AmEx line items (on accounts 4/9) remain the
real expenses.

### 2. Account balance columns
Add to the `accounts` table (Alembic migration, chained from current head):
- `balance: Numeric(18,2)` nullable — the latest statement's closing balance (raw, as
  printed; for a credit card this is the amount owed).
- `balance_as_of: Date` nullable — the statement date that balance came from.

Extend `AccountRead` schema with both fields.

### 3. Balance extractor (`app/parsers/balance_extractor.py`)
`extract_balance(bank: str, text_lines: list[str]) -> float | None` — one regex branch
per bank (table above), returning the closing balance as a float (European number
parsing reused from the parsers). For Scalable, choose the `Kontostand am <date>` with
the **latest** date. For TR/Revolut, prefer the labeled `ENDSALDO`/`Schlusssaldo`
summary; the parsers' running balance is a fallback. Returns `None` if no balance line
is found (account simply keeps its prior balance).

This module is independent of the transaction parsers so it cannot disturb them.

### 4. from-tree wiring (latest-statement-wins)
In `/import/from-tree` (and the reset script), after a file is routed to an account and
parsed: compute `balance = extract_balance(bank, lines)` and
`as_of = max((r.date for r in rows), default=None)`. If `balance is not None` and `as_of`
is newer than the account's stored `balance_as_of` (or it's unset), update
`account.balance = balance` and `account.balance_as_of = as_of`. Re-imports and
out-of-order imports never regress the balance. Expose the per-account balance update in
the tree-import summary.

### 5. Net worth in `/analytics/summary`
Replace the assets-only `net_worth` with:
```
deposits    = Σ account.balance where type != "credit_card" and balance is not None
liabilities = Σ account.balance where type == "credit_card"  and balance is not None
assets_val  = Σ asset.current_value × ownership_pct/100  (existing)
net_worth   = deposits − liabilities + assets_val
```
(The AmEx owed amount is parsed as a positive number; net worth subtracts it. The exact
sign of the AmEx `Neuer Saldo` is validated during build and normalized so a balance
owed reduces net worth.) Manual asset values (apartment, ETF portfolio) come from the
`assets` table so cash-in-account is never double-counted with securities value.

### 6. Add/Edit asset UI
On the Accounts screen, add an **"Add asset"** button and an edit affordance on the
Holdings table rows, opening a modal (mirroring the existing "Add account" modal):
fields `symbol_or_name`, `asset_type` (stocks/realestate/cash/other), `current_value`,
`ownership_pct`, `currency` (default EUR), optional `expected_monthly_income`, and
`account_id` (which account it belongs to). Submits `POST /assets` (create) or
`PATCH /assets/{id}` (edit); refreshes the Holdings list and net worth.

## Data flow
```
from-tree(file)
  route → account; parse → rows
  balance = extract_balance(bank, lines); as_of = max(row.date)
  if as_of newer than account.balance_as_of: account.balance/balance_as_of = balance/as_of
analytics/summary:
  net_worth = Σ deposit balances − Σ credit-card balances + Σ asset values
```

## Error handling
- No balance line found → `extract_balance` returns None → account balance unchanged.
- Account with no imported statement → balance stays None → contributes 0 to net worth.
- Asset form validation: `current_value` numeric, `ownership_pct` 0–100; bad input shows
  an inline error, no write.

## Testing (TDD)
- `extract_balance`: one unit test per bank format (synthetic lines → expected float),
  incl. Scalable latest-date selection and a no-balance → None case.
- Latest-statement-wins: importing April then May sets the May balance; re-importing
  April does not regress it.
- Net worth: accounts with balances (incl. a credit_card) + assets →
  `deposits − liabilities + assets`, verified via `/analytics/summary`.
- AmEx→transfer: a Comdirect "American Express" debit categorizes as `transfer` and is
  excluded from `expense-by-category` / `monthly_expenses`.
- Frontend: asset form creates an asset (build/type-check green; manual UI verification
  in the preview).

## Verification (real data)
Re-run `reset_and_import_2026.py`; confirm each account shows a sensible balance
(Comdirect ≈ €1,375; ING ≈ €0; AmEx as a liability), net worth ≈ Σ balances + any
manually-added assets, and the AmEx Comdirect debits no longer count as expenses.
