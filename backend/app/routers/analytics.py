from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from collections import defaultdict
from datetime import date
from app.database import get_db
from app.models import Asset, Transaction, FIGoal

router = APIRouter(prefix="/analytics", tags=["analytics"])

INCOME_TYPES = {"income", "dividend", "interest", "investment_sell"}
EXPENSE_TYPES = {"expense", "fee"}
PASSIVE_TYPES = {"dividend", "interest"}


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
        if tx.category == "transfer":  # internal movements are not income or expense
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


@router.get("/expense-by-category")
def expense_by_category(months: int = Query(default=12, ge=1, le=60), db: Session = Depends(get_db)):
    cutoff = _months_ago(date.today(), months - 1)
    txs = db.query(Transaction).filter(
        Transaction.date >= cutoff,
        Transaction.type.in_(EXPENSE_TYPES),
        Transaction.category != "transfer",  # exclude internal movements
    ).all()
    totals: dict[str, float] = defaultdict(float)
    counts: dict[str, int] = defaultdict(int)
    for tx in txs:
        cat = tx.category or "uncategorized"
        totals[cat] += abs(_base_amount(tx))
        counts[cat] += 1
    return [
        {"category": cat, "total_base": round(totals[cat], 2), "txn_count": counts[cat]}
        for cat in sorted(totals, key=lambda c: totals[c], reverse=True)
    ]


@router.get("/summary")
def summary(db: Session = Depends(get_db)):
    net_worth = sum(
        float(a.current_value) * float(a.ownership_pct) / 100.0
        for a in db.query(Asset).all()
        if a.current_value is not None
    )

    cutoff = _months_ago(date.today(), 11)
    txs = db.query(Transaction).filter(Transaction.date >= cutoff).all()
    # internal movements (category "transfer") are neither income nor expense
    income = sum(_base_amount(t) for t in txs if t.type in INCOME_TYPES and t.category != "transfer")
    expenses = sum(abs(_base_amount(t)) for t in txs if t.type in EXPENSE_TYPES and t.category != "transfer")
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
