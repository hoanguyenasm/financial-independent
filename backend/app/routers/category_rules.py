from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import CategoryRule
from app.schemas import CategoryRuleCreate, CategoryRuleRead

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
    return db.query(CategoryRule).all()


@router.delete("/{rule_id}", status_code=204)
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.get(CategoryRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()
