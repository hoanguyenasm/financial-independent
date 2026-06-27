from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class CategoryRuleCreate(BaseModel):
    pattern: str
    category: str
    account_id: Optional[int] = None


class CategoryRuleUpdate(BaseModel):
    pattern: Optional[str] = None
    category: Optional[str] = None


class CategoryRuleRead(BaseModel):
    id: int
    pattern: str
    category: str
    account_id: Optional[int]
    created_at: datetime
    # How many existing transactions this rule currently accounts for (description
    # contains the pattern AND is categorized as the rule's category). None when not computed.
    match_count: Optional[int] = None

    model_config = {"from_attributes": True}
