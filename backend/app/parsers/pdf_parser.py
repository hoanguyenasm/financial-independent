import io
import re
import csv
from datetime import date, datetime
from typing import BinaryIO
import pdfplumber
from .csv_parser import parse_csv
from .models import ParsedRow

# ── helpers ───────────────────────────────────────────────────────────────────

def _table_to_csv_stream(table: list[list[str | None]]) -> io.StringIO:
    buf = io.StringIO()
    writer = csv.writer(buf)
    for row in table:
        writer.writerow([cell or "" for cell in row])
    buf.seek(0)
    return buf


def _parse_amount_eu(raw: str) -> float | None:
    """Parse European-formatted number: 1.234,56 → 1234.56."""
    s = re.sub(r"[€€\xa0\s+]", "", raw).strip()
    if not s:
        return None
    if "," in s and "." in s:
        if s.rindex(",") > s.rindex("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _extract_text_lines(buf: io.BytesIO) -> list[str]:
    lines: list[str] = []
    with pdfplumber.open(buf) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            lines.extend(text.splitlines())
    return lines


# ── format detectors ──────────────────────────────────────────────────────────

def _looks_like_ing(lines: list[str]) -> bool:
    header = "\n".join(lines[:40])
    return "ING-DiBa" in header or (
        "IBAN" in header and any(re.match(r"\d{2}\.\d{2}\.\d{4}\s+\S", l) for l in lines[:40])
    )


def _looks_like_trade_republic(lines: list[str]) -> bool:
    header = "\n".join(lines[:20])
    return "Trade Republic" in header or "TRADE REPUBLIC" in header


def _looks_like_revolut(lines: list[str]) -> bool:
    header = "\n".join(lines[:20])
    return "Revolut" in header or ("Geldausgang" in header and "Geldeingang" in header)


def _looks_like_scalable(lines: list[str]) -> bool:
    header = "\n".join(lines[:20])
    return "Scalable" in header or (
        "Buchung" in header and "Wertstellung" in header and "Beschreibung" in header
    )


def _looks_like_amex(lines: list[str]) -> bool:
    header = "\n".join(lines[:20])
    return any(k in header for k in ("American Express", "AMEX", "Amex"))


# ── ING Girokonto ─────────────────────────────────────────────────────────────

_ING_LINE = re.compile(r"^(\d{2})\.(\d{2})\.(\d{4})\s+(.+?)\s+(-?[\d.]+,\d{2})\s*$")


def _parse_ing(lines: list[str], currency: str = "EUR") -> list[ParsedRow]:
    """
    ING Girokonto: DD.MM.YYYY TYPE DESCRIPTION amount
    Last token is the amount; negative = expense, positive = income.
    """
    rows: list[ParsedRow] = []
    for line in lines:
        m = _ING_LINE.match(line.strip())
        if not m:
            continue
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        desc = m.group(4).strip()
        amt = _parse_amount_eu(m.group(5))
        if amt is None or not desc:
            continue
        try:
            rows.append(ParsedRow(date=date(y, mo, d), description=desc, amount=amt, currency=currency))
        except ValueError:
            continue
    return rows


# ── Trade Republic ────────────────────────────────────────────────────────────

_TR_MONTHS = {
    "jan": 1, "feb": 2, "mär": 3, "mar": 3, "apr": 4, "mai": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "okt": 10, "nov": 11, "dez": 12,
}
_TR_MON_PAT = re.compile(r"^(\d{1,2})\s+(Jan|Feb|Mär|Mar|Apr|Mai|Jun|Jul|Aug|Sep|Okt|Nov|Dez)\.?\s*(.*)", re.IGNORECASE)
_TR_DAY_PAT = re.compile(r"^(\d{1,2})$")
_TR_YEAR_PAT = re.compile(r"^(20\d{2})\b")
_TR_AMT_PAT = re.compile(r"([\d.]+,\d{2})\s*[€€]\s*([\d.]+,\d{2})\s*[€€]\s*$")
_TR_MON_ONLY = re.compile(r"^(Jan|Feb|Mär|Mar|Apr|Mai|Jun|Jul|Aug|Sep|Okt|Nov|Dez)\.?\s+(.*)", re.IGNORECASE)


def _tr_month(s: str) -> int:
    k = s.lower()[:3]
    if k == "mär":
        k = "mar"
    return _TR_MONTHS.get(k, 0)


def _parse_trade_republic(lines: list[str], currency: str = "EUR") -> list[ParsedRow]:
    """
    Trade Republic: transactions appear with date split across lines.
    Variants:
      DD Mon. [desc]\n TYPE amount€ balance€\n YYYY
      DD\n Mon. desc amount€ balance€\n YYYY
      DD Mon. [desc]\n [extra desc]\n TYPE amount€ balance€\n YYYY
    Use balance delta to determine income vs expense.
    """
    # Extract starting balance
    prev_balance: float | None = None
    for line in lines:
        m = re.search(r"Cashkonto\s+([\d.]+,\d{2})\s*[€€]", line)
        if m:
            prev_balance = _parse_amount_eu(m.group(1))
            break

    rows: list[ParsedRow] = []
    pending_day = 0
    pending_month = 0
    pending_desc: list[str] = []

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        # Skip blank / header lines
        if not line or line.startswith("TRADE REPUBLIC") or "DATUM TYP" in line or "KONTO" in line:
            i += 1
            continue

        # "DD Mon. [rest]" — date + month on same line
        m_dm = _TR_MON_PAT.match(line)
        if m_dm:
            pending_day = int(m_dm.group(1))
            pending_month = _tr_month(m_dm.group(2))
            rest = m_dm.group(3).strip()
            pending_desc = [rest] if rest else []
            i += 1
            continue

        # Plain "DD" — day only
        m_d = _TR_DAY_PAT.match(line)
        if m_d and 1 <= int(m_d.group(1)) <= 31:
            pending_day = int(m_d.group(1))
            pending_month = 0
            pending_desc = []
            i += 1
            continue

        # Year line — reset if we haven't already committed a transaction
        if _TR_YEAR_PAT.match(line):
            i += 1
            continue

        # Amount line: ends with "amount€ balance€"
        m_amt = _TR_AMT_PAT.search(line)
        if m_amt and pending_day:
            # Check if line opens with month (e.g. "Apr. Zinsen ... 59,58€ 35.131,57€")
            m_mon_only = _TR_MON_ONLY.match(line)
            if m_mon_only and not pending_month:
                pending_month = _tr_month(m_mon_only.group(1))
                desc_part = m_mon_only.group(2)[: m_amt.start() - m_mon_only.start() - len(m_mon_only.group(1)) - 2].strip()
            else:
                desc_part = line[: m_amt.start()].strip()
                # Strip leading "Mon. " if present
                if m_mon_only:
                    after_mon = m_mon_only.group(2)
                    desc_part = after_mon[: m_amt.start() - len(line) + len(after_mon)].strip()

            full_desc = " ".join(filter(None, pending_desc + [desc_part])).strip()
            amt_val = _parse_amount_eu(m_amt.group(1))
            balance_val = _parse_amount_eu(m_amt.group(2))

            # Look ahead for year
            year = date.today().year
            for j in range(i + 1, min(i + 5, len(lines))):
                m_yr = _TR_YEAR_PAT.match(lines[j].strip())
                if m_yr:
                    year = int(m_yr.group(1))
                    break

            if pending_month and amt_val is not None:
                try:
                    txn_date = date(year, pending_month, pending_day)
                    if prev_balance is not None and balance_val is not None:
                        delta = round(balance_val - prev_balance, 2)
                        amount = abs(amt_val) if delta >= 0 else -abs(amt_val)
                    else:
                        amount = amt_val
                    prev_balance = balance_val
                    if full_desc:
                        rows.append(ParsedRow(date=txn_date, description=full_desc, amount=amount, currency=currency))
                except ValueError:
                    pass

            pending_day = 0
            pending_month = 0
            pending_desc = []
            i += 1
            continue

        # Accumulate description when date is pending
        if pending_day and line:
            pending_desc.append(line)

        i += 1

    return rows


# ── Revolut (German) ──────────────────────────────────────────────────────────

_REV_TX = re.compile(
    r"^(\d{2}\.\d{2}\.\d{4})\s+(.+?)\s+([\d.]+,\d{2})[€€]\s*([\d.]+,\d{2})[€€]\s*$"
)
_REV_SKIP = re.compile(r"^(An:|Von:|Karte:|Ref\.:|IBAN:|\d{2}\.\d{2}\.\d{4} -)", re.IGNORECASE)


def _parse_revolut(lines: list[str], currency: str = "EUR") -> list[ParsedRow]:
    """
    Revolut German: DD.MM.YYYY description AMOUNT€ BALANCE€
    Uses balance delta to determine income (positive) vs expense (negative).
    Starting balance extracted from summary line.
    """
    prev_balance: float | None = None
    for line in lines:
        m = re.search(r"Konto\s+\(Girokonto\)\s+([\d.,]+)[€€]", line)
        if m:
            prev_balance = _parse_amount_eu(m.group(1))
            break

    rows: list[ParsedRow] = []
    for line in lines:
        line = line.rstrip()
        if _REV_SKIP.match(line.strip()):
            continue
        m = _REV_TX.match(line)
        if not m:
            continue
        date_str, desc, amt_raw, balance_raw = m.group(1), m.group(2), m.group(3), m.group(4)
        try:
            txn_date = datetime.strptime(date_str, "%d.%m.%Y").date()
        except ValueError:
            continue
        amt = _parse_amount_eu(amt_raw)
        balance = _parse_amount_eu(balance_raw)
        if amt is None:
            continue
        if prev_balance is not None and balance is not None:
            delta = round(balance - prev_balance, 2)
            amount = abs(amt) if delta >= 0 else -abs(amt)
        else:
            amount = amt
        prev_balance = balance
        rows.append(ParsedRow(date=txn_date, description=desc.strip(), amount=amount, currency=currency))

    return rows


# ── Scalable Capital ──────────────────────────────────────────────────────────

_SC_LINE = re.compile(
    r"^(\d{2}\.\d{2}\.\d{4})\s+\d{2}\.\d{2}\.\d{4}\s+(.+?)\s+([+-]?[\d.]+,\d{2})\s+EUR\s*$"
)


def _parse_scalable(lines: list[str], currency: str = "EUR") -> list[ParsedRow]:
    """Scalable Capital: DD.MM.YYYY DD.MM.YYYY description ±amount EUR"""
    rows: list[ParsedRow] = []
    for line in lines:
        m = _SC_LINE.match(line.strip())
        if not m:
            continue
        amt = _parse_amount_eu(m.group(3))
        if amt is None:
            continue
        try:
            txn_date = datetime.strptime(m.group(1), "%d.%m.%Y").date()
        except ValueError:
            continue
        rows.append(ParsedRow(date=txn_date, description=m.group(2).strip(), amount=amt, currency=currency))
    return rows


# ── AmEx Credit Card ──────────────────────────────────────────────────────────

_AMEX_LINE = re.compile(
    r"^(\d{2}\.\d{2})\s+\d{2}\.\d{2}\s+(.+?)\s+([\d.,]+)\s*(GUTSCHRIFT)?\s*$"
)


def _parse_amex(lines: list[str], currency: str = "EUR") -> list[ParsedRow]:
    """
    AmEx: DD.MM DD.MM description amount [GUTSCHRIFT]
    GUTSCHRIFT may appear on the same line or on the next continuation line.
    Year inferred from first year found in text. GUTSCHRIFT = credit (positive).
    """
    year = date.today().year
    for line in lines[:30]:
        m = re.search(r"\b(20\d{2})\b", line)
        if m:
            year = int(m.group(1))
            break

    rows: list[ParsedRow] = []
    for i, line in enumerate(lines):
        m = _AMEX_LINE.match(line.strip())
        if not m:
            continue
        amt = _parse_amount_eu(m.group(3))
        if amt is None:
            continue
        date_part = m.group(1)
        desc = m.group(2).strip()
        # GUTSCHRIFT on same line or next line
        gutschrift = bool(m.group(4)) or (
            i + 1 < len(lines) and "GUTSCHRIFT" in lines[i + 1]
        )
        try:
            d, mo = int(date_part[:2]), int(date_part[3:])
            txn_date = date(year, mo, d)
        except ValueError:
            continue
        amount = abs(amt) if gutschrift else -abs(amt)
        if desc:
            rows.append(ParsedRow(date=txn_date, description=desc, amount=amount, currency=currency))

    return rows


# ── main entry point ──────────────────────────────────────────────────────────

def parse_pdf(file: BinaryIO, default_currency: str = "EUR") -> list[ParsedRow]:
    raw = file.read()

    # Try table extraction first
    rows: list[ParsedRow] = []
    with pdfplumber.open(io.BytesIO(raw)) as pdf:
        for page in pdf.pages:
            for table in (page.extract_tables() or []):
                if not table or len(table) < 2:
                    continue
                stream = _table_to_csv_stream(table)
                rows.extend(parse_csv(stream, default_currency=default_currency))

    if rows:
        return rows

    # Text-based fallback
    lines = _extract_text_lines(io.BytesIO(raw))
    if not lines:
        return []

    if _looks_like_trade_republic(lines):
        return _parse_trade_republic(lines, default_currency)
    if _looks_like_revolut(lines):
        return _parse_revolut(lines, default_currency)
    if _looks_like_scalable(lines):
        return _parse_scalable(lines, default_currency)
    if _looks_like_amex(lines):
        return _parse_amex(lines, default_currency)
    if _looks_like_ing(lines):
        return _parse_ing(lines, default_currency)

    return []
