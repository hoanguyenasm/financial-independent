# FIRE Tracker — Claude Code Handoff

> **Design reference status:** The HTML prototype in `FIRE Tracker.html` (and the `app/` folder) is a **high-fidelity interactive design reference** — not production code. Your job is to recreate this design in **React + Vite (TypeScript) + Tailwind CSS + Recharts**, wiring it to the FastAPI backend described below.

---

## What this is

A household FIRE (Financial Independence, Retire Early) tracker for a German couple (Duc Hoa Nguyen & Bao Ngoc Pham). Base currency EUR; VND appears only for monthly "Unterhalt" (support) transfers to Vietnam. Five screens, all dark-themed, data-dense.

**Prototype:** open `FIRE Tracker.html` in a browser to see the exact target design. Navigate all 5 screens, try expanding category groups, the scenario slider, inline category editing, and the import flow.

---

## Tech stack (target)
- **React + Vite (TypeScript)**
- **Tailwind CSS** (utility-first; the design tokens below map directly to `tailwind.config.ts`)
- **Recharts** (replace all inline SVG charts with Recharts equivalents)
- **FastAPI** at `http://localhost:8000` (see API section)
- **Routing:** React Router v6

---

## Design tokens

### Tailwind config additions

```ts
// tailwind.config.ts
theme: {
  extend: {
    colors: {
      bg: {
        DEFAULT: '#0A0E16',
        soft:    '#0C111B',
      },
      surface: {
        DEFAULT: '#121826',
        2:       '#161E2E',
        3:       '#1C2536',
        hover:   '#1F2A3D',
      },
      accent: {
        DEFAULT: '#38BDF8',
        2:       '#2E8AF6',
        ink:     '#04121d',
      },
      pos:  '#35D6A0',
      neg:  '#FB7185',
      warn: '#FBBF24',
      text: {
        DEFAULT: '#EAEEF6',
        2:       '#98A2B6',
        3:       '#616C7E',
      },
      asset: {
        stocks:     '#4D9BFF',
        realestate: '#A78BFA',
        cash:       '#2DD4BF',
        crypto:     '#FB923C',
        gold:       '#F59E0B',
        other:      '#8595AD',
      },
    },
    fontFamily: {
      sans: ["'Manrope'", 'system-ui', 'sans-serif'],
      mono: ["'JetBrains Mono'", 'monospace'],
    },
    borderRadius: {
      card: '20px',
      md:   '14px',
      sm:   '10px',
    },
  },
}
```

### Google Fonts to import
```html
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

---

## Color coding rules (apply consistently)
| Meaning | Color token |
|---|---|
| Income / positive change | `pos` `#35D6A0` |
| Expense / negative change | `neg` `#FB7185` |
| Investments | `accent` `#38BDF8` |
| Needs review / warning | `warn` `#FBBF24` |
| Stocks & ETFs (allocation) | `asset.stocks` `#4D9BFF` |
| Real estate | `asset.realestate` `#A78BFA` |
| Cash | `asset.cash` `#2DD4BF` |
| Crypto | `asset.crypto` `#FB923C` |
| Gold | `asset.gold` `#F59E0B` |

---

## Currency display rules

- **Base currency:** EUR (€) — show as prefix: `€742,000`
- **VND amounts** (only Unterhalt): show original `₫15,900,000` with base `≈ €571.94` in muted text below
- **Numbers:** always `font-variant-numeric: tabular-nums`
- **Compact notation:** `€742k`, `€1.5M` for charts/tiles
- **FX rates:** 1 EUR = 27,800 VND = 1.09 USD

---

## Screen 1: FIRE Dashboard

**Route:** `/` or `/dashboard`

**Layout:** full-viewport scroll, max-width 1480px centered, 24px padding.

### Hero card (2-column grid, ~62/38 split)

**Left panel:**
- Eyebrow: `FINANCIAL INDEPENDENCE · NET WORTH` (uppercase, 11px, `text-3`, 0.14em letter-spacing)
- Net worth: `€742,000` (52px, weight 800) + `/ €1,500,000` muted + `49.5% there` accent pill
- Subtitle: `incl. €236k Stuttgart apartment · +€9.2k this month` (monospace, 11.5px, `text-3`)
- Progress bar: height 18px, rounded-full, accent gradient fill (animate width on mount)
- Milestone ticks at 0%, 25%, 50%, 75% (Lean FI), 100% (FI · €1.5M) — positioned absolutely
- Divider
- Three sub-stats: Invested assets `€324,000`, Real estate equity `€236,000 · Stuttgart apt · 100%`, Cash & savings `€100,000 · Comdirect · ING · Revolut` — each clickable → Accounts

**Right panel** (cyan gradient overlay top):
- Eyebrow: `TIME TO FINANCIAL INDEPENDENCE`
- Big countdown: years + `yrs` + months + `mos` (58px weight 800)
- Projected FI date in accent color
- "X months ahead/behind of plan" pill (green if ahead, red if behind)
- Divider
- Sparkline area chart of net worth (24 months → FI target as dashed line)

### 4 metric cards (4-column grid)
1. **Passive income coverage** — Ring gauge SVG, `€2,450/mo passive` of `€5,400 expenses`
2. **Savings rate** — `42%` this month, mini bar chart (12 months), `12-mo avg 38%`
3. **Rental & Airbnb income** — `€1,950/mo` trailing 12-mo, sparkline, `Stuttgart apartment · Airbnb`
4. **Needs review** — amber gradient card, count `7`, "Review now →" button → Transactions filtered

### Scenario slider card
- Heading: "What if you saved more?"
- Display: `+€X / month` (updated by slider, accent color, 30px)
- Range input: 0–€3,000, step 50
- Right panel: "New time to FI" `X yrs Y mos` + "X months sooner" pill + mini projection SVG

**State:** `extra: number` (slider value) → recalculate months-to-FI:
```ts
function monthsToFI(monthly: number, start = 742000, target = 1500000, r = 0.05/12) {
  let b = start, m = 0;
  while (b < target && m < 1200) { b = b * (1 + r) + monthly; m++; }
  return m;
}
```

---

## Screen 2: Cash Flow & Expenses

**Route:** `/cashflow`

**Layout:** page with filter bar, KPI row, bar chart, expandable groups panel, investment panel, trend chart.

### KPI row (4 cards)
Income `€19,314` · Expenses `€14,145` · Invested `€3,762` · Net saved `€5,169 (27%)`

Toggle: **Monthly** (current month) / **Yearly** (×12 approximation)

### Income vs Expenses bar chart (Recharts `BarChart`)
- 12-month data, grouped bars: income (pos green) + expenses (neg red)
- Hover tooltip: month, income in, expense out, net

### Expenditure groups (expandable list) — THIS IS THE KEY FEATURE

Each row is a group (Housing, Lifestyle, Food, Healthcare, Insurance & Telecom, Tax, Unterhalt, Other). State: `Set<string>` of expanded group IDs.

**Group row (collapsed):**
```
[chevron ▶] [color dot] Group name   [sub-count]   [thin bar]   [% of total]   [€total]
```
Click → expand to subcategory rows.

**Subcategory rows (expanded, indented 32px):**
```
[color dot] Category name  [N txns]   [thin bar of sub/group ratio]   [€amount]   [>]
```
Click subcategory → drill-down modal showing individual transactions for that category.

**Bottom of list:** `Total expenses  €14,145` (bold, neg color)

Sort control: "By amount" (default) or "A–Z". Expand All / Collapse All buttons.

**Subcategory groups and amounts:**
```
Housing:            Mortgage €6,943 · Utilities €668                    Total €7,611
Lifestyle:          Travel €1,198 · Shopping €500 · Subscriptions €64   Total €1,762
Unterhalt:          Unterhalt €1,272                                     Total €1,272
Food:               Supermarket €640 · Restaurant €380                   Total €1,020
Healthcare:         IVF €326 · Healthcare €180 · Fitness €78             Total €584
Insurance & Telecom: Insurance €402 · Telecom €124                       Total €526
Tax:                Tax €890                                             Total €890
Other:              Other €480                                           Total €480
```

### Investment overview card (separate from expenses)
Tag: "Savings, not spending"
- Left: donut chart (Recharts PieChart) of ETF/Trading/Gold/Crypto
- Right: rows ETF/Sparplan €1,412, Trading €1,800, Gold €300, Crypto €250 + **Total invested €3,762**
- Clicking row → drill-down modal for that investment category

### Trend chart (Recharts LineChart)
Top 4 groups over trailing 12 months. Hover crosshair.

### Drill-down modal (shared)
Opens when clicking any subcategory or investment row. Shows:
- Category name + color
- Total + transaction count
- Paginated list: date · description · amount (orig) · amount (base)
- "Open in Transactions →" button

---

## Screen 3: Accounts & Net Worth

**Route:** `/accounts`

### Net worth line chart + allocation donut (2-column)
- Line chart (Recharts): 12M / 24M toggle, net worth over time, delta + %
- Donut (Recharts PieChart): Stocks 44% €324k · Real estate 32% €236k · Cash 13% €100k · Crypto 7% €52k · Gold 4% €30k
- Hover donut segment: show % and amount

### Account cards (3-column grid)
For each account: icon by type, name, institution, balance (base EUR compact) + original currency. Inactive accounts show faded + "inactive" tag. Click → Transactions filtered by account.

**Accounts:**
| ID | Name | Type | Balance |
|---|---|---|---|
| tr | Trade Republic | Brokerage | €262,000 |
| property | Rental Apartment · Stuttgart | Real estate | €236,000 |
| scalable | Scalable Capital | Brokerage | €144,000 |
| comdirect | Comdirect Giro | Bank | €58,000 |
| ing | ING Tagesgeld | Bank | €34,000 |
| revolut | Revolut | Bank | €8,000 |
| amex | American Express | Credit card | €0 |
| revolut_vnd | Revolut VND | FX wallet | ₫12,000,000 ≈ €432 |
| dkb | DKB Giro | Bank (inactive) | €0 |

### Holdings performance table
Grouped by asset class with group header rows. Columns:

`Asset | Qty | Avg cost | Price | Value (EUR) | Gain/Loss %`

**Holdings:**
| Symbol | Name | Qty | Avg cost | Current | Gain |
|---|---|---|---|---|---|
| VWCE | Vanguard FTSE All-World | 1,100 | €102 | €116.40 | +14.1% |
| IWDA | iShares MSCI World | 600 | €78 | €96 | +23.1% |
| SXR8 | iShares S&P 500 | 80 | €420 | €560 | +33.3% |
| SAP | SAP SE | 180 | €132 | €205 | +55.3% |
| ASML | ASML Holding | 30 | €620 | €720 | +16.1% |
| ALV | Allianz SE | 110 | €230 | €312 | +35.7% |
| BTC | Bitcoin | 0.42 | €41,000 | €85,000 | +107% |
| ETH | Ethereum | 5 | €2,400 | €3,150 | +31.3% |
| 4GLD | Xetra-Gold | 380 | €62 | €78 | +25.8% |
| — | Rental Apartment Stuttgart | 1 | €185,000 | €236,000 (equity) | +27.6% · 100% · €2,100/mo |

---

## Screen 4: Transactions

**Route:** `/transactions`

Deep link: `/transactions?needs_review=true` or `/transactions?category=mortgage`

**Layout:** page with filter bar, optional bulk action bar, table, pagination.

### Filter bar
- Search input (description + category)
- "Needs review" toggle pill (amber when active)
- Account dropdown
- Category dropdown
- User dropdown (Hoa / Ngoc / Household)
- Date range: Last 30d / 90d / 12 months / All time
- Active filter count badge + Clear button

### Table columns
`☐ | Date | Description | Category | Amount (orig) | Base (EUR) | Account | User`

- **Category cell:** inline dropdown. Clicking opens a floating category picker positioned at click coordinates (fixed position). On pick: update category, clear `needs_review`. If the row was previously uncategorized → show "Create a rule?" modal.
- **Needs review:** amber "new" badge next to description; category cell shows ⚠ Categorize in amber.
- **Amount:** original currency (€ or ₫ for Unterhalt). Color: green for income, default for expense.
- **Base EUR:** smaller, muted, monospace.
- **User:** avatar circle (H = Hoa cyan, N = Ngoc violet).

### Bulk select
Select rows → bulk action bar appears: "N selected · Re-categorize ▾ · Mark reviewed · Clear"

### "Create a rule?" modal
```
Always categorize transactions matching "[description]" as [Category]?
[No, just this one]  [Yes, always]
```

### Pagination: 11 rows per page

### API
```
GET /transactions?needs_review=true&limit=100&account_id=X&category=Y&user_id=Z
→ [{id, date, description, category, amount, currency, amount_base, account_id, user_id, needs_review}]

PATCH /transactions/{id} → {category, needs_review: false}
POST /categorization-rules → {match_text, category}
```

---

## Screen 5: Import & Settings (two tabs)

**Route:** `/import-settings`

### Import tab

**Dropzone:** drag-and-drop + click-to-browse. Accepts PDF, CSV. Supported banks: Comdirect, ING, Trade Republic, Scalable, Revolut.

**After file selected → Preview state:**
- File name + target account
- Stats row: `44 transactions found` · `3 duplicates skipped` · `12 uncategorized`
- Preview table (first 6 rows): Date · Description · Category · Amount · Status (new/duplicate)
- [Cancel] [Confirm import · 44 rows] buttons

**Account selector sidebar:** list of active accounts, radio-style selection.

**Import history table:** File · Account · Date · Rows · Status (success/partial/failed + dupe count)

```
POST /import → {file (multipart), account_id} → {found, duplicates, uncategorized, preview_rows[]}
POST /import/confirm → {import_id} → {imported_count}
GET /import/history → [{id, file, account_id, date, rows, status, duplicates, note}]
```

### Settings tab (2-column grid)

**Household members** — editable name + email for both Hoa and Ngoc. Base currency selector (EUR / USD / VND).

**FIRE goal** — target net worth `€1,500,000`, target date `2037-01`, SWR `3.5%`, return rate `5.0%`, inflation `2.0%`. "Save goal" button. Footer: `SWR 3.5% implies a €4,375/mo safe income at target.`

**Categories** — chip list, each with delete (×). Add new via input + Enter/+ button.

**Auto-categorization rules** — list of rules: `MATCH PATTERN → Category` + hit count + delete button.

**FX rate override** — `1 EUR = [USD] [VND]` inputs + Apply.

```
GET  /settings → {base_currency, fire_goal: {target, date, swr, return_rate, inflation}}
PUT  /settings → same shape
GET  /categories → [{id, name, kind, color}]
POST /categories → {name, kind, color}
DELETE /categories/{id}
GET  /categorization-rules → [{id, match, category, hits}]
DELETE /categorization-rules/{id}
```

---

## API endpoints summary

```
# FIRE summary
GET /fire/summary → {net_worth, fi_target, base_monthly_savings, real_return,
                     passive_income, monthly_expenses, savings_rate_month,
                     savings_rate_avg, rental_ttm, needs_review}

# Accounts
GET /accounts → [{id, name, type, cls, currency, is_active, balance_eur, balance_orig}]

# Assets / holdings
GET /assets → [{id, symbol, name, type, account_id, qty, avg_cost, current_price,
                currency, ownership_pct, monthly_income}]

# Cash flow
GET /cashflow/monthly → [{month, year, income, expense, net}]  # 12 months
GET /cashflow/breakdown → [{group, color, subs: [{id, name, amount, txns, color}]}]
GET /cashflow/investments → [{id, name, amount, note, color}]

# Net worth history
GET /networth/history?months=24 → [{date, value}]

# Transactions
GET  /transactions → [{id, date, description, category, amount, currency,
                        amount_base, account_id, user_id, needs_review}]
PATCH /transactions/{id} → {category, needs_review}

# Import
POST /import/upload (multipart)
POST /import/confirm
GET  /import/history

# Settings
GET/PUT /settings
GET/POST/DELETE /categories
GET/POST/DELETE /categorization-rules
```

---

## Component architecture (suggested)

```
src/
  components/
    layout/      Nav.tsx  ScrollPage.tsx
    charts/      Ring.tsx  Donut.tsx  AreaChart.tsx  BarChart.tsx  Sparkline.tsx
    shared/      Card.tsx  Tag.tsx  Avatar.tsx  Dropdown.tsx  Switch.tsx
                 Progress.tsx  Money.tsx  InlineEdit.tsx
  screens/
    Dashboard.tsx  CashFlow.tsx  Accounts.tsx  Transactions.tsx  Settings.tsx
  hooks/
    useFire.ts     useTransactions.ts     useAccounts.ts
  lib/
    api.ts         format.ts (EUR/VND/USD formatting)   fire-math.ts
  styles/
    globals.css    (CSS variables matching design tokens)
```

---

## Key interaction details

1. **Currency switching:** top-right dropdown sets `baseCurrency` in a React context. Every Money component re-renders with converted value. `EUR → VND` multiplies by 27,800; `EUR → USD` divides by 0.92.

2. **Category inline edit:** click the category chip in any transaction row → a `position: fixed` floating menu appears at click position. Select a new category → PATCH transaction. If previous category was `null` (uncategorized) → open "Create a rule?" modal.

3. **Expandable groups (Cash Flow):** manage a `Set<groupId>` in local state. Click group header → toggle. Each subcategory row shows `txns` count from API; clicking opens a modal fetching `/transactions?category=X`.

4. **Scenario slider (Dashboard):** purely client-side. No API call. Recalculate months-to-FI locally using the compound growth formula above.

5. **Deep links:** `useSearchParams()` — `?needs_review=true` on mount sets the Needs Review filter; `?category=X` pre-filters transactions.

---

## Files in this package

| File | Purpose |
|---|---|
| `FIRE Tracker.html` | Complete interactive prototype — **open in browser as the visual spec** |
| `app/app.css` | All CSS variables and component styles |
| `app/data.js` | Mock data + FX + FI math — reference for data shapes |
| `app/ui.jsx` | Shared UI primitives (charts, nav, dropdown, etc.) |
| `app/screen-dashboard.jsx` | Dashboard screen implementation |
| `app/screen-cashflow.jsx` | Cash Flow screen with expandable groups |
| `app/screen-accounts.jsx` | Accounts + net worth + holdings |
| `app/screen-transactions.jsx` | Transactions + inline edit + bulk |
| `app/screen-settings.jsx` | Import + Settings screens |
