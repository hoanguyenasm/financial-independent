from pydantic import BaseModel
from datetime import date


class FXRateUpsert(BaseModel):
    from_currency: str
    to_currency: str
    rate: float
    date: date


class FXRateRead(BaseModel):
    id: int
    from_currency: str
    to_currency: str
    rate: float
    date: date

    model_config = {"from_attributes": True}
