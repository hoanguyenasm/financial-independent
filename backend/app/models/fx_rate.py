from sqlalchemy import String, Date, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from datetime import date
from .base import Base


class FXRate(Base):
    __tablename__ = "fx_rates"
    __table_args__ = (UniqueConstraint("from_currency", "to_currency", "date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    from_currency: Mapped[str] = mapped_column(String(10), index=True)
    to_currency: Mapped[str] = mapped_column(String(10), index=True)
    rate: Mapped[float] = mapped_column(Numeric(18, 8))
    date: Mapped[date] = mapped_column(Date, index=True)
