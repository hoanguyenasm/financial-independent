from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import CategoryRule, Transaction
from app.schemas import CategoryRuleCreate, CategoryRuleRead, CategoryRuleUpdate

router = APIRouter(prefix="/category-rules", tags=["category-rules"])


@router.post("", response_model=CategoryRuleRead, status_code=201)
def create_rule(payload: CategoryRuleCreate, db: Session = Depends(get_db)):
    rule = CategoryRule(**payload.model_dump())
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.get("", response_model=list[CategoryRuleRead])
def list_rules(db: Session = Depends(get_db)):
    rules = db.query(CategoryRule).order_by(CategoryRule.category, CategoryRule.pattern).all()
    # Count, per rule, how many transactions it currently accounts for so the UI can
    # show the user that their rules are really reflected in the data.
    txs = db.query(Transaction.description, Transaction.category).all()
    result = []
    for r in rules:
        pat = r.pattern.lower()
        count = sum(1 for desc, cat in txs if cat == r.category and pat in (desc or "").lower())
        result.append({
            "id": r.id, "pattern": r.pattern, "category": r.category,
            "account_id": r.account_id, "created_at": r.created_at,
            "match_count": count,
        })
    return result


@router.patch("/{rule_id}", response_model=CategoryRuleRead)
def update_rule(rule_id: int, payload: CategoryRuleUpdate, db: Session = Depends(get_db)):
    rule = db.get(CategoryRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(rule, field, value)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/{rule_id}", status_code=204)
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.get(CategoryRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()
