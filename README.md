# FI Tracker

Personal finance tracker for Financial Independence — tracks accounts, transactions, assets, and FIRE progress.

**Stack:** FastAPI + SQLite backend · Vite + React + TypeScript frontend

---

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Git

---

### 1. Clone

```bash
git clone https://github.com/hoanguyenasm/financial-independent.git
cd financial-independent
```

---

### 2. Backend

```bash
cd backend

# Create and activate virtual environment (Windows)
python -m venv .venv
.venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run database migrations (creates fi_tracker.db)
alembic upgrade head

# Start the API server
uvicorn app.main:app --reload --port 8000
OR
python -m uvicorn app.main:app --reload 
```

API is now live at **http://localhost:8000**
Interactive docs at **http://localhost:8000/docs**

> The database file `fi_tracker.db` is created in the `backend/` folder on first migration.

---

### 3. Frontend

Open a **second terminal** from the repo root:

```bash
# Install dependencies (first time only)
npm install --prefix frontend

# Start the dev server
npm run dev --prefix frontend
```

App is now live at **http://localhost:5173**

---

### 4. Seed some data (optional)

With the backend running, create an account so the import screen has something to target:

```bash
curl -X POST http://localhost:8000/accounts \
  -H "Content-Type: application/json" \
  -d '{"name":"ING Checking","type":"checking","currency":"EUR","institution":"ING","is_active":true}'
```

Then go to **Settings → Import**, drop a CSV or PDF bank statement, select the account, and import.

---

## Daily Development

| Task | Command |
|------|---------|
| Start backend | `cd backend && .venv\Scripts\activate && uvicorn app.main:app --reload` |
| Start frontend | `npm run dev --prefix frontend` |
| Run backend tests | `cd backend && .venv\Scripts\python -m pytest tests/ -q` |
| Build frontend (type-check) | `npm run build --prefix frontend` |

---

## Environment Variables

The backend reads from `backend/.env` (optional — defaults shown):

```env
DATABASE_URL=sqlite:///./fi_tracker.db
BASE_CURRENCY=EUR
CORS_ORIGINS=["http://localhost:5173"]
```

---

## Project Structure

```
financial-independent/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app + router registration
│   │   ├── models/          # SQLAlchemy ORM models
│   │   ├── schemas/         # Pydantic request/response schemas
│   │   ├── routers/         # API route handlers
│   │   ├── parsers/         # CSV + PDF bank statement parsers
│   │   └── services/        # Import service (categorize, dedup, persist)
│   ├── alembic/             # Database migrations
│   ├── tests/               # pytest test suite (70 tests)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── screens/         # React screens (dashboard, accounts, transactions, settings)
│   │   ├── lib/api.ts       # Typed API client
│   │   ├── data.js          # Mock fallback data
│   │   └── ui.jsx           # Shared UI components
│   └── package.json
└── docs/
    └── superpowers/plans/   # Implementation plans (Plan 1–6 complete)
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET/POST | `/accounts` | List / create accounts |
| GET/POST | `/transactions` | List / create transactions (filters: account_id, category, needs_review) |
| POST | `/import` | Upload CSV or PDF bank statement |
| GET | `/import/logs` | Import history |
| GET/POST | `/category-rules` | Auto-categorization rules |
| GET | `/analytics/summary` | Net worth, passive income, savings rate, needs-review count |
| GET | `/analytics/cashflow-monthly` | Monthly income vs expense breakdown |
| GET/PATCH | `/settings` | App settings (base currency) |

Full interactive docs: **http://localhost:8000/docs**

---

## What's Live vs Mock

| Screen section | Data source |
|----------------|-------------|
| Dashboard KPI cards (expenses, savings rate, passive income) | Live `/analytics/summary` |
| Cash Flow bar chart | Live `/analytics/cashflow-monthly` |
| Accounts list | Live `/accounts` |
| Transactions table + account filter | Live `/transactions` + `/accounts` |
| Import account selector | Live `/accounts` |
| Net worth chart, asset allocation donut, holdings table | Mock (`data.js`) |
| FIRE hero / scenario slider | Mock (`data.js`) |

All live sections fall back to mock data silently when the backend is offline.
