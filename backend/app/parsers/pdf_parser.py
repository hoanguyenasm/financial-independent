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
    # CSV "Umsatzanzeige" export carries an explicit `Bank;ING` (or `Bank,ING`) line.
    if any(re.match(r"\s*bank\s*[;,]\s*ing\b", l, re.IGNORECASE) for l in lines[:40]):
        return True
    return "ING-DiBa" in header or (
        "IBAN" in header and any(re.match(r"\d{2}\.\d{2}\.\d{4}\s+\S", l) for l in lines[:40])
    )


def _looks_like_trade_republic(lines: list[str]) -> bool:
    header = "\n".join(lines[:20])
    return "Trade Republic" in header or "TRADE REPUBLIC" in header


def _looks_like_revolut(lines: list[str]) -> bool:
    header = "\n".join(lines[:20])
    return "Revolut" in header or ("Geldausgang" in header and "Geldeingang" in header)


def _looks_like_revolut_consolidated(lines: list[str]) -> bool:
    """English Revolut 'Custom/Consolidated Statement' with per-currency pockets."""
    blob = "\n".join(lines[:80])
    return "Custom Statement" in blob and (
        "Current Accounts" in blob or "Transaction statement" in "\n".join(lines)
    )


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

# "Umsatzanzeige" export layout: a transaction's first line carries the booking
# date, counterparty, the running Saldo and the signed Betrag, both suffixed with €:
#   29.06.2026 Yarob Abbas 990,00 € +990,00 €
# The signed Betrag (the LAST €-amount) is the transaction amount.
_ING_UMSATZ_LINE = re.compile(
    r"^(\d{2})\.(\d{2})\.(\d{4})\s+(.+?)\s+-?[\d.]+,\d{2}\s*[€€]\s+([+-][\d.]+,\d{2})\s*[€€]\s*$"
)
# The line following the first carries the Wertstellung date + Buchungstext:
#   28.06.2026 Echtzeitüberweisung
_ING_UMSATZ_TEXT = re.compile(r"^\d{2}\.\d{2}\.\d{4}\s+(.+?)\s*$")
# Page furniture interleaved between transactions across page breaks.
_ING_NOISE = re.compile(r"^(\d/\d|Seite|Umsatzanzeige|Bank\b|Kontoname\b|IBAN\b|Buchung\b|"
                        r"Wertstellun|gsdatum|Notiz|Erstellt am|Letztes Konto)", re.IGNORECASE)


def _parse_ing(lines: list[str], currency: str = "EUR") -> list[ParsedRow]:
    """
    ING Girokonto (Kontoauszug): DD.MM.YYYY TYPE DESCRIPTION amount
    Last token is the amount; negative = expense, positive = income.

    The 'Umsatzanzeige' export uses a different, multi-line layout — detect and
    delegate to its dedicated parser.
    """
    if any(_ING_UMSATZ_LINE.match(l.strip()) for l in lines):
        return _parse_ing_umsatzanzeige(lines, currency)

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


def _parse_ing_umsatzanzeige(lines: list[str], currency: str = "EUR") -> list[ParsedRow]:
    """
    ING 'Umsatzanzeige' export, one transaction per 2-3 lines:
        <Buchung> <Auftraggeber/Empfänger> <Saldo> € <±Betrag> €
        <Wertstellung> <Buchungstext>
        [<Verwendungszweck>]            (zero or more un-dated continuation lines)

    Description combines Buchungstext + counterparty + purpose so categorization
    can match the counterparty name and purpose (mirrors the Kontoauszug layout,
    which already inlines the counterparty).
    """
    rows: list[ParsedRow] = []
    i, n = 0, len(lines)
    while i < n:
        m = _ING_UMSATZ_LINE.match(lines[i].strip())
        if not m:
            i += 1
            continue
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        counterparty = m.group(4).strip()
        amt = _parse_amount_eu(m.group(5))

        booking_text = ""
        purpose_parts: list[str] = []
        j = i + 1
        # The immediately-following dated line is the Buchungstext; un-dated lines
        # after it are the Verwendungszweck. Stop at the first noise line — past a
        # page break only page furniture (reversed watermark, headers) remains.
        while j < n:
            nxt = lines[j].strip()
            if _ING_UMSATZ_LINE.match(nxt) or _ING_NOISE.match(nxt):
                break
            mt = _ING_UMSATZ_TEXT.match(nxt)
            if mt and not booking_text:
                booking_text = mt.group(1).strip()
            elif nxt:
                purpose_parts.append(nxt)
            j += 1
        # Fast-forward over any page furniture to the next transaction.
        while j < n and not _ING_UMSATZ_LINE.match(lines[j].strip()):
            j += 1

        desc = " ".join(filter(None, [booking_text, counterparty, *purpose_parts])).strip()
        if amt is not None and desc:
            try:
                rows.append(ParsedRow(date=date(y, mo, d), description=desc, amount=amt, currency=currency))
            except ValueError:
                pass
        i = j
    return rows


# ── Trade Republic ────────────────────────────────────────────────────────────

_TR_MONTHS = {
    "jan": 1, "feb": 2, "mär": 3, "mar": 3, "apr": 4, "mai": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "okt": 10, "nov": 11, "dez": 12,
}
_TR_AMOUNT = re.compile(r"(-?[\d.]+,\d{2})\s*[€€]\s*(-?[\d.]+,\d{2})\s*[€€]")
_TR_DATE_X = 95       # the DATUM column (day / Mon. / year, stacked) sits left of this x
_TR_BODY_MAX_X = 360  # the amount + balance columns sit right of this x
_TR_DAY = re.compile(r"\d{1,2}")
_TR_YEAR = re.compile(r"20\d{2}")


def _tr_month(s: str) -> int:
    k = s.lower().rstrip(".")[:3]
    if k == "mär":
        k = "mar"
    return _TR_MONTHS.get(k, 0)


def _tr_visual_lines(page) -> list[list[dict]]:
    """Group a page's words into visual lines by their vertical position."""
    words = page.extract_words(use_text_flow=False)
    words.sort(key=lambda w: (round(w["top"]), w["x0"]))
    lines: list[list[dict]] = []
    cur: list[dict] = []
    top: float | None = None
    for w in words:
        if top is not None and abs(w["top"] - top) > 3:
            lines.append(cur)
            cur = []
        cur.append(w)
        top = w["top"]
    if cur:
        lines.append(cur)
    return lines


def _parse_trade_republic(raw: bytes, currency: str = "EUR") -> list[ParsedRow]:
    """
    Trade Republic statements are a table that text extraction mangles: the DATUM
    column stacks day / "Mon." / year vertically, and long security names wrap onto
    extra lines, so a linear text scan drops ~1/3 of the rows. Reconstruct from word
    coordinates instead — every visual line carrying "amount€ balance€" is one
    transaction; its date comes from the DATUM column (this line and its stacked
    neighbours), its description from the body tokens of that line plus the adjacent
    wrapped lines (which hold the ISIN), and its sign from the running balance delta.
    """
    rows: list[ParsedRow] = []
    prev_balance: float | None = None
    with pdfplumber.open(io.BytesIO(raw)) as pdf:
        for page in pdf.pages:  # opening balance from the Cashkonto summary
            m = re.search(r"Cashkonto\s+([\d.]+,\d{2})", page.extract_text() or "")
            if m:
                prev_balance = _parse_amount_eu(m.group(1))
                break
        for page in pdf.pages:
            L = _tr_visual_lines(page)
            joined = [" ".join(w["text"] for w in ln) for ln in L]
            for i, ln in enumerate(L):
                m = _TR_AMOUNT.search(joined[i])
                if not m:
                    continue
                # date: scan this line then its stacked neighbours (nearest first)
                day = month = year = None
                for src in (ln, L[i - 1] if i else [], L[i + 1] if i + 1 < len(L) else [],
                            L[i - 2] if i >= 2 else [], L[i + 2] if i + 2 < len(L) else []):
                    for w in src:
                        if w["x0"] >= _TR_DATE_X:
                            continue
                        t = w["text"]
                        if day is None and _TR_DAY.fullmatch(t):
                            day = int(t)
                        if month is None and _tr_month(t):
                            month = _tr_month(t)
                        if year is None and _TR_YEAR.fullmatch(t):
                            year = int(t)
                amt = _parse_amount_eu(m.group(1))
                bal = _parse_amount_eu(m.group(2))
                if not (day and month and year) or amt is None or bal is None:
                    continue

                # description: body tokens of this line + adjacent non-amount wrapped lines
                def _body(idx: int) -> str:
                    if not (0 <= idx < len(L)) or (idx != i and _TR_AMOUNT.search(joined[idx])):
                        return ""
                    toks = " ".join(w["text"] for w in L[idx] if _TR_DATE_X <= w["x0"] < _TR_BODY_MAX_X)
                    return _TR_AMOUNT.split(toks)[0].strip()
                desc = " ".join(p for p in (_body(i - 1), _body(i), _body(i + 1)) if p).strip()
                desc = re.sub(r"\s*null\s*$", "", desc)  # TR renders the empty payment column as "null"

                amount = amt if prev_balance is None else (
                    abs(amt) if round(bal - prev_balance, 2) >= 0 else -abs(amt))
                prev_balance = bal
                try:
                    rows.append(ParsedRow(date=date(year, month, day),
                                          description=desc or "Trade Republic", amount=amount, currency=currency))
                except ValueError:
                    pass
    return rows


# ── Revolut (German) ──────────────────────────────────────────────────────────

_REV_TX = re.compile(
    r"^(\d{2}\.\d{2}\.\d{4})\s+(.+?)\s+([\d.]+,\d{2})[€€]\s*([\d.]+,\d{2})[€€]\s*$"
)
_REV_SKIP = re.compile(r"^(An:|Von:|Karte:|Ref\.:|IBAN:|\d{2}\.\d{2}\.\d{4} -)", re.IGNORECASE)


_REVC_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}
_REVC_DATE = re.compile(r"^([A-Z][a-z]{2}) (\d{1,2}), (20\d{2})\s+(.*)$")
_REVC_EURNUM = re.compile(r"(-?)€([\d,]+\.\d{2})")
_REVC_LEAD_EUR = re.compile(r"^(-?)€([\d,]+\.\d{2})\b")
_REVC_CATEGORIES = (
    "Card payment", "Top up", "Exchange", "Transfer", "Cashback",
    "Merchant", "Refund", "Others", "Other", "Fee", "ATM",
)


def _revc_amount(sign: str, num: str) -> float:
    return float(num.replace(",", "")) * (-1 if sign == "-" else 1)


def _revc_strip_category(text: str) -> str:
    """A row's leading text is '<description> <Category>'; drop the category word."""
    for cat in sorted(_REVC_CATEGORIES, key=len, reverse=True):
        if text.endswith(" " + cat):
            return text[: -len(cat)].strip()
    return text.rsplit(" ", 1)[0].strip() if " " in text else text


def _parse_revolut_consolidated(lines: list[str], currency: str = "EUR") -> list[ParsedRow]:
    """
    Revolut English consolidated statement, one section per currency pocket:
        "Personal Account (EUR)" … then rows:
        <Mon DD, YYYY> <description> <Category> <±€amount> <€balance> <€…> <€…> <€…>

    Foreign pockets (VND, CZK, …) list native amounts on the date line and the
    EUR equivalent on a following line; we take the EUR figure so everything is
    normalized to the tracker's base currency.
    """
    rows: list[ParsedRow] = []
    pocket: str | None = None
    i, n = 0, len(lines)
    while i < n:
        line = lines[i].strip()
        m_pocket = re.match(r"Personal Account \(([A-Z]{3})\)", line)
        if m_pocket:
            pocket = m_pocket.group(1)
            i += 1
            continue

        m_date = _REVC_DATE.match(line)
        if not m_date:
            i += 1
            continue
        month = _REVC_MONTHS.get(m_date.group(1).lower())
        if not month:
            i += 1
            continue
        day, year, rest = int(m_date.group(2)), int(m_date.group(3)), m_date.group(4)

        if pocket in (None, "EUR"):
            m_amt = _REVC_EURNUM.search(rest)
            if not m_amt:
                i += 1
                continue
            amount = _revc_amount(m_amt.group(1), m_amt.group(2))
            head = rest[: m_amt.start()].rstrip().rstrip("-").strip()
            desc = _revc_strip_category(head)
            if desc:
                try:
                    rows.append(ParsedRow(date=date(year, month, day), description=desc,
                                          amount=amount, currency=currency))
                except ValueError:
                    pass
            i += 1
            continue

        # Foreign pocket: description before the first native number, EUR equiv on a later line.
        m_num = re.search(r"\s(-?[\d,]+)\s", rest)
        head = rest[: m_num.start()].strip() if m_num else rest
        desc = _revc_strip_category(head)
        eur_amount: float | None = None
        for j in range(i + 1, min(i + 4, n)):
            lj = lines[j].strip()
            m_eur = _REVC_LEAD_EUR.match(lj)
            if m_eur:
                eur_amount = _revc_amount(m_eur.group(1), m_eur.group(2))
                break
            m_cont = re.match(r"^([A-Za-z][\w ]*?)\s+[A-Z]{3}\s+[A-Z]{3}\b", lj)
            if m_cont:
                desc = (desc + " " + m_cont.group(1).strip()).strip()
        if eur_amount is not None and desc:
            try:
                rows.append(ParsedRow(date=date(year, month, day), description=desc,
                                      amount=eur_amount, currency=currency))
            except ValueError:
                pass
        i += 1

    return rows


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
# The line under a buy/sell names the instrument: "4,01 Stk. WisdomTree Cybersecurity (Acc) (IE00BLPK3577)".
_SC_SECURITY = re.compile(r"^[\d.,]+\s+Stk\.\s+(.+?\([A-Z]{2}[0-9A-Z]{9,10}\))\s*$")


def _parse_scalable(lines: list[str], currency: str = "EUR") -> list[ParsedRow]:
    """Scalable Capital: DD.MM.YYYY DD.MM.YYYY description ±amount EUR, with the
    instrument name + ISIN on the following line for trades — folded into the
    description so ETF Sparplans can be distinguished from one-off trades by ISIN."""
    rows: list[ParsedRow] = []
    for i, line in enumerate(lines):
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
        desc = m.group(2).strip()
        if i + 1 < len(lines):
            sec = _SC_SECURITY.match(lines[i + 1].strip())
            if sec:
                desc = f"{desc} {sec.group(1).strip()}"
        rows.append(ParsedRow(date=txn_date, description=desc, amount=amt, currency=currency))
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
    lines = _extract_text_lines(io.BytesIO(raw))

    # The Revolut consolidated statement has a per-pocket text layout that pdfplumber's
    # table extraction mangles, so detect and parse it from text before trying tables.
    if lines and _looks_like_revolut_consolidated(lines):
        return _parse_revolut_consolidated(lines, default_currency)

    # Trade Republic's vertically-stacked table needs word coordinates, not text — its
    # linear text extraction drops wrapped rows. Detect and parse from coordinates first.
    if lines and _looks_like_trade_republic(lines):
        return _parse_trade_republic(raw, default_currency)

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
    if not lines:
        return []

    if _looks_like_revolut(lines):
        return _parse_revolut(lines, default_currency)
    if _looks_like_scalable(lines):
        return _parse_scalable(lines, default_currency)
    if _looks_like_amex(lines):
        return _parse_amex(lines, default_currency)
    if _looks_like_ing(lines):
        return _parse_ing(lines, default_currency)

    return []


def detect_bank_from_lines(lines: list[str]) -> str | None:
    if _looks_like_trade_republic(lines):
        return "trade_republic"
    if _looks_like_revolut_consolidated(lines) or _looks_like_revolut(lines):
        return "revolut"
    if _looks_like_scalable(lines):
        return "scalable"
    if _looks_like_amex(lines):
        return "amex"
    if _looks_like_ing(lines):
        return "ing"
    return None
