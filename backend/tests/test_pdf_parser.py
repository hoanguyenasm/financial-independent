import io
import pytest
from datetime import date

from app.parsers.pdf_parser import (
    _parse_ing,
    _parse_trade_republic,
    _parse_revolut,
    _parse_scalable,
    _parse_amex,
)
from app.parsers.models import ParsedRow

pytest.importorskip("reportlab")

from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle
from reportlab.lib import colors
from app.parsers.pdf_parser import parse_pdf
from app.parsers.models import ParsedRow


def _make_pdf_bytes(rows: list[list[str]]) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4)
    style = TableStyle([
        ("GRID", (0, 0), (-1, -1), 1, colors.black),
        ("BOX", (0, 0), (-1, -1), 1, colors.black),
    ])
    table = Table(rows, style=style)
    doc.build([table])
    return buf.getvalue()


def test_parse_pdf_with_table():
    data = [
        ["Buchungsdatum", "Verwendungszweck", "Betrag", "Währung"],
        ["01.05.2026", "REWE Supermarkt", "-42.80", "EUR"],
        ["05.05.2026", "Gehalt Robert Bosch", "7293.00", "EUR"],
    ]
    pdf_bytes = _make_pdf_bytes(data)
    rows = parse_pdf(io.BytesIO(pdf_bytes))
    assert len(rows) == 2
    assert rows[0] == ParsedRow(date=date(2026, 5, 1), description="REWE Supermarkt", amount=-42.80, currency="EUR")
    assert rows[1].amount == 7293.00


def test_parse_pdf_empty_table():
    data = [["Buchungsdatum", "Verwendungszweck", "Betrag", "Währung"]]
    pdf_bytes = _make_pdf_bytes(data)
    rows = parse_pdf(io.BytesIO(pdf_bytes))
    assert rows == []


def test_parse_pdf_default_currency():
    data = [
        ["date", "description", "amount"],
        ["2026-05-01", "REWE", "-42.80"],
    ]
    pdf_bytes = _make_pdf_bytes(data)
    rows = parse_pdf(io.BytesIO(pdf_bytes), default_currency="USD")
    assert rows[0].currency == "USD"


def test_parse_pdf_no_tables_page():
    """Pages with no detectable tables should return empty list, not crash."""
    from reportlab.platypus import Paragraph
    from reportlab.lib.styles import getSampleStyleSheet

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4)
    styles = getSampleStyleSheet()
    doc.build([Paragraph("No tables here.", styles["Normal"])])
    buf.seek(0)
    rows = parse_pdf(buf)
    assert rows == []


# ── text-based parser unit tests ──────────────────────────────────────────────

def test_parse_ing_basic():
    lines = [
        "Kontoauszug ING-DiBa",
        "02.04.2026 Gutschrift Kadir Dora 430,00",
        "07.04.2026 Echtzeit-überweisung Duc Hoa Nguyen -430,00",
        "Some other non-matching line",
    ]
    rows = _parse_ing(lines)
    assert len(rows) == 2
    assert rows[0] == ParsedRow(date=date(2026, 4, 2), description="Gutschrift Kadir Dora", amount=430.0, currency="EUR")
    assert rows[1].amount == -430.0


def test_parse_ing_umsatzanzeige_multiline():
    """ING 'Umsatzanzeige' PDF export: each transaction spans 2-3 lines —
    'date counterparty saldo€ ±betrag€', then 'date buchungstext', then an
    optional purpose line. The signed Betrag (last €-amount) is the amount."""
    lines = [
        "Umsatzanzeige",
        "Bank ING",
        "Buchung Auftraggeber/Empfänger Saldo Betrag",
        "Wertstellun Buchungstext",
        "29.06.2026 Yarob Abbas 990,00 € +990,00 €",
        "27.06.2026 Gutschrift Echtzeitüberweisung",
        "Die Miete",
        "29.06.2026 Duc Hoa Nguyen 0,00 € -990,00 €",
        "28.06.2026 Echtzeitüberweisung",
    ]
    rows = _parse_ing(lines)
    assert len(rows) == 2
    assert rows[0].date == date(2026, 6, 29)
    assert rows[0].amount == 990.00
    assert "Yarob Abbas" in rows[0].description
    assert "Die Miete" in rows[0].description
    assert rows[1].amount == -990.00
    assert "Duc Hoa Nguyen" in rows[1].description


def test_parse_ing_kontoauszug_still_works():
    """The single-line Kontoauszug layout must keep parsing after adding the
    multi-line Umsatzanzeige branch."""
    lines = [
        "Kontoauszug ING-DiBa",
        "02.04.2026 Gutschrift Kadir Dora 430,00",
        "07.04.2026 Echtzeit-überweisung Duc Hoa Nguyen -430,00",
    ]
    rows = _parse_ing(lines)
    assert len(rows) == 2
    assert rows[0].amount == 430.0
    assert rows[1].amount == -430.0


def test_parse_trade_republic_income_and_expense():
    lines = [
        "TRADE REPUBLIC BANK GMBH BRUNNENSTRASSE 19-21 10119 BERLIN",
        "Cashkonto 5.428,06 € 5.892,02 € 10.673,30 € 646,78 €",
        "DATUM TYP BESCHREIBUNG ZAHLUNGSEINGANGZAHLUNGSAUSGANG SALDO",
        "01 Apr.",
        "Zinsen Interest payment 9,48 € 5.437,54 €",
        "2026",
        "02 Apr.",
        "Handel -Amundi ETF 150,00 € 5.287,54 €",
        "2026",
    ]
    rows = _parse_trade_republic(lines)
    assert len(rows) == 2
    assert rows[0].amount > 0  # interest income
    assert rows[0].date == date(2026, 4, 1)
    assert rows[1].amount < 0  # investment purchase
    assert rows[1].date == date(2026, 4, 2)


def test_parse_revolut_uses_balance_delta():
    lines = [
        "EUR-Kontoauszug",
        "Revolut Bank UAB",
        "Konto (Girokonto) 0,32€ 200,00€ 300,00€ 100,32€",
        "Datum Beschreibung Geldausgang Geldeingang Kontostand",
        "01.04.2026 Von EUR Flexible Geldmarktfonds 95,00€ 95,32€",
        "02.04.2026 Apotheke 95,00€ 0,32€",
    ]
    rows = _parse_revolut(lines)
    assert len(rows) == 2
    assert rows[0].amount == 95.0    # balance went up: income
    assert rows[1].amount == -95.0   # balance went down: expense


def test_parse_revolut_consolidated_eur_and_foreign():
    from app.parsers.pdf_parser import (
        _looks_like_revolut_consolidated,
        _parse_revolut_consolidated,
    )
    lines = [
        "Custom Statement",
        "Current Accounts Transaction Statements",
        "Personal Account (EUR)",
        "Transaction statement",
        "Date Description Category Balance Fees",
        "May 4, 2026 From Instant Access Savings Others €160.00 €330.00 €0.00 €0.00 €0.00",
        "May 4, 2026 Transfer to BAO NGOC PHAM Others -€425.00 €5.00 €0.00 €0.00 €0.00",
        "May 9, 2026 Tesla Merchant -€7.45 €47.55 €0.00 €0.00 €0.00",
        "Personal Account (VND)",
        "Transaction statement",
        "May 2, 2026 Netflix Merchant -114,000 2,339,269 0 VND 0 VND 0 VND",
        "VND VND €0.00 €0.00 €0.00",
        "-€3.69 €75.80",
    ]
    assert _looks_like_revolut_consolidated(lines)
    rows = _parse_revolut_consolidated(lines)
    assert len(rows) == 4
    assert (rows[0].description, rows[0].amount) == ("From Instant Access Savings", 160.00)
    assert (rows[1].description, rows[1].amount) == ("Transfer to BAO NGOC PHAM", -425.00)
    assert (rows[2].description, rows[2].amount) == ("Tesla", -7.45)
    # foreign pocket normalized to its EUR equivalent
    assert (rows[3].description, rows[3].amount, rows[3].currency) == ("Netflix", -3.69, "EUR")


def test_parse_scalable_signs():
    lines = [
        "Scalable Capital Bank GmbH",
        "Buchung Wertstellung Beschreibung Betrag",
        "13.04.2026 13.04.2026 Überweisung +500,00 EUR",
        "07.04.2026 07.04.2026 Kauf eines Finanzinstruments -150,00 EUR",
    ]
    rows = _parse_scalable(lines)
    assert len(rows) == 2
    assert rows[0].amount == 500.0
    assert rows[1].amount == -150.0


def test_parse_scalable_appends_security_and_isin():
    """Scalable lists the security + ISIN on the line after each buy. The parser must
    fold it into the description so ETF Sparplans can be told apart by ISIN (otherwise
    every buy reads identically as 'Kauf eines Finanzinstruments')."""
    lines = [
        "Scalable Capital Bank GmbH",
        "Buchung Wertstellung Beschreibung Betrag",
        "04.12.2025 08.12.2025 Kauf eines Finanzinstruments -100,00 EUR",
        "4,01 Stk. WisdomTree Cybersecurity (Acc) (IE00BLPK3577)",
        "05.12.2025 09.12.2025 Kauf eines Finanzinstruments -340,80 EUR",
        "8,00 Stk. Rocket Lab (US7731211089)",
        "13.04.2026 13.04.2026 Überweisung +500,00 EUR",
    ]
    rows = _parse_scalable(lines)
    assert len(rows) == 3
    assert rows[0].amount == -100.0
    assert "WisdomTree Cybersecurity" in rows[0].description
    assert "IE00BLPK3577" in rows[0].description
    assert "US7731211089" in rows[1].description
    # a row without a 'Stk.' continuation keeps its plain description
    assert rows[2].description == "Überweisung"


def test_parse_amex_gutschrift_on_next_line():
    lines = [
        "American Express Kontoauszug 2026",
        "27.04 27.04 ZAHLUNG/ÜBERWEISUNG ERHALTEN BESTEN DANK 1.468,66",
        "Karten-Nr. xxxx-xxxxxx-01006 GUTSCHRIFT",
        "22.04 24.04 PAYPAL *SATURN 99,99",
    ]
    rows = _parse_amex(lines)
    assert len(rows) == 2
    assert rows[0].amount == 1468.66   # GUTSCHRIFT on next line → positive
    assert rows[1].amount == -99.99    # regular purchase → negative
