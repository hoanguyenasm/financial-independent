from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date
import calendar
from app.database import get_db
from app.models import Transaction
from app.schemas import TransactionCreate, TransactionRead, TransactionUpdate

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _months_ago(d: date, months: int) -> date:
    total = d.year * 12 + (d.month - 1) - months
    return date(total // 12, total % 12 + 1, 1)


@router.get("/needs-review-count")
def needs_review_count(db: Session = Depends(get_db)):
    count = db.query(Transaction).filter(Transaction.needs_review == True).count()
    return {"count": count}


@router.post("", response_model=TransactionRead, status_code=201)
def create_transaction(payload: TransactionCreate, db: Session = Depends(get_db)):
    tx = Transaction(**payload.model_dump())
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.get("", response_model=list[TransactionRead])
def list_transactions(
    account_id: Optional[int] = None,
    user_id: Optional[int] = None,
    category: Optional[str] = None,
    needs_review: Optional[bool] = None,
    month: Optional[str] = Query(default=None, description="Single calendar month YYYY-MM"),
    months: Optional[int] = Query(default=None, ge=1, le=60, description="Trailing window in months"),
    skip: int = 0,
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(Transaction)
    if account_id:
        q = q.filter(Transaction.account_id == account_id)
    if user_id:
        q = q.filter(Transaction.user_id == user_id)
    if category:
        q = q.filter(Transaction.category == category)
    if needs_review is not None:
        q = q.filter(Transaction.needs_review == needs_review)
    if month:
        y, m = (int(p) for p in month.split("-"))
        q = q.filter(
            Transaction.date >= date(y, m, 1),
            Transaction.date <= date(y, m, calendar.monthrange(y, m)[1]),
        )
    elif months:
        q = q.filter(Transaction.date >= _months_ago(date.today(), months - 1))
    return q.order_by(Transaction.date.desc()).offset(skip).limit(limit).all()


@router.get("/{tx_id}", response_model=TransactionRead)
def get_transaction(tx_id: int, db: Session = Depends(get_db)):
    tx = db.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return tx


_CAT_TO_TYPE: dict[str, str] = {
    "salary": "income", "rental": "income", "airbnb": "income", "income": "income",
    "interest": "interest", "dividend": "dividend",
    "etf": "investment_buy", "trading": "investment_buy",
    "crypto": "investment_buy", "gold": "investment_buy", "investment_buy": "investment_buy",
    "investment_sell": "investment_sell",
    "investment_fees": "fee",
    "transfer": "transfer", "deposit": "transfer", "reimbursement": "transfer",
}


@router.patch("/{tx_id}", response_model=TransactionRead)
def update_transaction(tx_id: int, payload: TransactionUpdate, db: Session = Depends(get_db)):
    tx = db.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    data = payload.model_dump(exclude_none=True)
    for field, value in data.items():
        setattr(tx, field, value)
    # Sync type from category unless the caller explicitly provided a type.
    if "category" in data and "type" not in data:
        cat = data["category"]
        inferred = _CAT_TO_TYPE.get(cat)
        if inferred:
            # investment buys are positive for sells, negative for buys — use amount sign.
            if inferred == "investment_buy" and float(tx.amount) > 0:
                inferred = "investment_sell"
            tx.type = inferred
        else:
            tx.type = "expense"
    db.commit()
    db.refresh(tx)
    return tx


@router.delete("", status_code=204)
def delete_all_transactions(db: Session = Depends(get_db)):
    db.query(Transaction).delete()
    db.commit()


@router.delete("/{tx_id}", status_code=204)
def delete_transaction(tx_id: int, db: Session = Depends(get_db)):
    tx = db.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(tx)
    db.commit()
