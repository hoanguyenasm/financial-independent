# Net Worth from Account Balances + AmEx Accounting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute a real net worth = deposit balances − credit-card liabilities + manual assets, with balances auto-extracted from statements on import, plus an Add/Edit asset UI and the AmEx-settlement-as-transfer fix.

**Architecture:** Backend adds `accounts.balance`/`balance_as_of` columns, a per-bank `balance_extractor`, and updates them in the `/import/from-tree` flow (latest statement wins). `/analytics/summary` net worth sums signed balances + asset values. Frontend gains an Add/Edit asset modal. A seed rule makes Comdirect→AmEx debits transfers.

**Tech Stack:** Python 3.13, FastAPI, SQLAlchemy 2.x, Alembic, pytest; Vite + React + TS frontend.

## Global Constraints

- Base currency EUR; money is `float`/`Numeric`. Negative transaction amount = expense.
- Run backend from `backend/` with `.venv\Scripts\python.exe` / `.venv\Scripts\alembic.exe` (Windows/PowerShell).
- Current Alembic head: `c1d2e3f4a5b6` (new migration chains from it).
- Account types in DB: `checking`, `savings`, `investment`, `credit_card`. Only `credit_card` is a liability.
- Bank keys (from `account_router`): `comdirect|trade_republic|revolut|scalable|amex|ing`.
- Net worth = Σ(balance where type≠credit_card) − Σ(abs(balance) where type==credit_card) + Σ(asset.current_value×ownership_pct/100).
- `as_of` for a statement = max transaction date among its parsed rows.
- Reuse `_parse_amount_eu` (European number parsing) from `app/parsers/pdf_parser.py`.
- Real data at `G:\My Drive\12_Budget_2026`; Comdirect CSV at `…\Mai\Hoa\umsaetze_9774345955_20260621-1142.csv`.

---

### Task 1: AmEx settlement → transfer seed rule

**Files:**
- Modify: `backend/app/services/category_seed.py`
- Test: `backend/tests/test_import_service.py`

**Interfaces:**
- Consumes: `ImportService._categorize` (direction-aware; `transfer` is an expense-side category excluded from analytics).
- Produces: two new `SEED_RULES` entries mapping American Express to `transfer`.

- [ ] **Step 1: Write the failing test**

```python
# add to backend/tests/test_import_service.py
def test_amex_settlement_debit_is_transfer():
    from app.services.category_seed import SEED_RULES
    rules = [CategoryRule(pattern=p, category=c) for p, c in SEED_RULES]
    # Comdirect debit paying off the card must be a transfer, not an expense
    cat, review = ImportService._categorize(
        "Auftraggeber: AMERICAN EXPRESS EUROPE S.A. (Germany branch)", rules, -2361.29, "expense")
    assert cat == "transfer"
    assert review is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python.exe -m pytest tests/test_import_service.py::test_amex_settlement_debit_is_transfer -v`
Expected: FAIL — categorizes as `uncategorized` (no matching rule).

- [ ] **Step 3: Add the seed rules**

In `backend/app/services/category_seed.py`, add to the `SEED_RULES` list (expense side, near the mortgage rules):

```python
    # credit-card settlement pulled from the bank account = internal transfer, not expense
    ("American Express", "transfer"),
    ("AMERICAN EXPRESS", "transfer"),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv\Scripts\python.exe -m pytest tests/test_import_service.py -q`
Expected: PASS (new test + existing; `test_seed_is_idempotent` uses `len(SEED_RULES)` so it adapts).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/category_seed.py backend/tests/test_import_service.py
git commit -m "feat(categorize): AmEx settlement debit -> transfer (avoid expense double-count)"
```

---

### Task 2: Account balance columns + migration + schema

**Files:**
- Modify: `backend/app/models/account.py`
- Create: `backend/alembic/versions/d2e3f4a5b6c7_add_account_balance.py`
- Modify: `backend/app/schemas/account.py`
- Test: `backend/tests/test_accounts.py`

**Interfaces:**
- Produces: `Account.balance: Mapped[Optional[float]]` (Numeric(18,2)), `Account.balance_as_of: Mapped[Optional[date]]`. `AccountRead` exposes both (default None).

- [ ] **Step 1: Write the failing test**

```python
# add to backend/tests/test_accounts.py
def test_account_read_exposes_balance_fields(client):
    r = client.post("/accounts", json={"name": "Giro", "type": "checking", "currency": "EUR"})
    assert r.status_code == 201
    body = r.json()
    assert "balance" in body and body["balance"] is None
    assert "balance_as_of" in body and body["balance_as_of"] is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python.exe -m pytest tests/test_accounts.py::test_account_read_exposes_balance_fields -v`
Expected: FAIL — `balance` not in response.

- [ ] **Step 3a: Add model columns**

In `backend/app/models/account.py`, add the imports and columns:

```python
from sqlalchemy import String, Boolean, ForeignKey, Numeric, Date
from datetime import date
# ... inside class Account:
    balance: Mapped[Optional[float]] = mapped_column(Numeric(18, 2), nullable=True)
    balance_as_of: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
```

- [ ] **Step 3b: Create the migration**

Create `backend/alembic/versions/d2e3f4a5b6c7_add_account_balance.py`:

```python
"""add accounts.balance + balance_as_of

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-06-21
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "d2e3f4a5b6c7"
down_revision: Union[str, None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("balance", sa.Numeric(18, 2), nullable=True))
    op.add_column("accounts", sa.Column("balance_as_of", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("accounts", "balance_as_of")
    op.drop_column("accounts", "balance")
```

- [ ] **Step 3c: Extend AccountRead schema**

In `backend/app/schemas/account.py`, add to `AccountRead` (and the needed imports `from datetime import date`, `from typing import Optional`):

```python
    balance: Optional[float] = None
    balance_as_of: Optional[date] = None
```

- [ ] **Step 3d: Apply the migration**

Run: `.venv\Scripts\alembic.exe upgrade head`
Expected: `Running upgrade c1d2e3f4a5b6 -> d2e3f4a5b6c7`.

- [ ] **Step 4: Run tests**

Run: `.venv\Scripts\python.exe -m pytest tests/test_accounts.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/account.py backend/alembic/versions/d2e3f4a5b6c7_add_account_balance.py backend/app/schemas/account.py backend/tests/test_accounts.py
git commit -m "feat(accounts): add balance + balance_as_of columns"
```

---

### Task 3: Per-bank balance extractor

**Files:**
- Create: `backend/app/parsers/balance_extractor.py`
- Test: `backend/tests/test_balance_extractor.py`

**Interfaces:**
- Consumes: `_parse_amount_eu`, `_TR_AMT_PAT`, `_REV_TX` from `app/parsers/pdf_parser.py`.
- Produces: `extract_balance(bank: str, text_lines: list[str]) -> float | None` — the closing balance, or None if not found. For `credit_card`/amex the value is the amount owed (a positive number).

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_balance_extractor.py
from app.parsers.balance_extractor import extract_balance


def test_comdirect_neuer_kontostand():
    lines = ['"Neuer Kontostand";"1.375,84 EUR";', '"Alter Kontostand";"3.927,83 EUR";']
    assert extract_balance("comdirect", lines) == 1375.84


def test_scalable_latest_kontostand_am():
    lines = ["Kontostand am 01.04.2026 1.960,06 EUR", "Kontostand am 30.04.2026 1.075,16 EUR"]
    assert extract_balance("scalable", lines) == 1075.16


def test_ing_neuer_saldo():
    assert extract_balance("ing", ["Neuer Saldo 0,00 Euro"]) == 0.0


def test_amex_neuer_saldo_amount_owed():
    lines = ["Zu zahlender Betrag", "Neuer Saldo 295,36"]
    assert extract_balance("amex", lines) == 295.36


def test_trade_republic_last_running_balance():
    lines = ["12 Apr Zinsen 59,58€ 35.131,57€", "13 Apr Kauf 100,00€ 35.031,57€"]
    assert extract_balance("trade_republic", lines) == 35031.57


def test_revolut_last_balance():
    lines = ["01.04.2026 Salary 100,00€ 1.100,00€", "05.04.2026 Shop 20,00€ 1.080,00€"]
    assert extract_balance("revolut", lines) == 1080.00


def test_unknown_or_missing_returns_none():
    assert extract_balance("comdirect", ["no balance here"]) is None
    assert extract_balance("nonsense", ["whatever"]) is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python.exe -m pytest tests/test_balance_extractor.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the extractor**

Create `backend/app/parsers/balance_extractor.py`:

```python
import re
from datetime import datetime
from app.parsers.pdf_parser import _parse_amount_eu, _TR_AMT_PAT, _REV_TX

_AMOUNT = r"(-?[\d.]+,\d{2})"


def _last_match_balance(lines: list[str], pattern, group: int) -> float | None:
    last = None
    for line in lines:
        m = pattern.search(line)
        if m:
            last = m.group(group)
    return _parse_amount_eu(last) if last is not None else None


def extract_balance(bank: str, text_lines: list[str]) -> float | None:
    text = "\n".join(text_lines)
    if bank == "comdirect":
        m = re.search(r'Neuer Kontostand"?\s*;?\s*"?\s*' + _AMOUNT, text)
        return _parse_amount_eu(m.group(1)) if m else None
    if bank == "scalable":
        pairs = re.findall(r"Kontostand am (\d{2}\.\d{2}\.\d{4})\s+" + _AMOUNT, text)
        if not pairs:
            return None
        latest = max(pairs, key=lambda p: datetime.strptime(p[0], "%d.%m.%Y"))
        return _parse_amount_eu(latest[1])
    if bank == "ing":
        m = re.search(r"Neuer Saldo\s+" + _AMOUNT, text)
        return _parse_amount_eu(m.group(1)) if m else None
    if bank == "amex":
        m = re.search(r"Neuer Saldo\s+" + _AMOUNT, text) or re.search(r"Zu zahlender Betrag\s+" + _AMOUNT, text)
        return _parse_amount_eu(m.group(1)) if m else None
    if bank == "trade_republic":
        return _last_match_balance(text_lines, _TR_AMT_PAT, 2)
    if bank == "revolut":
        return _last_match_balance(text_lines, _REV_TX, 4)
    return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python.exe -m pytest tests/test_balance_extractor.py -v`
Expected: PASS (all 7).

Note: `_TR_AMT_PAT` group 2 and `_REV_TX` group 4 are the running-balance capture groups in `pdf_parser.py`. If a test fails because the real pattern groups differ, inspect those patterns and adjust the group index — do not change the parser.

- [ ] **Step 5: Commit**

```bash
git add backend/app/parsers/balance_extractor.py backend/tests/test_balance_extractor.py
git commit -m "feat(parsers): per-bank closing-balance extractor"
```

---

### Task 4: Wire balance extraction into from-tree (latest statement wins)

**Files:**
- Modify: `backend/app/routers/import_router.py`
- Modify: `backend/scripts/reset_and_import_2026.py`
- Test: `backend/tests/test_import_router.py`

**Interfaces:**
- Consumes: `extract_balance` (Task 3), `Account.balance`/`balance_as_of` (Task 2), existing `detect_bank`, `route_account`, `parse_csv`/`parse_pdf`.
- Produces: `/import/from-tree` updates each routed account's `balance`/`balance_as_of` when the statement's `as_of` (max row date) is newer than the stored value; per-file summary includes `"balance"`.

- [ ] **Step 1: Write the failing test**

A full HTTP from-tree test would need real statement files we don't fixture, so the
"latest statement wins" decision is extracted into a pure helper `_newer(as_of, stored)`
and tested directly. Add to `backend/tests/test_import_router.py`:

```python
from app.routers.import_router import _newer
from datetime import date

def test_newer_balance_gate():
    assert _newer(date(2026, 5, 1), None) is True               # no prior -> update
    assert _newer(date(2026, 5, 1), date(2026, 4, 1)) is True   # newer -> update
    assert _newer(date(2026, 4, 1), date(2026, 5, 1)) is False  # older -> keep
    assert _newer(None, date(2026, 4, 1)) is False              # no as_of -> keep
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python.exe -m pytest tests/test_import_router.py::test_newer_balance_gate -v`
Expected: FAIL — `_newer` not defined.

- [ ] **Step 3a: Add the gate helper + wiring in import_router.py**

Add imports near the top of `backend/app/routers/import_router.py`:

```python
from datetime import date
from app.parsers.balance_extractor import extract_balance
from app.models import Account
```

Add the pure helper at module level:

```python
def _newer(as_of: date | None, stored: date | None) -> bool:
    if as_of is None:
        return False
    return stored is None or as_of > stored
```

Inside `import_from_tree`, after a file is parsed and `account_id` resolved (the
non-None branch, right after `ImportService.run(...)` returns `log`), add:

```python
            bal = extract_balance(bank, lines)
            as_of = max((r.date for r in rows), default=None)
            if bal is not None and account_id is not None:
                acct = db.get(Account, account_id)
                if acct is not None and _newer(as_of, acct.balance_as_of):
                    acct.balance = bal
                    acct.balance_as_of = as_of
                    db.commit()
            # include in summary entry:
            summary[-1]["balance"] = bal
```

(Place the `summary[-1]["balance"] = bal` only when a summary entry was just appended for
this file; if your summary structure differs, attach `balance` to the same dict you
append for the imported file.)

- [ ] **Step 3b: Mirror the wiring in the reset script**

In `backend/scripts/reset_and_import_2026.py`, in the per-file loop after
`ImportService.run(...)`, add the same balance update:

```python
    from app.parsers.balance_extractor import extract_balance
    from app.models import Account
    bal = extract_balance(bank, lines)
    as_of = max((r.date for r in rows), default=None)
    if bal is not None and acc is not None:
        a = db.get(Account, acc)
        if a is not None and (a.balance_as_of is None or (as_of is not None and as_of > a.balance_as_of)):
            a.balance = bal; a.balance_as_of = as_of; db.commit()
            print(f"   balance[{acc}] = {bal} as of {as_of}")
```

- [ ] **Step 4: Run tests**

Run: `.venv\Scripts\python.exe -m pytest tests/test_import_router.py -q`
Expected: PASS. Also confirm app imports: `.venv\Scripts\python.exe -c "from app.main import app; print('ok')"`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/import_router.py backend/scripts/reset_and_import_2026.py backend/tests/test_import_router.py
git commit -m "feat(import): update account balance from statements (latest wins)"
```

---

### Task 5: Net worth from balances in /analytics/summary

**Files:**
- Modify: `backend/app/routers/analytics.py`
- Test: `backend/tests/test_analytics.py`

**Interfaces:**
- Consumes: `Account.balance`/`type`, `Asset.current_value`/`ownership_pct`.
- Produces: `/analytics/summary` `net_worth` = Σ(deposit balances) − Σ(abs credit-card balances) + Σ(asset values).

- [ ] **Step 1: Write the failing test**

```python
# add to backend/tests/test_analytics.py
def test_net_worth_from_balances_and_assets(client):
    from app.database import SessionLocal
    from app.models import Account, Asset
    db = SessionLocal()
    db.add(Account(name="Giro", type="checking", currency="EUR", balance=1000.00))
    db.add(Account(name="Broker", type="investment", currency="EUR", balance=500.00))
    db.add(Account(name="AmEx", type="credit_card", currency="EUR", balance=300.00))  # owed
    acc = Account(name="RE", type="checking", currency="EUR")
    db.add(acc); db.commit()
    db.add(Asset(account_id=acc.id, symbol_or_name="Apartment", asset_type="realestate",
                 quantity=1, current_value=236000.00, currency="EUR", ownership_pct=100.0))
    db.commit(); db.close()

    nw = client.get("/analytics/summary").json()["net_worth"]
    # 1000 + 500 - 300 + 236000 = 237200
    assert nw == 237200.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python.exe -m pytest tests/test_analytics.py::test_net_worth_from_balances_and_assets -v`
Expected: FAIL — current net_worth only counts assets (236000), not balances.

- [ ] **Step 3: Update the summary net worth**

In `backend/app/routers/analytics.py`, add `Account` to the models import
(`from app.models import Asset, Transaction, FIGoal, Account`) and replace the `net_worth`
computation in `summary()`:

```python
    accounts = db.query(Account).all()
    deposits = sum(float(a.balance) for a in accounts
                   if a.balance is not None and a.type != "credit_card")
    liabilities = sum(abs(float(a.balance)) for a in accounts
                      if a.balance is not None and a.type == "credit_card")
    assets_val = sum(
        float(a.current_value) * float(a.ownership_pct) / 100.0
        for a in db.query(Asset).all() if a.current_value is not None
    )
    net_worth = deposits - liabilities + assets_val
```

- [ ] **Step 4: Run tests**

Run: `.venv\Scripts\python.exe -m pytest tests/test_analytics.py -q`
Expected: PASS (new + existing; existing `test_summary` that adds an asset still works because deposits/liabilities are 0 when no balances set).

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/analytics.py backend/tests/test_analytics.py
git commit -m "feat(analytics): net worth = deposits - credit-card liabilities + assets"
```

---

### Task 6: Add/Edit asset UI

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/screens/accounts.jsx`
- Test: `frontend/` build (type-check) + manual preview verification

**Interfaces:**
- Consumes: existing `getAssets`, `AssetRead`; the `CreateAccountModal` pattern in `accounts.jsx`.
- Produces: `createAsset(payload)` + `updateAsset(id, payload)` in `api.ts`; an `AssetModal` in `accounts.jsx` opened by an "Add asset" button (and edit on a row).

- [ ] **Step 1: Add API functions**

In `frontend/src/lib/api.ts`, after the `getAssets` definition, add:

```ts
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
```

(Match the exact shape of the existing `api()` helper calls in this file — if `api` takes
`(path, init)`, the above is correct; if it differs, follow the existing `createAccount`
call's style verbatim.)

- [ ] **Step 2: Add the AssetModal + button in accounts.jsx**

Import the new functions:

```jsx
import { getAccounts, createAccount, getAssets, getNWSnapshots, createAsset, updateAsset } from '../lib/api.ts';
```

Add state near the other modal state (`showCreateModal`): `const [assetModal, setAssetModal] = useState(null);`
(`null` = closed, `{}` = add, `{...asset}` = edit).

Add an "Add asset" button in the Holdings card header (mirror the "Add account" button at
line ~129, `<Icon n="plus" .../>Add asset`), wired to `onClick={() => setAssetModal({})}`.
Render the modal when open (near the `CreateAccountModal` render at ~197):

```jsx
{assetModal && (
  <AssetModal
    initial={assetModal}
    accounts={liveAccounts}
    onClose={() => setAssetModal(null)}
    onSaved={(a) => { setAssetModal(null); getAssets().then(setLiveAssets); }}
  />
)}
```

Define `AssetModal` (mirror `CreateAccountModal` at line ~262):

```jsx
function AssetModal({ initial, accounts, onClose, onSaved }) {
  const editing = initial && initial.id;
  const [name, setName] = useState(initial.symbol_or_name || '');
  const [type, setType] = useState(initial.asset_type || 'stocks');
  const [value, setValue] = useState(initial.current_value ?? '');
  const [ownership, setOwnership] = useState(initial.ownership_pct ?? 100);
  const [currency, setCurrency] = useState(initial.currency || 'EUR');
  const [accountId, setAccountId] = useState(initial.account_id || (accounts[0] && accounts[0].id) || 1);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    const v = parseFloat(value), o = parseFloat(ownership);
    if (!name.trim()) return setError('Name required');
    if (Number.isNaN(v)) return setError('Value must be a number');
    if (Number.isNaN(o) || o < 0 || o > 100) return setError('Ownership must be 0–100');
    setSaving(true); setError('');
    try {
      const payload = { account_id: Number(accountId), symbol_or_name: name.trim(),
        asset_type: type, current_value: v, ownership_pct: o, currency, quantity: 1 };
      const saved = editing ? await updateAsset(initial.id, payload) : await createAsset(payload);
      onSaved(saved);
    } catch (e) { setError(String(e)); setSaving(false); }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{editing ? 'Edit asset' : 'Add asset'}</h3>
        <input placeholder="Name (e.g. Stuttgart apartment)" value={name} onChange={e => setName(e.target.value)} />
        <select value={type} onChange={e => setType(e.target.value)}>
          {['stocks', 'realestate', 'crypto', 'gold', 'cash', 'other'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input placeholder="Current value" value={value} onChange={e => setValue(e.target.value)} />
        <input placeholder="Ownership %" value={ownership} onChange={e => setOwnership(e.target.value)} />
        <select value={accountId} onChange={e => setAccountId(e.target.value)}>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {error && <div className="err" style={{ color: 'var(--neg)' }}>{error}</div>}
        <div className="row">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={saving} onClick={submit}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
```

(Use the same CSS class names the existing `CreateAccountModal` uses — open that
component first and match its markup/classes exactly so styling is consistent.)

- [ ] **Step 3: Type-check / build**

Run: `npm run build --prefix frontend`
Expected: build succeeds (no TS errors).

- [ ] **Step 4: Manual preview verification**

Start preview, open Accounts, click "Add asset", create "Stuttgart apartment" realestate
€236000 100% → it appears in Holdings and net worth increases. Edit it → value updates.
Capture a screenshot.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/screens/accounts.jsx
git commit -m "feat(accounts): add/edit asset modal"
```

---

### Task 7: Real-data verification

**Files:**
- None (operational verification using the existing reset script).

- [ ] **Step 1: Back up DB**

From `backend/`: `copy fi_tracker.db fi_tracker.db.pre-balances.bak`

- [ ] **Step 2: Re-run the import**

Run: `.venv\Scripts\python.exe -m scripts.reset_and_import_2026`
Capture the per-file output, including the new `balance[acc] = …` lines.

- [ ] **Step 3: Verify balances + net worth**

Run:
```bash
.venv\Scripts\python.exe -c "import sqlite3; c=sqlite3.connect('fi_tracker.db'); [print(r) for r in c.execute('select id,name,type,balance,balance_as_of from accounts order by id')]"
```
Expected: Comdirect (Hoa) balance ≈ 1375.84; ING ≈ 0; Scalable/TR/Revolut sensible; AmEx accounts show an owed amount.

Restart backend, then:
```bash
.venv\Scripts\python.exe -c "import requests; print(requests.get('http://127.0.0.1:8000/analytics/summary').json())"
```
Expected: `net_worth` ≈ Σ deposit balances − AmEx owed (+ any manually-added assets), a finite sensible number (no longer 0 once balances exist). Confirm AmEx Comdirect debits are NOT in `expense-by-category` (category `transfer`).

- [ ] **Step 4: Verify in UI**

Reload preview, Accounts + Dashboard: balances show per account, net worth reflects them. Screenshot as proof.

- [ ] **Step 5: Commit (if the script's balance prints were added in Task 4, nothing new here)**

No commit needed unless verification surfaced a fix.

---

## Self-Review

**Spec coverage:** AmEx→transfer rule (T1) ✓; balance columns+migration (T2) ✓; per-bank extractor (T3) ✓; from-tree latest-wins wiring + reset script (T4) ✓; net worth deposits−liabilities+assets (T5) ✓; Add/Edit asset UI (T6) ✓; real-data verification incl. balances + AmEx exclusion (T7) ✓. ING-€0 handled (extractor returns 0.0, test pins it).

**Placeholder scan:** Task 4 Step 1 contains an exploratory first draft followed by a concrete `_newer` unit test — the concrete test is the one to implement; the note explains why the HTTP-level test isn't fixtured. No TODO/TBD left in implementable steps.

**Type consistency:** `extract_balance(bank, text_lines) -> float|None` consistent T3→T4. `_newer(as_of, stored)->bool` defined+used T4. `Account.balance`/`balance_as_of` consistent T2→T4→T5. Net-worth formula matches Global Constraints and T5 code. `createAsset`/`updateAsset` defined T6 api.ts, used T6 modal.
