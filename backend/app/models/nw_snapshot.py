from sqlalchemy import Date, Float
from sqlalchemy.orm import Mapped, mapped_column
from datetime import date
from .base import Base


class NWSnapshot(Base):
    __tablename__ = "nw_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, unique=True, index=True)
    net_worth: Mapped[float] = mapped_column(Float)
