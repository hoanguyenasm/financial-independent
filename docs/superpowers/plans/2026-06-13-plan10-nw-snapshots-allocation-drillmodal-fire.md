# Plan 10: NW Snapshots + Allocation + DrillModal + FIRE Savings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the last four mock data areas: FIRE scenario slider, asset allocation donut, cashflow drill-down transactions, and net-worth trend charts.

**Architecture:** One new backend model+router (NWSnapshot), one field added to /analytics/summary, one optional param added to /transactions, and three frontend screens updated. No new screens. All changes fall back to mock data when backend is offline or empty.

**Tech Stack:** FastAPI + SQLAlchemy + Alembic (backend), React + Vite + TypeScript (frontend), SQLite

---

### Task 1: Backend — add base_monthly_savings to /analytics/summary

**Files:**
- Modify: `backend/app/routers/analytics.py`
- Modify: `backend/tests/test_analytics.py`

- [ ] **Step 1: Update test_summary_empty_db**

In `backend/tests/test_analytics.py`, add `"base_monthly_savings": 0.0` to the expected dict in `test_summary_empty_db`:

```python
def test_summary_empty_db(client):
    s = client.get("/analytics/summary").json()
    assert s == {
        "net_worth": 0.0, "passive_income_monthly": 0.0,
        "monthly_expenses": 0.0, "savings_rate": 0.0, "needs_review": 0,
        "fi_target": 0.0, "base_monthly_savings": 0.0,
    }
```

- [ ] **Step 2: Run test to verify it fails**

```
cd backend && .venv\Scripts\python -m pytest tests/test_analytics.py::test_summary_empty_db -v
```
Expected: FAIL — missing key `base_monthly_savings`

- [ ] **Step 3: Add base_monthly_savings to summary endpoint**

In `backend/app/routers/analytics.py`, in the `summary()` function, change the return dict to add `base_monthly_savings`. The value is `(income - expenses) / 12` using the already-computed `income` and `expenses` variables:

```python
    return {
        "net_worth": round(net_worth, 2),
        "passive_income_monthly": round(passive / 12, 2),
        "monthly_expenses": round(expenses / 12, 2),
        "savings_rate": round((income - expenses) / income, 4) if income > 0 else 0.0,
        "needs_review": needs_review,
        "fi_target": round(fi_target, 2),
        "base_monthly_savings": round((income - expenses) / 12, 2) if income > 0 else 0.0,
    }
```

- [ ] **Step 4: Update test_summary to assert base_monthly_savings**

In `backend/tests/test_analytics.py`, add an assertion at the end of `test_summary`:

```python
    # income=6240, expenses=2410, so (6240-2410)/12 = 319.17
    assert s["base_monthly_savings"] == round((6240 - 2410) / 12, 2)
```

- [ ] **Step 5: Run all analytics tests**

```
cd backend && .venv\Scripts\python -m pytest tests/test_analytics.py -v
```
Expected: All pass

- [ ] **Step 6: Commit**

```
git add backend/app/routers/analytics.py backend/tests/test_analytics.py
git commit -m "feat: add base_monthly_savings to /analytics/summary"
```

---

### Task 2: Backend — NWSnapshot model + migration + router

**Files:**
- Create: `backend/app/models/nw_snapshot.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/alembic/versions/a2c3d4e5f6a7_add_nw_snapshots.py`
- Create: `backend/app/routers/nw_snapshots.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_nw_snapshots.py`

- [ ] **Step 1: Create the NWSnapshot model**

Create `backend/app/models/nw_snapshot.py`:

```python
from sqlalchemy import Date, Float
from sqlalchemy.orm import Mapped, mapped_column
from datetime import date
from .base import Base


class NWSnapshot(Base):
    __tablename__ = "nw_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, unique=True, index=True)
    net_worth: Mapped[float] = mapped_column(Float)
```

- [ ] **Step 2: Register model in __init__.py**

In `backend/app/models/__init__.py`:

```python
from .base import Base
from .user import User
from .account import Account
from .transaction import Transaction
from .asset import Asset
from .fi_goal import FIGoal
from .category_rule import CategoryRule
from .fx_rate import FXRate
from .import_log import ImportLog
from .nw_snapshot import NWSnapshot

__all__ = ["Base", "User", "Account", "Transaction", "Asset", "FIGoal",
           "CategoryRule", "FXRate", "ImportLog", "NWSnapshot"]
```

- [ ] **Step 3: Write the failing test**

Create `backend/tests/test_nw_snapshots.py`:

```python
def test_nw_snapshot_capture_and_list(client):
    # create an account and asset
    user = client.post("/users", json={"name": "Hoa", "email": "hoa@example.com"}).json()
    account = client.post("/accounts", json={"name": "Giro", "type": "checking", "currency": "EUR"}).json()
    client.post("/assets", json={
        "account_id": account["id"],
        "symbol_or_name": "VWCE",
        "asset_type": "etf",
        "currency": "EUR",
        "current_value": 50000.0,
        "ownership_pct": 100.0,
    })

    # capture snapshot
    r = client.post("/nw-snapshots")
    assert r.status_code == 201
    snap = r.json()
    assert snap["net_worth"] == 50000.0

    # list returns 1 entry
    r2 = client.get("/nw-snapshots")
    assert r2.status_code == 200
    assert len(r2.json()) == 1
    assert r2.json()[0]["net_worth"] == 50000.0


def test_nw_snapshot_upserts_same_day(client):
    account = client.post("/accounts", json={"name": "Giro", "type": "checking", "currency": "EUR"}).json()
    client.post("/assets", json={
        "account_id": account["id"],
        "symbol_or_name": "VWCE",
        "asset_type": "etf",
        "currency": "EUR",
        "current_value": 50000.0,
        "ownership_pct": 100.0,
    })
    client.post("/nw-snapshots")

    # add another asset and re-capture
    client.post("/assets", json={
        "account_id": account["id"],
        "symbol_or_name": "BTC",
        "asset_type": "crypto",
        "currency": "EUR",
        "current_value": 10000.0,
        "ownership_pct": 100.0,
    })
    client.post("/nw-snapshots")

    # still only 1 snapshot (upserted)
    snaps = client.get("/nw-snapshots").json()
    assert len(snaps) == 1
    assert snaps[0]["net_worth"] == 60000.0
```

- [ ] **Step 4: Run test to verify it fails**

```
cd backend && .venv\Scripts\python -m pytest tests/test_nw_snapshots.py -v
```
Expected: FAIL with 404 (route not found)

- [ ] **Step 5: Create Alembic migration**

Create `backend/alembic/versions/a2c3d4e5f6a7_add_nw_snapshots.py`:

```python
"""add nw_snapshots table

Revision ID: a2c3d4e5f6a7
Revises: b617f50e886c
Create Date: 2026-06-13 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a2c3d4e5f6a7'
down_revision: Union[str, None] = 'b617f50e886c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'nw_snapshots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('net_worth', sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('date'),
    )
    op.create_index('ix_nw_snapshots_date', 'nw_snapshots', ['date'])


def downgrade() -> None:
    op.drop_index('ix_nw_snapshots_date', table_name='nw_snapshots')
    op.drop_table('nw_snapshots')
```

- [ ] **Step 6: Create the router**

Create `backend/app/routers/nw_snapshots.py`:

```python
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import date
from app.database import get_db
from app.models import Asset, NWSnapshot

router = APIRouter(prefix="/nw-snapshots", tags=["nw-snapshots"])


def _current_net_worth(db: Session) -> float:
    return sum(
        float(a.current_value) * float(a.ownership_pct) / 100.0
        for a in db.query(Asset).all()
        if a.current_value is not None
    )


@router.post("", status_code=201)
def capture_snapshot(db: Session = Depends(get_db)):
    net_worth = _current_net_worth(db)
    today = date.today()
    existing = db.query(NWSnapshot).filter(NWSnapshot.date == today).first()
    if existing:
        existing.net_worth = net_worth
    else:
        db.add(NWSnapshot(date=today, net_worth=net_worth))
    db.commit()
    return {"date": str(today), "net_worth": net_worth}


@router.get("")
def list_snapshots(limit: int = Query(default=24, ge=1, le=120), db: Session = Depends(get_db)):
    rows = db.query(NWSnapshot).order_by(NWSnapshot.date.desc()).limit(limit).all()
    return [{"id": r.id, "date": str(r.date), "net_worth": float(r.net_worth)} for r in reversed(rows)]
```

- [ ] **Step 7: Register router in main.py**

In `backend/app/main.py`:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import users, accounts, transactions, assets, fi_goals, settings, category_rules, fx_rates, analytics
from app.routers.import_router import router as import_router
from app.routers.nw_snapshots import router as nw_snapshots_router

app = FastAPI(title="FI Tracker", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(accounts.router)
app.include_router(transactions.router)
app.include_router(assets.router)
app.include_router(fi_goals.router)
app.include_router(settings.router)
app.include_router(category_rules.router)
app.include_router(fx_rates.router)
app.include_router(analytics.router)
app.include_router(import_router)
app.include_router(nw_snapshots_router)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 8: Run tests**

```
cd backend && .venv\Scripts\python -m pytest tests/test_nw_snapshots.py -v
```
Expected: Both tests pass

- [ ] **Step 9: Run full suite**

```
cd backend && .venv\Scripts\python -m pytest tests/ -q
```
Expected: 74 passed (72 + 2 new)

- [ ] **Step 10: Commit**

```
git add backend/app/models/nw_snapshot.py backend/app/models/__init__.py backend/alembic/versions/a2c3d4e5f6a7_add_nw_snapshots.py backend/app/routers/nw_snapshots.py backend/app/main.py backend/tests/test_nw_snapshots.py
git commit -m "feat: add NWSnapshot model + POST/GET /nw-snapshots endpoint"
```

---

### Task 3: Frontend api.ts — update getTransactions + add NWSnapshot functions

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Update getTransactions to accept optional category**

Replace the existing `getTransactions` function:

```ts
export const getTransactions = (limit = 500, category?: string) => {
  const q = new URLSearchParams({ limit: String(limit) })
  if (category) q.set('category', category)
  return api<TransactionRead[]>(`/transactions?${q}`)
}
```

- [ ] **Step 2: Add NWSnapshot types and functions**

Append to `frontend/src/lib/api.ts`:

```ts
export interface NWSnapshotRead {
  id: number
  date: string   // "YYYY-MM-DD"
  net_worth: number
}

export const captureNWSnapshot = () =>
  api<NWSnapshotRead>('/nw-snapshots', { method: 'POST' })

export const getNWSnapshots = (limit = 24) =>
  api<NWSnapshotRead[]>(`/nw-snapshots?limit=${limit}`)
```

- [ ] **Step 3: Add base_monthly_savings to AnalyticsSummary interface**

In the existing `AnalyticsSummary` interface, add the new field:

```ts
export interface AnalyticsSummary {
  net_worth: number
  passive_income_monthly: number
  monthly_expenses: number
  savings_rate: number          // fraction 0–1
  needs_review: number
  fi_target: number
  base_monthly_savings: number
}
```

- [ ] **Step 4: Build to verify no TypeScript errors**

```
npm run build --prefix frontend
```
Expected: Clean build

- [ ] **Step 5: Commit**

```
git add frontend/src/lib/api.ts
git commit -m "feat: update api.ts — getTransactions category param, NWSnapshot, base_monthly_savings"
```

---

### Task 4: Frontend — Dashboard FIRE scenario + hero NW chart

**Files:**
- Modify: `frontend/src/screens/dashboard.jsx`

- [ ] **Step 1: Add imports and new state**

In `frontend/src/screens/dashboard.jsx`, change the import line:

```js
import { getAnalyticsSummary, captureNWSnapshot, getNWSnapshots } from '../lib/api.ts';
```

Add state after the existing `fiTarget` state:

```js
  const [baseMonthlySavings, setBaseMonthlySavings] = useState(S.base_monthly_savings);
  const [liveNW, setLiveNW] = useState([]);
```

- [ ] **Step 2: Extend the analytics useEffect and add NW snapshot fetch**

Replace the existing `useEffect` with:

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
        if (s.base_monthly_savings > 0) setBaseMonthlySavings(s.base_monthly_savings);
      })
      .catch(() => {});
    captureNWSnapshot().catch(() => {});
    getNWSnapshots(24).then(snaps => {
      if (snaps.length >= 2) setLiveNW(snaps);
    }).catch(() => {});
  }, []);
```

- [ ] **Step 3: Replace S.base_monthly_savings in FIRE calculations**

Replace these two lines:

```js
  const baseN = useMemo(() => FIRE.monthsToFI(S.base_monthly_savings), []);
  const [extra, setExtra] = useState(0);
  const n = useMemo(() => FIRE.monthsToFI(S.base_monthly_savings + extra), [extra]);
```

With:

```js
  const baseN = useMemo(() => FIRE.monthsToFI(baseMonthlySavings), [baseMonthlySavings]);
  const [extra, setExtra] = useState(0);
  const n = useMemo(() => FIRE.monthsToFI(baseMonthlySavings + extra), [baseMonthlySavings, extra]);
```

- [ ] **Step 4: Wire hero AreaChart to live NW snapshots**

In the hero section, replace the AreaChart line:

```js
          <AreaChart id="hero" values={DATA.NW_SERIES.map(p => p.value)} h={96}
            color="var(--accent)" target={fiTarget} targetLabel={MC(fiTarget) + ' · FI'} gridY={2} max={fiTarget * 1.04} />
```

With:

```js
          <AreaChart id="hero"
            values={liveNW.length >= 2 ? liveNW.map(s => s.net_worth) : DATA.NW_SERIES.map(p => p.value)}
            h={96} color="var(--accent)" target={fiTarget} targetLabel={MC(fiTarget) + ' · FI'} gridY={2} max={fiTarget * 1.04} />
```

- [ ] **Step 5: Build to verify**

```
npm run build --prefix frontend
```
Expected: Clean build

- [ ] **Step 6: Commit**

```
git add frontend/src/screens/dashboard.jsx
git commit -m "feat: wire Dashboard FIRE scenario and hero chart to live data"
```

---

### Task 5: Frontend — Accounts screen allocation donut + NW trend chart

**Files:**
- Modify: `frontend/src/screens/accounts.jsx`

- [ ] **Step 1: Add import and NW snapshot state**

In `frontend/src/screens/accounts.jsx`, change the import:

```js
import { getAccounts, createAccount, getAssets, getNWSnapshots } from '../lib/api.ts';
```

Add state after `liveAssets`:

```js
  const [liveNW, setLiveNW] = useState([]);
```

- [ ] **Step 2: Fetch NW snapshots in useEffect**

In the existing `useEffect`, add after the `getAssets` call:

```js
    getNWSnapshots(24).then(snaps => {
      if (snaps.length >= 2) setLiveNW(snaps);
    }).catch(() => {});
```

- [ ] **Step 3: Build nw series and replace DATA.NW_SERIES**

Replace:

```js
  const nw = DATA.NW_SERIES;
  const series = range === '12' ? nw.slice(-12) : nw;
```

With:

```js
  const nw = liveNW.length >= 2
    ? liveNW.map(s => {
        const d = new Date(s.date);
        return { label: DATA.MONTHS[d.getMonth()], year: d.getFullYear(), value: s.net_worth };
      })
    : DATA.NW_SERIES;
  const series = range === '12' ? nw.slice(-12) : nw;
```

Note: `DATA.MONTHS` is already available via the `DATA` import.

- [ ] **Step 4: Compute live allocation from liveAssets**

Replace:

```js
  const groups = [
    { key: 'stocks', label: 'Stocks & ETFs', items: assets.filter(a => a.type === 'stocks') },
    ...
  ];
```

Keep the `groups` array as-is (it's for the Holdings table). Add `liveAllocation` computed separately for the donut:

Add after the `groups` array definition:

```js
  const ALLOC_META = {
    stocks:     { label: 'Stocks & ETFs', color: 'var(--c-stocks)' },
    realestate: { label: 'Real estate',   color: 'var(--c-realestate)' },
    crypto:     { label: 'Crypto',        color: 'var(--c-crypto)' },
    gold:       { label: 'Gold',          color: 'var(--c-gold)' },
    cash:       { label: 'Cash & savings',color: 'var(--c-cash)' },
  };
  const liveAllocation = React.useMemo(() => {
    if (liveAssets === DATA.ASSETS) return DATA.ALLOCATION;
    const totals = {};
    for (const a of liveAssets) {
      const rawType = 'symbol_or_name' in a ? a.asset_type : a.type;
      const key = ['etf','stock','bond'].includes(rawType) ? 'stocks'
        : rawType === 'real_estate' ? 'realestate'
        : ['crypto'].includes(rawType) ? 'crypto'
        : rawType === 'gold' ? 'gold'
        : 'cash';
      const val = (('current_value' in a ? a.current_value : a.qty * a.price) ?? 0)
        * (('ownership_pct' in a ? a.ownership_pct : a.ownership) ?? 100) / 100;
      totals[key] = (totals[key] ?? 0) + val;
    }
    return Object.entries(totals)
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({ key, value, ...ALLOC_META[key] ?? { label: key, color: '#888' } }))
      .sort((a, b) => b.value - a.value);
  }, [liveAssets]);
```

- [ ] **Step 5: Replace DATA.ALLOCATION in JSX**

In the donut and legend, replace all `DATA.ALLOCATION` with `liveAllocation`:

The donut segment line:
```js
            <Donut segments={liveAllocation.map(a => ({ value: a.value, color: a.color, label: a.label }))} size={176} stroke={25}
```

The legend map:
```js
            {liveAllocation.map(a => (
              <div key={a.key} className="legend-row" style={{ justifyContent: 'space-between' }}>
                <span className="legend-row"><i style={{ background: a.color }} />{a.label}</span>
                <span className="row" style={{ gap: 10 }}><span className="mono" style={{ color: 'var(--text-3)', fontSize: 12 }}>{Math.round(a.value / endV * 100)}%</span><span className="mono" style={{ fontWeight: 700 }}>{MC(a.value)}</span></span>
              </div>
            ))}
```

- [ ] **Step 6: Build to verify**

```
npm run build --prefix frontend
```
Expected: Clean build

- [ ] **Step 7: Commit**

```
git add frontend/src/screens/accounts.jsx
git commit -m "feat: wire Accounts allocation donut and NW trend chart to live data"
```

---

### Task 6: Frontend — Cashflow DrillModal live transactions

**Files:**
- Modify: `frontend/src/screens/cashflow.jsx`

- [ ] **Step 1: Add import**

In `frontend/src/screens/cashflow.jsx`, change the import line:

```js
import { getCashflowMonthly, getCategoryExpenses, getTransactions } from '../lib/api.ts';
```

- [ ] **Step 2: Add drill transaction state**

After the `const [liveCatExp, setLiveCatExp] = useState(null);` line, add:

```js
  const [drillTxs, setDrillTxs] = useState([]);
  const [drillLoading, setDrillLoading] = useState(false);
```

- [ ] **Step 3: Fetch transactions when drill opens**

After the existing `useEffect`, add a second one:

```js
  useEffect(() => {
    if (!drill) { setDrillTxs([]); return; }
    setDrillLoading(true);
    getTransactions(12, drill)
      .then(data => { setDrillTxs(data); setDrillLoading(false); })
      .catch(() => { setDrillTxs([]); setDrillLoading(false); });
  }, [drill]);
```

- [ ] **Step 4: Pass rows and loading to DrillModal**

Replace the DrillModal invocation at the bottom of the render:

```js
      {drill && <DrillModal catId={drill} currency={currency} household={household} onClose={() => setDrill(null)} go={go} rows={drillTxs} loading={drillLoading} />}
```

- [ ] **Step 5: Update DrillModal to use live rows**

Replace the entire `DrillModal` function:

```js
function DrillModal({ catId, currency, household, onClose, go, rows, loading }) {
  const total = rows.reduce((s, t) => s + Math.abs(t.amount_base ?? t.amount), 0);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="spread" style={{ marginBottom: 4 }}>
          <div className="row" style={{ gap: 10 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: FMT.catColor(catId) }} /><div style={{ fontSize: 17, fontWeight: 800 }}>{FMT.catName(catId)}</div></div>
          <button className="btn ghost icon" onClick={onClose}><Icon n="x" s={16} /></button>
        </div>
        <div className="kpi-sub" style={{ marginBottom: 16 }}>{rows.length} transactions · {FMT.display(currency, total, 2)} total</div>
        <div style={{ maxHeight: 340, overflowY: 'auto', margin: '0 -6px' }}>
          {loading && <div className="kpi-sub" style={{ textAlign: 'center', padding: 24 }}>Loading…</div>}
          {!loading && rows.length === 0 && <div className="kpi-sub" style={{ textAlign: 'center', padding: 24 }}>No transactions this period.</div>}
          {!loading && rows.map(t => (
            <div key={t.id} className="spread" style={{ padding: '10px 6px', borderBottom: '1px solid var(--border)' }}>
              <div><div style={{ fontSize: 13, fontWeight: 600 }}>{t.description}</div><div className="fx">{t.date} · {t.currency}</div></div>
              <div style={{ textAlign: 'right' }}><div className="mono" style={{ fontWeight: 700, fontSize: 13.5 }}>{FMT.display(t.currency, Math.abs(t.amount), 2)}</div>{t.currency !== currency && t.amount_base && <div className="fx">{FMT.display(currency, Math.abs(t.amount_base), 2)}</div>}</div>
            </div>
          ))}
        </div>
        <button className="btn ghost" style={{ marginTop: 16, width: '100%', justifyContent: 'center' }} onClick={() => { onClose(); go('transactions', { category: catId }); }}>Open in Transactions <Icon n="arrowR" s={14} /></button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Build to verify**

```
npm run build --prefix frontend
```
Expected: Clean build

- [ ] **Step 7: Commit**

```
git add frontend/src/screens/cashflow.jsx
git commit -m "feat: wire Cashflow DrillModal to live /transactions?category=X"
```

---

### Task 7: Integration check + push

- [ ] **Step 1: Run full backend test suite**

```
cd backend && .venv\Scripts\python -m pytest tests/ -q
```
Expected: 74 passed

- [ ] **Step 2: Final frontend build**

```
npm run build --prefix frontend
```
Expected: Clean build, no warnings

- [ ] **Step 3: Push to master**

```
git push
```

- [ ] **Step 4: Update project memory**

Update `C:\Users\hoang\.claude\projects\D--03-Claude-Code-financial-indpendent\memory\fi-tracker-progress.md` to mark Plan 10 as DONE.
