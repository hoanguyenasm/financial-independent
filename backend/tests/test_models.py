from pathlib import Path
from sqlalchemy import inspect
from app.database import get_engine
from app.models import Base, User, Account, Transaction, Asset, FIGoal, CategoryRule, FXRate, ImportLog


def test_all_tables_created():
    engine = get_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    assert "users" in tables
    assert "accounts" in tables
    assert "transactions" in tables
    assert "assets" in tables
    assert "fi_goals" in tables
    assert "category_rules" in tables
    assert "fx_rates" in tables
    assert "import_logs" in tables


def test_transaction_has_dual_currency_fields():
    engine = get_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    columns = {c["name"] for c in inspector.get_columns("transactions")}
    assert "amount" in columns
    assert "currency" in columns
    assert "amount_base" in columns
    assert "fx_rate" in columns
    assert "needs_review" in columns
    assert "asset_id" in columns
