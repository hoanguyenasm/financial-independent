import io
import pytest
from datetime import date

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
