import pytest
from app.services.account_router import detect_owner, detect_owner_from_text, detect_bank, route_account
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
    assert detect_owner(r"G:\x\Hoangs-stuff\f.pdf") is None


def test_detect_owner_from_text():
    # Browser uploads have no folder path; owner is read from the statement body.
    assert detect_owner_from_text(["Custom Statement", "DUC HOA NGUYEN", "..."]) == "Hoa"
    assert detect_owner_from_text(["Kontoauszug", "Inhaber: Bao Ngoc Pham"]) == "Norah"
    assert detect_owner_from_text(["no owner name here"]) is None


def test_detect_bank_comdirect_csv():
    assert detect_bank("umsaetze_977.csv", ['"Umsätze Girokonto";"Zeitraum"']) == "comdirect"
    assert detect_bank("x.pdf", ["TRADE REPUBLIC", "DATUM TYP"]) == "trade_republic"


def test_detect_bank_ing_csv():
    # ING's CSV "Umsatzanzeige" export — signature is a `Bank;ING` line, not the
    # ING-DiBa PDF header.
    ing_csv_lines = [
        "Umsatzanzeige;Datei erstellt am: 28.06.2026 12:21",
        "",
        "IBAN;DE46 5001 0517 5455 6766 79",
        "Kontoname;Girokonto",
        "Bank;ING",
        "Kunde;Duc Hoa Nguyen",
        "Buchung;Wertstellungsdatum;Auftraggeber/Empfänger;Buchungstext;Verwendungszweck;Saldo;Währung;Betrag;Währung",
        "29.06.2026;28.06.2026;Duc Hoa Nguyen;Echtzeitüberweisung;;0,00;EUR;-990,00;EUR",
    ]
    assert detect_bank("ING_Umsatzanzeige_DE46_20260628.csv", ing_csv_lines) == "ing"


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
