from sqlalchemy import String, Boolean, Date, DateTime, Numeric, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from datetime import date, datetime, UTC
from typing import Optional
from .base import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    amount: Mapped[float] = mapped_column(Numeric(18, 4))
    currency: Mapped[str] = mapped_column(String(10))
    amount_base: Mapped[Optional[float]] = mapped_column(Numeric(18, 4), nullable=True)
    fx_rate: Mapped[Optional[float]] = mapped_column(Numeric(18, 8), nullable=True)
    description: Mapped[str] = mapped_column(String(500))
    category: Mapped[str] = mapped_column(String(100), default="uncategorized", index=True)
    type: Mapped[str] = mapped_column(String(50))
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    source: Mapped[str] = mapped_column(String(20))
    asset_id: Mapped[Optional[int]] = mapped_column(ForeignKey("assets.id"), nullable=True)
    imported_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
