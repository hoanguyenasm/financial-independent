from sqlalchemy import String, Boolean, ForeignKey, Numeric, Date
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional
from datetime import date
from .base import Base


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(50))
    currency: Mapped[str] = mapped_column(String(10))
    institution: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    balance: Mapped[Optional[float]] = mapped_column(Numeric(18, 2), nullable=True)
    balance_as_of: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
