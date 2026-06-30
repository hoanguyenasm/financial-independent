from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from collections import defaultdict
from datetime import date
from typing import Optional
import calendar
from app.database import get_db
from app.models import Asset, Transaction, FIGoal, Account

router = APIRouter(prefix="/analytics", tags=["analytics"])

# Category-based bucket classification — the category set by the user (or rules) is
# authoritative. Type is an import-time heuristic that can fall out of sync when the
# user re-categorises a transaction or a description doesn't match import keywords.
_INCOME_CATS = frozenset({"income", "salary", "rental", "airbnb", "interest", "dividend"})
# investment buys and sells — excluded from both income and expense buckets.
_INVESTMENT_CATS = frozenset({"etf", "trading", "crypto", "gold", "investment_buy", "investment_sell"})
# Neutral: internal account moves and deposits held on behalf of tenants.
NEUTRAL_CATEGORIES = {"transfer", "deposit"}

# Legacy type-based constants kept for the /summary endpoint only.
INCOME_TYPES = {"income", "dividend", "interest"}
EXPENSE_TYPES = {"expense", "fee"}
PASSIVE_TYPES = {"dividend", "interest"}
INVESTMENT_TYPES = {"investment_buy", "investment_sell"}


def _months_ago(d: date, months: int) -> date:
    total = d.year * 12 + (d.month - 1) - months
    return date(total // 12, total % 12 + 1, 1)


def _base_amount(tx: Transaction) -> float:
    return float(tx.amount_base if tx.amount_base is not None else tx.amount)


@router.get("/cashflow-monthly")
def cashflow_monthly(months: int = Query(default=12, ge=1, le=60), db: Session = Depends(get_db)):
    cutoff = _months_ago(date.today(), months - 1)
    txs = db.query(Transaction).filter(Transaction.date >= cutoff).all()
    buckets: dict[str, dict[str, float]] = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
    for tx in txs:
        # Skip neutral movements and investment transactions regardless of their type.
        # This prevents investment buys/sells that were mis-typed as "income"/"expense"
        # (import heuristic failure or manual category edit without type update) from
        # inflating the income or expense bars.
        if tx.category in NEUTRAL_CATEGORIES or tx.category in _INVESTMENT_CATS:
            continue
        key = tx.date.strftime("%Y-%m")
        amount = _base_amount(tx)
        if tx.type in INCOME_TYPES:
            buckets[key]["income"] += amount
        elif tx.type in EXPENSE_TYPES:
            buckets[key]["expense"] += abs(amount)
    today = date.today()
    result = []
    for i in range(months - 1, -1, -1):
        total = today.year * 12 + (today.month - 1) - i
        m = date(total // 12, total % 12 + 1, 1)
        key = m.strftime("%Y-%m")
        vals = buckets.get(key, {"income": 0.0, "expense": 0.0})
        result.append({
            "month": key,
            "income": round(vals["income"], 2),
            "expense": round(vals["expense"], 2),
            "net": round(vals["income"] - vals["expense"], 2),
        })
    return result


def _by_category(
    db: Session,
    months: int,
    month: Optional[str],
    include_cats: Optional[frozenset] = None,
    exclude_cats: Optional[set] = None,
):
    """Aggregate transactions into per-category totals by category membership.
    include_cats: only these categories (mutually exclusive with exclude_cats for the
    main filter — neutral categories are always excluded regardless).
    exclude_cats: skip transactions whose category is in this set."""
    q = db.query(Transaction).filter(Transaction.category.notin_(NEUTRAL_CATEGORIES))
    if include_cats is not None:
        q = q.filter(Transaction.category.in_(include_cats))
    if exclude_cats is not None:
        q = q.filter(Transaction.category.notin_(exclude_cats))
    if month:
        y, m = (int(p) for p in month.split("-"))
        q = q.filter(
            Transaction.date >= date(y, m, 1),
            Transaction.date <= date(y, m, calendar.monthrange(y, m)[1]),
        )
    else:
        q = q.filter(Transaction.date >= _months_ago(date.today(), months - 1))
    totals: dict[str, float] = defaultdict(float)
    counts: dict[str, int] = defaultdict(int)
    for tx in q.all():
        cat = tx.category or "uncategorized"
        totals[cat] += abs(_base_amount(tx))
        counts[cat] += 1
    return [
        {"category": cat, "total_base": round(totals[cat], 2), "txn_count": counts[cat]}
        for cat in sorted(totals, key=lambda c: totals[c], reverse=True)
    ]


@router.get("/expense-by-category")
def expense_by_category(
    months: int = Query(default=12, ge=1, le=60),
    month: Optional[str] = Query(default=None, description="Single calendar month YYYY-MM"),
    db: Session = Depends(get_db),
):
    # Exclude income, investment, and neutral categories — only true expenses remain.
    return _by_category(db, months, month,
                        exclude_cats=_INCOME_CATS | _INVESTMENT_CATS | NEUTRAL_CATEGORIES)


@router.get("/income-by-category")
def income_by_category(
    months: int = Query(default=12, ge=1, le=60),
    month: Optional[str] = Query(default=None, description="Single calendar month YYYY-MM"),
    db: Session = Depends(get_db),
):
    return _by_category(db, months, month, include_cats=_INCOME_CATS)


@router.get("/investment-by-category")
def investment_by_category(
    months: int = Query(default=12, ge=1, le=60),
    month: Optional[str] = Query(default=None, description="Single calendar month YYYY-MM"),
    db: Session = Depends(get_db),
):
    # Buys (etf = passive Sparplan, trading = active) plus sells. The frontend separates
    # the "investment_sell" row (an inflow) from the buy categories (money deployed).
    return _by_category(db, months, month, include_cats=_INVESTMENT_CATS)


@router.get("/summary")
def summary(db: Session = Depends(get_db)):
    accounts = db.query(Account).all()
    deposits = sum(float(a.balance) for a in accounts
                   if a.balance is not None and a.type != "credit_card")
    liabilities = sum(abs(float(a.balance)) for a in accounts
                      if a.balance is not None and a.type == "credit_card")
    assets_val = sum(
        float(a.current_value) * float(a.ownership_pct) / 100.0
        for a in db.query(Asset).all()
        if a.current_value is not None
    )
    net_worth = deposits - liabilities + assets_val

    cutoff = _months_ago(date.today(), 11)
    txs = db.query(Transaction).filter(Transaction.date >= cutoff).all()
    # neutral categories (transfers, deposits) are neither income nor expense
    income = sum(_base_amount(t) for t in txs if t.type in INCOME_TYPES and t.category not in NEUTRAL_CATEGORIES)
    expenses = sum(abs(_base_amount(t)) for t in txs if t.type in EXPENSE_TYPES and t.category not in NEUTRAL_CATEGORIES)
    passive = sum(_base_amount(t) for t in txs if t.type in PASSIVE_TYPES)
    needs_review = db.query(Transaction).filter(Transaction.needs_review == True).count()  # noqa: E712

    goal = db.query(FIGoal).filter(FIGoal.user_id == 1).first()
    fi_target = float(goal.target_net_worth) if goal and goal.target_net_worth else 0.0

    return {
        "net_worth": round(net_worth, 2),
        "passive_income_monthly": round(passive / 12, 2),
        "monthly_expenses": round(expenses / 12, 2),
        "savings_rate": round((income - expenses) / income, 4) if income > 0 else 0.0,
        "needs_review": needs_review,
        "fi_target": round(fi_target, 2),
        "base_monthly_savings": round((income - expenses) / 12, 2) if income > 0 else 0.0,
    }
