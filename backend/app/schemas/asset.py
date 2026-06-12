from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class AssetCreate(BaseModel):
    account_id: int
    symbol_or_name: str
    asset_type: str
    quantity: float = 1.0
    avg_cost: Optional[float] = None
    current_value: Optional[float] = None
    currency: str
    expected_monthly_income: Optional[float] = None
    ownership_pct: float = 100.0


class AssetUpdate(BaseModel):
    symbol_or_name: Optional[str] = None
    quantity: Optional[float] = None
    avg_cost: Optional[float] = None
    current_value: Optional[float] = None
    expected_monthly_income: Optional[float] = None
    ownership_pct: Optional[float] = None


class AssetRead(BaseModel):
    id: int
    account_id: int
    symbol_or_name: str
    asset_type: str
    quantity: float
    avg_cost: Optional[float]
    current_value: Optional[float]
    currency: str
    expected_monthly_income: Optional[float]
    ownership_pct: float
    last_updated: datetime

    model_config = {"from_attributes": True}
