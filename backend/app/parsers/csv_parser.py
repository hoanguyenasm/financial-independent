import csv
import io
from collections import Counter
from datetime import date, datetime
from typing import TextIO
from .models import ParsedRow


def decode_csv_bytes(raw: bytes) -> str:
    """comdirect CSV is cp1252; most others are UTF-8. Try UTF-8 (BOM) then cp1252."""
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("cp1252")


_DATE_FORMATS = ["%d.%m.%Y", "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%d.%m.%y"]
_DATE_HEADERS = {"date", "datum", "buchungsdatum", "buchungstag", "buchung", "valutadatum", "valuta"}
_DESC_HEADERS = {"description", "verwendungszweck", "buchungstext", "payee", "empfänger", "memo", "auftraggeber"}
_AMT_HEADERS  = {"amount", "betrag", "umsatz", "buchungsbetrag"}
_CUR_HEADERS  = {"currency", "währung", "wahrung"}
_DEBIT_HEADERS  = {"soll", "ausgabe", "debit"}
_CREDIT_HEADERS = {"haben", "einnahme", "credit"}


def _sniff_delimiter(sample: str) -> str:
    """Pick the delimiter that splits rows most consistently.

    csv.Sniffer is unreliable on German bank exports because the decimal comma in
    amounts like ``-990,00`` makes it prefer ``,``. Instead, for each candidate we
    find the column count shared by the most lines and pick the delimiter with the
    strongest, widest agreement.
    """
    lines = [l for l in sample.splitlines() if l.strip()][:50]
    best, best_score = ",", (-1, -1)
    for d in (";", "\t", "|", ","):
        counts = [l.count(d) for l in lines if l.count(d) > 0]
        if not counts:
            continue
        dominant, freq = Counter(counts).most_common(1)[0]
        score = (freq, dominant)  # most lines agreeing, then widest split
        if score > best_score:
            best, best_score = d, score
    return best


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
    for i, h in enumerate(headers):
        if any(c in h for c in candidates):
            return i
    return None


def _find_desc_cols(headers: list[str]) -> list[int]:
    """All description-like columns, in header order. Banks like ING split the
    counterparty, booking text and purpose across separate columns; combining
    them keeps the name + purpose needed for categorization."""
    return [i for i, h in enumerate(headers)
            if h in _DESC_HEADERS or any(c in h for c in _DESC_HEADERS)]


def parse_csv(file: TextIO, default_currency: str = "EUR") -> list[ParsedRow]:
    content = file.read()
    if isinstance(content, bytes):
        content = content.decode("utf-8-sig")
    delimiter = _sniff_delimiter(content[:8192])

    all_rows = list(csv.reader(io.StringIO(content), delimiter=delimiter))
    header_idx = None
    for i, r in enumerate(all_rows):
        cells = [c.strip().strip('"').lower() for c in r]
        if _find_col(cells, _DATE_HEADERS) is not None and _find_col(cells, _DESC_HEADERS) is not None:
            header_idx = i
            break
    if header_idx is None:
        return []
    headers = [h.strip().strip('"').lower() for h in all_rows[header_idx]]

    date_col  = _find_col(headers, _DATE_HEADERS)
    desc_col  = _find_col(headers, _DESC_HEADERS)
    desc_cols = _find_desc_cols(headers)
    amt_col   = _find_col(headers, _AMT_HEADERS)
    cur_col   = _find_col(headers, _CUR_HEADERS)
    debit_col = _find_col(headers, _DEBIT_HEADERS)
    credit_col= _find_col(headers, _CREDIT_HEADERS)

    if date_col is None or desc_col is None:
        return []
    has_single_amount = amt_col is not None
    has_debit_or_credit = debit_col is not None or credit_col is not None

    rows: list[ParsedRow] = []
    for raw in all_rows[header_idx + 1:]:
        if not any(c.strip() for c in raw):
            continue
        def cell(i): return raw[i].strip().strip('"') if i is not None and i < len(raw) else ""

        parsed_date = _parse_date(cell(date_col))
        if parsed_date is None:
            continue

        if has_single_amount:
            amount = _parse_amount(cell(amt_col))
        elif has_debit_or_credit:
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

        cur_value = cell(cur_col) if cur_col is not None else ""
        currency = cur_value if cur_value else default_currency
        # Combine every description column (counterparty + booking text + purpose),
        # skipping blanks and duplicates while preserving header order.
        parts: list[str] = []
        for c in desc_cols:
            v = cell(c)
            if v and v not in parts:
                parts.append(v)
        description = " ".join(parts) if parts else cell(desc_col)
        rows.append(ParsedRow(date=parsed_date, description=description, amount=amount, currency=currency))
    return rows
