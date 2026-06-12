from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.database import get_db
from app.models import FIGoal
from app.schemas import FIGoalCreate, FIGoalRead, FIGoalUpdate

router = APIRouter(prefix="/fi-goals", tags=["fi-goals"])


@router.post("", response_model=FIGoalRead, status_code=201)
def create_fi_goal(payload: FIGoalCreate, db: Session = Depends(get_db)):
    goal = FIGoal(**payload.model_dump())
    db.add(goal)
    try:
        db.commit()
        db.refresh(goal)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="User already has an FI goal")
    return goal


@router.get("/user/{user_id}", response_model=FIGoalRead)
def get_fi_goal_by_user(user_id: int, db: Session = Depends(get_db)):
    goal = db.query(FIGoal).filter(FIGoal.user_id == user_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="FI goal not found for this user")
    return goal


@router.get("/{goal_id}", response_model=FIGoalRead)
def get_fi_goal(goal_id: int, db: Session = Depends(get_db)):
    goal = db.get(FIGoal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="FI goal not found")
    return goal


@router.patch("/{goal_id}", response_model=FIGoalRead)
def update_fi_goal(goal_id: int, payload: FIGoalUpdate, db: Session = Depends(get_db)):
    goal = db.get(FIGoal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="FI goal not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(goal, field, value)
    db.commit()
    db.refresh(goal)
    return goal


@router.delete("/{goal_id}", status_code=204)
def delete_fi_goal(goal_id: int, db: Session = Depends(get_db)):
    goal = db.get(FIGoal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="FI goal not found")
    db.delete(goal)
    db.commit()
