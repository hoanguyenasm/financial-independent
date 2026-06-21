from app.parsers.balance_extractor import extract_balance


def test_comdirect_neuer_kontostand():
    lines = ['"Neuer Kontostand";"1.375,84 EUR";', '"Alter Kontostand";"3.927,83 EUR";']
    assert extract_balance("comdirect", lines) == 1375.84


def test_scalable_latest_kontostand_am():
    lines = ["Kontostand am 01.04.2026 1.960,06 EUR", "Kontostand am 30.04.2026 1.075,16 EUR"]
    assert extract_balance("scalable", lines) == 1075.16


def test_ing_neuer_saldo():
    assert extract_balance("ing", ["Neuer Saldo 0,00 Euro"]) == 0.0


def test_amex_neuer_saldo_amount_owed():
    lines = ["Zu zahlender Betrag", "Neuer Saldo 295,36"]
    assert extract_balance("amex", lines) == 295.36


def test_amex_saldo_laufenden_monats_real_format():
    lines = [
        "Saldo der letzten Gutschriften Neue Belastungen Neuer Saldo Zu zahlender",
        "Saldo des laufenden Monats fürHERRN DUC HOA NGUYEN",
        "Saldo des laufenden Monats fürHERRN DUC HOA NGUYEN 295,36",
    ]
    assert extract_balance("amex", lines) == 295.36


def test_trade_republic_last_running_balance():
    lines = ["12 Apr Zinsen 59,58€ 35.131,57€", "13 Apr Kauf 100,00€ 35.031,57€"]
    assert extract_balance("trade_republic", lines) == 35031.57


def test_revolut_last_balance():
    lines = ["01.04.2026 Salary 100,00€ 1.100,00€", "05.04.2026 Shop 20,00€ 1.080,00€"]
    assert extract_balance("revolut", lines) == 1080.00


def test_unknown_or_missing_returns_none():
    assert extract_balance("comdirect", ["no balance here"]) is None
    assert extract_balance("nonsense", ["whatever"]) is None
