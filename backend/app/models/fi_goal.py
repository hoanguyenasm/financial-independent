from sqlalchemy import Date, Numeric, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from datetime import date
from typing import Optional
from .base import Base


class FIGoal(Base):
    __tablename__ = "fi_goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    target_net_worth: Mapped[Optional[float]] = mapped_column(Numeric(18, 2), nullable=True)
    target_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    monthly_expenses_override: Mapped[Optional[float]] = mapped_column(Numeric(18, 2), nullable=True)
    passive_income_target: Mapped[Optional[float]] = mapped_column(Numeric(18, 2), nullable=True)
    safe_withdrawal_rate: Mapped[float] = mapped_column(Numeric(5, 4), default=0.04)
    investment_return_rate: Mapped[float] = mapped_column(Numeric(5, 4), default=0.07)
    inflation_rate: Mapped[float] = mapped_column(Numeric(5, 4), default=0.03)
