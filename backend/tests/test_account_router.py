import pytest
from app.services.account_router import detect_owner, detect_bank, route_account
from app.models import Account


@pytest.fixture
def accounts(db):
    rows = [
        Account(name="ING Girokonto (Hoa)", type="checking", currency="EUR", institution="ING", is_active=True),
        Account(name="Comdirect (Hoa)", type="checking", currency="EUR", institution="Comdirect", is_active=True),
        Account(name="Scalable Capital (Norah)", type="investment", currency="EUR", institution="Scalable Capital", is_active=True),
        Account(name="Scalable Broker (Norah)", type="investment", currency="EUR", institution="Scalable Capital", is_active=True),
    ]
    db.add_all(rows); db.commit()
    return rows


def test_detect_owner():
    assert detect_owner(r"G:\x\12_Budget_2026\April\Hoa\f.pdf") == "Hoa"
    assert detect_owner(r"G:\x\12_Budget_2026\Mai\Norah\f.pdf") == "Norah"
    assert detect_owner(r"G:\x\nope\f.pdf") is None


def test_detect_bank_comdirect_csv():
    assert detect_bank("umsaetze_977.csv", ['"Umsätze Girokonto";"Zeitraum"']) == "comdirect"
    assert detect_bank("x.pdf", ["TRADE REPUBLIC", "DATUM TYP"]) == "trade_republic"


def test_route_account_and_scalable_disambiguation(db, accounts):
    assert route_account(db, "ing", "Hoa", []) is not None
    assert route_account(db, "comdirect", "Hoa", []) is not None
    cash = route_account(db, "scalable", "Norah", ["Zinsen 5,00 EUR"])
    broker = route_account(db, "scalable", "Norah", ["Kauf eines Finanzinstruments ISIN US123"])
    cash_acc = next(a for a in accounts if a.name == "Scalable Capital (Norah)")
    broker_acc = next(a for a in accounts if a.name == "Scalable Broker (Norah)")
    assert cash == cash_acc.id
    assert broker == broker_acc.id
    assert route_account(db, "revolut", "Hoa", []) is None  # no Revolut (Hoa) account
