from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from collections import defaultdict
from datetime import date
from app.database import get_db
from app.models import Transaction

router = APIRouter(prefix="/analytics", tags=["analytics"])

INCOME_TYPES = {"income", "dividend", "interest", "investment_sell"}
EXPENSE_TYPES = {"expense", "fee"}


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
        key = tx.date.strftime("%Y-%m")
        amount = _base_amount(tx)
        if tx.type in INCOME_TYPES:
            buckets[key]["income"] += amount
        elif tx.type in EXPENSE_TYPES:
            buckets[key]["expense"] += abs(amount)
    return [
        {
            "month": month,
            "income": round(vals["income"], 2),
            "expense": round(vals["expense"], 2),
            "net": round(vals["income"] - vals["expense"], 2),
        }
        for month, vals in sorted(buckets.items())
    ]
