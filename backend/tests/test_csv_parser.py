import io
from datetime import date
import pytest
from app.parsers.csv_parser import parse_csv, decode_csv_bytes
from app.parsers.models import ParsedRow


SEMICOLON_CSV = """\
Buchungsdatum;Verwendungszweck;Betrag;Währung
01.05.2026;REWE Supermarkt;-42.80;EUR
05.05.2026;Gehalt Robert Bosch GmbH;7293.00;EUR
10.05.2026;Netflix;-17.99;EUR
"""

COMMA_CSV = """\
date,description,amount,currency
2026-05-01,REWE Supermarkt,-42.80,EUR
2026-05-05,Salary,7293.00,EUR
"""

SOLL_HABEN_CSV = """\
Buchungsdatum;Buchungstext;Soll;Haben;Währung
01.05.2026;REWE;42.80;;EUR
05.05.2026;Gehalt;;7293.00;EUR
"""


def test_parse_semicolon_csv():
    rows = parse_csv(io.StringIO(SEMICOLON_CSV))
    assert len(rows) == 3
    assert rows[0] == ParsedRow(date=date(2026, 5, 1), description="REWE Supermarkt", amount=-42.80, currency="EUR")
    assert rows[1].amount == 7293.00
    assert rows[2].amount == -17.99


def test_parse_comma_csv():
    rows = parse_csv(io.StringIO(COMMA_CSV))
    assert len(rows) == 2
    assert rows[0].date == date(2026, 5, 1)
    assert rows[0].description == "REWE Supermarkt"
    assert rows[0].currency == "EUR"


def test_parse_soll_haben_csv():
    rows = parse_csv(io.StringIO(SOLL_HABEN_CSV))
    assert len(rows) == 2
    assert rows[0].amount == -42.80   # Soll → negative
    assert rows[1].amount == 7293.00  # Haben → positive


def test_default_currency_fallback():
    no_cur = "date,description,amount\n2026-05-01,REWE,-42.80\n"
    rows = parse_csv(io.StringIO(no_cur), default_currency="USD")
    assert rows[0].currency == "USD"


def test_parse_csv_file(tmp_path):
    src = tmp_path / "sample.csv"
    src.write_text(SEMICOLON_CSV, encoding="utf-8")
    with open(src, encoding="utf-8") as f:
        rows = parse_csv(f)
    assert len(rows) == 3


def test_empty_csv_returns_empty_list():
    rows = parse_csv(io.StringIO("Buchungsdatum;Verwendungszweck;Betrag\n"))
    assert rows == []


def test_malformed_amount_row_is_skipped():
    bad = "date,description,amount\n2026-05-01,REWE,not-a-number\n"
    rows = parse_csv(io.StringIO(bad))
    assert rows == []


ING_CSV = """\
Umsatzanzeige;Datei erstellt am: 28.06.2026 12:21

IBAN;DE46 5001 0517 5455 6766 79
Kontoname;Girokonto
Bank;ING
Kunde;Duc Hoa Nguyen
Zeitraum;01.01.2026 - 28.06.2026
Saldo;0,00;EUR

Sortierung;Datum absteigend

Buchung;Wertstellungsdatum;Auftraggeber/Empfänger;Buchungstext;Verwendungszweck;Saldo;Währung;Betrag;Währung
29.06.2026;28.06.2026;Duc Hoa Nguyen;Echtzeitüberweisung;;0,00;EUR;-990,00;EUR
27.06.2026;27.06.2026;Yarob Abbas;Gutschrift;Die Miete;990,00;EUR;990,00;EUR
"""


def test_parse_ing_csv_with_decimal_comma_amounts():
    """ING's semicolon-delimited export uses comma decimals (-990,00), which used to
    make the delimiter sniffer pick ',' and collapse every row into one field."""
    rows = parse_csv(io.StringIO(ING_CSV))
    assert len(rows) == 2
    assert rows[0].date == date(2026, 6, 29)
    assert rows[0].amount == -990.00
    assert rows[1].amount == 990.00
    assert rows[1].currency == "EUR"


def test_comdirect_csv_with_preamble_and_umsatz_header():
    raw = (
        '\n'
        '"Umsätze Girokonto";"Zeitraum: 01.04.2026 - 30.04.2026";\n'
        '"Neuer Kontostand";"1.375,84 EUR";\n'
        '\n'
        '"Buchungstag";"Wertstellung (Valuta)";"Vorgang";"Buchungstext";"Umsatz in EUR";\n'
        '"17.04.2026";"17.04.2026";"Übertrag / Überweisung";"Auftraggeber: Abderrazak Aloui Buchungstext: Miete";"400,00";\n'
        '"19.04.2026";"19.04.2026";"Lastschrift / Belastung";"Auftraggeber: Vodafone GmbH Buchungstext: Mobilfunk";"-29,99";\n'
    ).encode('cp1252')
    rows = parse_csv(io.StringIO(decode_csv_bytes(raw)))
    assert len(rows) == 2
    assert rows[0].amount == 400.00
    assert 'Miete' in rows[0].description
    assert rows[1].amount == -29.99
