# Financial Independence Tracker — Design Spec

**Date:** 2026-06-12
**Goal:** A local-first web app for tracking all household expenses, investments, and assets across multiple accounts and currencies, with a built-in FIRE (Financial Independence, Retire Early) dashboard showing a clear path to financial independence.

---

## 1. Architecture

### Stack
- **Backend:** Python 3.12 + FastAPI
- **Database:** SQLite (single file, easy backup)
- **ORM:** SQLAlchemy
- **PDF parsing:** pdfplumber
- **Frontend:** React + Vite (TypeScript) + Tailwind CSS
- **Charts:** Recharts
- **FX rates:** open.er-api.com (free tier, cached daily)

### Deployment
- Runs on a local machine (Windows)
- Primary user accesses via `http://localhost`
- Partner accesses via LAN IP or Tailscale
- No cloud dependency — all data stays local
- Single SQLite file at a configurable path for easy backup

### Component Overview
```
Browser (React)  ←→  FastAPI (localhost)  ←→  SQLite
                          ↕
                  pdfplumber / CSV parser
                  FX rate API (cached)
                  FIRE calculator
```

---

## 2. Data Model

### users
| Column | Type | Notes |
|---|---|---|
| id | int PK | |
| name | text | |
| email | text | |
| base_currency | text | e.g. USD, VND |
| created_at | datetime | |

### accounts
| Column | Type | Notes |
|---|---|---|
| id | int PK | |
| owner_user_id | int FK nullable | primary owner (whose account it is); null = shared |
| name | text | e.g. "Vietcombank Savings" |
| type | enum | checking, savings, credit_card, brokerage, crypto, forex, real_estate, business, other |
| currency | text | primary currency |
| institution | text | bank/broker name |
| is_active | bool | |

### transactions
| Column | Type | Notes |
|---|---|---|
| id | int PK | |
| account_id | int FK | |
| user_id | int FK | who spent/received |
| date | date | |
| amount | decimal | original currency |
| currency | text | original currency code |
| amount_base | decimal | converted to user base currency |
| fx_rate | decimal | rate used at import time |
| description | text | raw from statement |
| category | text | or "uncategorized" |
| type | enum | income, expense, transfer, investment_buy, investment_sell, dividend, interest, fee |
| needs_review | bool | true when category = uncategorized |
| source | enum | pdf, csv, manual |
| asset_id | int FK nullable | links income/expense to a specific asset (e.g. rental property) |
| imported_at | datetime | |

### assets
| Column | Type | Notes |
|---|---|---|
| id | int PK | |
| account_id | int FK | |
| symbol_or_name | text | e.g. AAPL, "District 2 Apartment" |
| asset_type | enum | stock, etf, mutual_fund, crypto, real_estate, bond, other |
| quantity | decimal | shares, units, or 1 for real estate |
| avg_cost | decimal | |
| current_value | decimal | updated manually or via API |
| currency | text | |
| expected_monthly_income | decimal | for real estate: target rental/Airbnb income |
| ownership_pct | decimal | default 100, for co-owned properties |
| last_updated | datetime | |

### fi_goals
| Column | Type | Notes |
|---|---|---|
| id | int PK | |
| user_id | int FK | |
| target_net_worth | decimal | |
| target_date | date | |
| monthly_expenses_override | decimal | null = use actual from transactions |
| passive_income_target | decimal | null = derived from expenses |
| safe_withdrawal_rate | decimal | default 0.04 |
| investment_return_rate | decimal | default 0.07 |
| inflation_rate | decimal | default 0.03 |

### category_rules
| Column | Type | Notes |
|---|---|---|
| id | int PK | |
| pattern | text | merchant name substring or regex |
| category | text | target category |
| account_id | int FK nullable | scope to account, or null = global |
| created_at | datetime | |

### fx_rates
| Column | Type | Notes |
|---|---|---|
| id | int PK | |
| from_currency | text | |
| to_currency | text | |
| rate | decimal | |
| date | date | |

### import_logs
| Column | Type | Notes |
|---|---|---|
| id | int PK | |
| account_id | int FK | |
| filename | text | |
| source_type | enum | pdf, csv |
| status | enum | success, partial, failed |
| rows_imported | int | |
| rows_skipped | int | duplicates |
| rows_uncategorized | int | |
| imported_at | datetime | |

---

## 3. Key Screens

### Screen 1 — FIRE Dashboard (home)
The primary view. All figures in base currency.

**Widgets:**
- Net worth progress bar: `current / target_net_worth` with % and absolute values
- Time to FI: calculated projection in years + months, with target date comparison (ahead/behind)
- Passive income coverage gauge: `trailing_12mo_passive_income / projected_monthly_expenses × 100%`
- Savings rate: current month + trailing 12-month average
- Rental/Airbnb income: trailing 12-month average per month
- "Needs review" badge: count of uncategorized transactions
- Scenario slider: "What if I save $X more/month?" — recalculates time-to-FI live

**Passive income sources counted:** dividends, rental income, Airbnb/short-term rental income, interest, business income tagged as passive.

### Screen 2 — Cash Flow & Expenses
- Monthly and yearly view toggle
- Income vs expenses waterfall chart
- Expense breakdown by category (donut + table)
- Filter by: account, user (you / partner / household), date range, currency
- Category drill-down: click a category to see individual transactions
- Trend chart: category spend over time (12-month rolling)

### Screen 3 — Accounts & Net Worth
- All accounts listed with current balance
- Net worth over time line chart
- Asset allocation breakdown: % stocks, % real estate, % cash, % crypto, % other
- Per-account balance history
- Per-asset performance: current value vs avg cost, gain/loss %

### Screen 4 — Transactions
- Searchable, filterable, paginated transaction log
- Columns: date, description, category, amount (original), amount (base), account, user
- Filter: needs_review, account, category, type, date range, user
- Inline category editing with rule-save prompt
- Bulk re-categorize
- Duplicate indicator
- Both original and base currency shown on every row

### Screen 5 — Import & Settings
**Import tab:**
- Upload PDF or CSV, select target account
- Auto-detect bank from PDF header text
- Preview before commit: "Found 47 transactions, 3 duplicates skipped, 12 uncategorized"
- Parser config wizard for first-time bank setup (column mapping, date format)
- Import history log

**Settings tab:**
- User profiles (you + partner)
- Base currency selection
- FIRE goal parameters: target net worth, target date, SWR, return rate, inflation rate
- Category management: add/edit/delete categories
- Category rules: view, edit, delete auto-categorization rules
- FX rate override: set manual rate for a specific date/pair

---

## 4. PDF Parsing

### Per-bank parser profiles
Each bank has a named profile stored in the database:
- **Bank identifier:** substring matched from PDF page 1 text (e.g. "Vietcombank", "Revolut")
- **Column mappings:** which extracted column → date / description / debit / credit / balance
- **Date format:** e.g. `DD/MM/YYYY`
- **Currency position:** prefix or suffix, or separate column

### Revolut special handling
Revolut statements include both the original amount and the exchanged amount on the same transaction row. The Revolut parser extracts both values directly from the statement, using the statement's own exchange rate rather than the cached API rate.

### Import flow
1. User uploads PDF and selects account
2. Backend extracts all text with `pdfplumber`
3. Auto-detect bank from page 1 text → load matching parser profile
4. If no profile found → launch parser config wizard
5. Extract transaction rows using profile rules
6. Apply category rules (pattern match on description)
7. Unmatched transactions → `category = "uncategorized"`, `needs_review = true`
8. Deduplicate: skip rows matching existing `(account_id, date, amount, description)`
9. Show preview to user
10. On confirm → write to DB, write import log

### CSV fallback
Same flow, simpler extraction. Column headers mapped in parser profile.

### Manual cash entry
Simple form: date, amount, currency, description, category, account (defaults to a "Cash" account), user.

---

## 5. FIRE Calculation

### Net Worth
```
net_worth = Σ(account balances) + Σ(asset current_value × ownership_pct) − Σ(liabilities)
```
Liabilities = negative-balance accounts (credit cards) + any manually entered debts.

### FI Number (dynamic, inflation-adjusted)
```
years_to_target = target_date − today (in years)
projected_annual_expenses = current_annual_expenses × (1 + inflation_rate) ^ years_to_target
fi_number = projected_annual_expenses / safe_withdrawal_rate
```
`current_annual_expenses` = trailing 12-month average monthly expense × 12 (from actual transactions).

### Time to FI (compound growth projection)
```
monthly_savings = avg monthly income − avg monthly expenses (trailing 12mo)
months_to_fi = solve for n: net_worth × (1 + r)^n + monthly_savings × ((1+r)^n − 1) / r = fi_number
where r = investment_return_rate / 12
```

### Passive Income Coverage
```
passive_income = trailing 12-month average of:
  dividends + rental income + Airbnb income + interest + passive business income
coverage_pct = (passive_income × 12) / projected_annual_expenses × 100
```
FI achieved when coverage_pct ≥ 100%.

### Savings Rate
```
savings_rate = (total_income − total_expenses) / total_income
```
Shown monthly and as trailing 12-month average.

### Scenario modeling
Live slider on dashboard: adjust monthly savings delta → recalculate `months_to_fi` in real time. No database writes.

---

## 6. Multi-Currency

- A single **household base currency** is set in app settings (e.g. USD) — not per-user, ensuring `amount_base` means the same thing on every transaction
- Every transaction stored with both `amount` (original) and `amount_base` (converted)
- FX rate locked at import time and stored on the transaction — never retroactively changed
- Daily FX rates fetched from open.er-api.com and cached in `fx_rates` table
- App works fully offline using last cached rates
- Manual rate override available per import
- Revolut: uses the rate embedded in the statement itself
- UI display: `$1,200 USD (27,600,000 VND)` — original first, base in parentheses
- All charts and aggregations use base currency

---

## 7. Uncategorized Transaction Workflow

1. Transactions with no rule match are imported with `category = "uncategorized"` and `needs_review = true`
2. FIRE Dashboard shows a badge with uncategorized count
3. Transactions screen has a "Needs Review" filter
4. User assigns category inline
5. Prompt: *"Always categorize '[description pattern]' as [category]?"*
   - Yes → saves to `category_rules`, applied on all future imports
   - No → one-time categorization only
6. Rules accumulate over time, reducing uncategorized rate on each import

---

## 8. Partner Access

- Two user accounts share one app instance
- Accounts are household-level (all visible to both); `owner_user_id` records whose account it is, not who can see it
- Transactions are tagged with `user_id` (who made the transaction)
- Cash Flow screen can filter by user to see individual vs household view
- FIRE goals are per-user but dashboard can show household combined view
- Base currency is a single household setting, not per-user
- No authentication required on LAN (trust-based); optional basic auth for Tailscale access

---

## 9. Out of Scope (v1)

- Mobile app
- Automatic bank sync (Plaid/Open Banking)
- Stock price auto-fetch (manual current value updates for investments)
- Multi-household / sharing with non-partner users
- Image-based PDF scanning (OCR)
- Tax reporting
- Budget/envelope system (tracking vs. budget targets is out; pure tracking only)
