import csv
import io
from datetime import date, datetime
from typing import TextIO
from .models import ParsedRow

_DATE_FORMATS = ["%d.%m.%Y", "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%d.%m.%y"]
_DATE_HEADERS = {"date", "datum", "buchungsdatum", "buchung", "valutadatum", "valuta"}
_DESC_HEADERS = {"description", "verwendungszweck", "buchungstext", "payee", "empfänger", "memo", "auftraggeber"}
_AMT_HEADERS  = {"amount", "betrag", "umsatz", "buchungsbetrag"}
_CUR_HEADERS  = {"currency", "währung", "wahrung"}
_DEBIT_HEADERS  = {"soll", "ausgabe", "debit"}
_CREDIT_HEADERS = {"haben", "einnahme", "credit"}


def _sniff_delimiter(sample: str) -> str:
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=";,\t|")
        return dialect.delimiter
    except csv.Error:
        return ","


def _parse_date(value: str) -> date | None:
    value = value.strip().strip('"')
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def _parse_amount(value: str) -> float | None:
    value = value.strip().strip('"').replace(" ", "")
    if not value:
        return None
    # European decimal: 1.234,56 → 1234.56
    if "," in value and "." in value:
        if value.rindex(",") > value.rindex("."):
            value = value.replace(".", "").replace(",", ".")
        else:
            value = value.replace(",", "")
    elif "," in value:
        value = value.replace(",", ".")
    try:
        return float(value)
    except ValueError:
        return None


def _find_col(headers: list[str], candidates: set[str]) -> int | None:
    for i, h in enumerate(headers):
        if h in candidates:
            return i
    return None


def parse_csv(file: TextIO, default_currency: str = "EUR") -> list[ParsedRow]:
    content = file.read()
    if isinstance(content, bytes):
        content = content.decode("utf-8-sig")
    delimiter = _sniff_delimiter(content[:1024])
    reader = csv.reader(io.StringIO(content), delimiter=delimiter)
    raw_headers = next(reader, None)
    if not raw_headers:
        return []
    headers = [h.strip().strip('"').lower() for h in raw_headers]

    date_col  = _find_col(headers, _DATE_HEADERS)
    desc_col  = _find_col(headers, _DESC_HEADERS)
    amt_col   = _find_col(headers, _AMT_HEADERS)
    cur_col   = _find_col(headers, _CUR_HEADERS)
    debit_col = _find_col(headers, _DEBIT_HEADERS)
    credit_col= _find_col(headers, _CREDIT_HEADERS)

    if date_col is None or desc_col is None:
        return []
    has_single_amount = amt_col is not None
    has_soll_haben = debit_col is not None or credit_col is not None

    rows: list[ParsedRow] = []
    for raw in reader:
        if not any(c.strip() for c in raw):
            continue
        def cell(i): return raw[i].strip().strip('"') if i is not None and i < len(raw) else ""

        parsed_date = _parse_date(cell(date_col))
        if parsed_date is None:
            continue

        if has_single_amount:
            amount = _parse_amount(cell(amt_col))
        elif has_soll_haben:
            debit  = _parse_amount(cell(debit_col))  if debit_col  is not None else None
            credit = _parse_amount(cell(credit_col)) if credit_col is not None else None
            if debit and debit > 0:
                amount = -debit
            elif credit and credit > 0:
                amount = credit
            else:
                amount = None
        else:
            amount = None

        if amount is None:
            continue

        currency = cell(cur_col) if cur_col is not None and cell(cur_col) else default_currency
        rows.append(ParsedRow(date=parsed_date, description=cell(desc_col), amount=amount, currency=currency))
    return rows
