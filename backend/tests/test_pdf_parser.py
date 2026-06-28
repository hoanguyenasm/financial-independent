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


def _make_tr_pdf() -> bytes:
    """Build a PDF mimicking Trade Republic's vertically-stacked table layout: the
    DATUM column (day / Mon. / year) is stacked, and a Sparplan's security name wraps
    onto lines above/below the amount line."""
    from reportlab.pdfgen import canvas as _canvas
    buf = io.BytesIO()
    c = _canvas.Canvas(buf, pagesize=A4)
    c.setFont("Helvetica", 9)

    def put(parts, y):  # parts: list of (x, text)
        for x, text in parts:
            c.drawString(x, y, text)

    put([(74, "TRADE REPUBLIC BANK GMBH")], 820)
    put([(74, "Cashkonto"), (400, "1.000,00"), (430, "€")], 800)
    put([(74, "DATUM"), (140, "TYP"), (200, "BESCHREIBUNG")], 780)
    # Txn 1: interest +10,00 -> balance 1.010,00
    put([(74, "01")], 760)
    put([(74, "Jan."), (100, "Zinsen Interest payment"), (400, "10,00"), (430, "€"), (470, "1.010,00"), (520, "€")], 748)
    put([(74, "2026")], 736)
    # Txn 2: Sparplan buy -200,00 -> balance 810,00 (security name wraps above + below)
    put([(74, "02")], 712)
    put([(100, "Savings plan execution IE00B5BMR087 iShares")], 700)
    put([(74, "Jan."), (100, "Handel"), (400, "200,00"), (430, "€"), (470, "810,00"), (520, "€")], 688)
    put([(100, "Core S&P 500 UCITS ETF USD Acc quantity 0.3")], 676)
    put([(74, "2026")], 664)
    c.showPage()
    c.save()
    return buf.getvalue()


def test_parse_trade_republic_coordinates_capture_sparplan_and_signs():
    rows = parse_pdf(io.BytesIO(_make_tr_pdf()))
    assert len(rows) == 2
    # interest: balance rose -> income (positive), dated from the stacked DATUM column
    assert rows[0].amount == 10.0
    assert rows[0].date == date(2026, 1, 1)
    # Sparplan: balance fell -> expense (negative); wrapped security name + ISIN folded in
    assert rows[1].amount == -200.0
    assert rows[1].date == date(2026, 1, 2)
    assert "IE00B5BMR087" in rows[1].description
    assert "Savings plan execution" in rows[1].description


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
