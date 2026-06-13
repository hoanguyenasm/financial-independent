# Financial Independence Tracker — Plan 3: Backend Rules, FX, and Aggregates

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the remaining backend endpoints the frontend needs to leave mock data behind: category-rules CRUD, FX-rates upsert/query, and analytics aggregates (monthly cash flow and a FIRE summary).

**Architecture:** Same stack and patterns as Plan 1 (FastAPI routers + SQLAlchemy + pytest with the in-memory `client` fixture). Analytics endpoints compute on the fly from `transactions`, `accounts`, and `assets` — no snapshot tables (net-worth *history* stays out of scope until a snapshot mechanism exists).

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0, pytest.

**Status: COMPLETE (2026-06-13).** All tasks executed TDD-style. Full suite: 47 passed. New endpoints: `/category-rules` (POST/GET/DELETE), `/fx-rates` (PUT upsert, GET list, GET /latest), `/analytics/cashflow-monthly`, `/analytics/summary`.

---

## Task 1: Category rules router

**Files:** Create `backend/app/schemas/category_rule.py`, `backend/app/routers/category_rules.py`, `backend/tests/test_category_rules.py`; modify `backend/app/schemas/__init__.py`, `backend/app/main.py`.

- [ ] Write failing tests: POST `/category-rules` (201, returns id/pattern/category), GET list, DELETE (204, then list shrinks), optional `account_id` scoping.
- [ ] Schemas: `CategoryRuleCreate {pattern, category, account_id?}`, `CategoryRuleRead {+id, created_at}`.
- [ ] Router: POST/GET/DELETE following the users-router pattern; register in `main.py`.
- [ ] Tests green → commit `feat: add category rules endpoints`.

## Task 2: FX rates router

**Files:** Create `backend/app/schemas/fx_rate.py`, `backend/app/routers/fx_rates.py`, `backend/tests/test_fx_rates.py`; modify `backend/app/schemas/__init__.py`, `backend/app/main.py`.

- [ ] Write failing tests: PUT `/fx-rates` upserts `(from_currency,to_currency,date)` (second PUT with same key updates rate, no duplicate), GET `/fx-rates/latest?from=EUR&to=VND` returns most recent rate, 404 when none.
- [ ] Schemas: `FXRateUpsert {from_currency, to_currency, rate, date}`, `FXRateRead {+id}`.
- [ ] Router: PUT upsert + GET latest; register.
- [ ] Tests green → commit `feat: add fx rates upsert and latest-rate endpoints`.

## Task 3: Analytics — monthly cash flow

**Files:** Create `backend/app/routers/analytics.py`, `backend/tests/test_analytics.py`; modify `backend/app/main.py`.

- [ ] Write failing test: seed transactions across 2 months (income + expense types), GET `/analytics/cashflow-monthly?months=12` → `[{month: 'YYYY-MM', income, expense, net}]` using `amount_base` (fallback `amount`), `income` = sum of income-kind types, `expense` = abs sum of expense types; transfers and investment types excluded from both.
- [ ] Implement with a Python-side group-by over the filtered window (SQLite-portable, dataset is small); register router.
- [ ] Tests green → commit `feat: add monthly cashflow analytics endpoint`.

## Task 4: Analytics — FIRE summary

**Files:** Modify `backend/app/routers/analytics.py`, `backend/tests/test_analytics.py`.

- [ ] Write failing test: GET `/analytics/summary` → `{net_worth, passive_income_monthly, monthly_expenses, savings_rate, needs_review}` where net_worth = Σ assets `current_value × ownership_pct/100`, passive income = trailing-12-mo avg of dividend/interest/rental-category income, monthly_expenses = trailing-12-mo avg expenses, savings_rate = (income−expenses)/income over trailing 12 mo (0 when no income), needs_review = count.
- [ ] Implement; tests green → commit `feat: add FIRE summary analytics endpoint`.

## Task 5: Final verification

- [ ] Full suite `pytest tests/ -q` green; commit `feat: complete Plan 3 — backend rules, fx, analytics`.
