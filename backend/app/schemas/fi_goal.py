from pydantic import BaseModel
from datetime import date
from typing import Optional


class FIGoalCreate(BaseModel):
    user_id: int
    target_net_worth: Optional[float] = None
    target_date: Optional[date] = None
    monthly_expenses_override: Optional[float] = None
    passive_income_target: Optional[float] = None
    safe_withdrawal_rate: float = 0.04
    investment_return_rate: float = 0.07
    inflation_rate: float = 0.03


class FIGoalUpdate(BaseModel):
    target_net_worth: Optional[float] = None
    target_date: Optional[date] = None
    monthly_expenses_override: Optional[float] = None
    passive_income_target: Optional[float] = None
    safe_withdrawal_rate: Optional[float] = None
    investment_return_rate: Optional[float] = None
    inflation_rate: Optional[float] = None


class FIGoalRead(BaseModel):
    id: int
    user_id: int
    target_net_worth: Optional[float]
    target_date: Optional[date]
    monthly_expenses_override: Optional[float]
    passive_income_target: Optional[float]
    safe_withdrawal_rate: float
    investment_return_rate: float
    inflation_rate: float

    model_config = {"from_attributes": True}
