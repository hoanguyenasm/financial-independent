from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class CategoryRuleCreate(BaseModel):
    pattern: str
    category: str
    account_id: Optional[int] = None


class CategoryRuleRead(BaseModel):
    id: int
    pattern: str
    category: str
    account_id: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}
