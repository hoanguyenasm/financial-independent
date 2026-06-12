from sqlalchemy import String, DateTime, Numeric, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, UTC
from typing import Optional
from .base import Base


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    symbol_or_name: Mapped[str] = mapped_column(String(200))
    asset_type: Mapped[str] = mapped_column(String(50))
    quantity: Mapped[float] = mapped_column(Numeric(18, 8), default=1)
    avg_cost: Mapped[Optional[float]] = mapped_column(Numeric(18, 4), nullable=True)
    current_value: Mapped[Optional[float]] = mapped_column(Numeric(18, 4), nullable=True)
    currency: Mapped[str] = mapped_column(String(10))
    expected_monthly_income: Mapped[Optional[float]] = mapped_column(Numeric(18, 4), nullable=True)
    ownership_pct: Mapped[float] = mapped_column(Numeric(5, 2), default=100.0)
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
