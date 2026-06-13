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
