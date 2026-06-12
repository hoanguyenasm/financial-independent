from datetime import date
from app.schemas import TransactionCreate, AssetCreate, FIGoalCreate


def test_transaction_schema_defaults():
    t = TransactionCreate(
        account_id=1, user_id=1, date=date.today(),
        amount=100.0, currency="USD", description="Coffee",
        type="expense"
    )
    assert t.category == "uncategorized"
    assert t.needs_review == False
    assert t.source == "manual"


def test_asset_schema_defaults():
    a = AssetCreate(account_id=1, symbol_or_name="AAPL", asset_type="stock", currency="USD")
    assert a.quantity == 1.0
    assert a.ownership_pct == 100.0


def test_fi_goal_schema_defaults():
    g = FIGoalCreate(user_id=1)
    assert g.safe_withdrawal_rate == 0.04
    assert g.investment_return_rate == 0.07
    assert g.inflation_rate == 0.03
