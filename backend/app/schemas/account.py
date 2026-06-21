from pydantic import BaseModel
from typing import Optional
from datetime import date


class AccountCreate(BaseModel):
    owner_user_id: Optional[int] = None
    name: str
    type: str
    currency: str
    institution: Optional[str] = None
    is_active: bool = True


class AccountUpdate(BaseModel):
    owner_user_id: Optional[int] = None
    name: Optional[str] = None
    type: Optional[str] = None
    currency: Optional[str] = None
    institution: Optional[str] = None
    is_active: Optional[bool] = None


class AccountRead(BaseModel):
    id: int
    owner_user_id: Optional[int]
    name: str
    type: str
    currency: str
    institution: Optional[str]
    is_active: bool
    balance: Optional[float] = None
    balance_as_of: Optional[date] = None

    model_config = {"from_attributes": True}
