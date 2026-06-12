from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional


class TransactionCreate(BaseModel):
    account_id: int
    user_id: int
    date: date
    amount: float
    currency: str
    amount_base: Optional[float] = None
    fx_rate: Optional[float] = None
    description: str
    category: str = "uncategorized"
    type: str
    needs_review: bool = False
    source: str = "manual"
    asset_id: Optional[int] = None


class TransactionUpdate(BaseModel):
    category: Optional[str] = None
    needs_review: Optional[bool] = None
    type: Optional[str] = None
    asset_id: Optional[int] = None
    amount_base: Optional[float] = None
    fx_rate: Optional[float] = None


class TransactionRead(BaseModel):
    id: int
    account_id: int
    user_id: int
    date: date
    amount: float
    currency: str
    amount_base: Optional[float]
    fx_rate: Optional[float]
    description: str
    category: str
    type: str
    needs_review: bool
    source: str
    asset_id: Optional[int]
    imported_at: datetime

    model_config = {"from_attributes": True}
