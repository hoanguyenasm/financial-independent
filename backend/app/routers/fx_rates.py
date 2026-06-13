from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.models import FXRate
from app.schemas import FXRateUpsert, FXRateRead

router = APIRouter(prefix="/fx-rates", tags=["fx-rates"])


@router.put("", response_model=FXRateRead)
def upsert_rate(payload: FXRateUpsert, db: Session = Depends(get_db)):
    existing = (
        db.query(FXRate)
        .filter(
            FXRate.from_currency == payload.from_currency,
            FXRate.to_currency == payload.to_currency,
            FXRate.date == payload.date,
        )
        .first()
    )
    if existing:
        existing.rate = payload.rate
        db.commit()
        db.refresh(existing)
        return existing
    rate = FXRate(**payload.model_dump())
    db.add(rate)
    db.commit()
    db.refresh(rate)
    return rate


@router.get("", response_model=list[FXRateRead])
def list_rates(from_currency: Optional[str] = None, to_currency: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(FXRate)
    if from_currency:
        q = q.filter(FXRate.from_currency == from_currency)
    if to_currency:
        q = q.filter(FXRate.to_currency == to_currency)
    return q.order_by(FXRate.date.desc()).all()


@router.get("/latest", response_model=FXRateRead)
def latest_rate(from_currency: str, to_currency: str, db: Session = Depends(get_db)):
    rate = (
        db.query(FXRate)
        .filter(FXRate.from_currency == from_currency, FXRate.to_currency == to_currency)
        .order_by(FXRate.date.desc())
        .first()
    )
    if not rate:
        raise HTTPException(status_code=404, detail="No rate for this currency pair")
    return rate
