import re
from datetime import datetime
from app.parsers.pdf_parser import _parse_amount_eu, _TR_AMOUNT, _REV_TX

_AMOUNT = r"(-?[\d.]+,\d{2})"


def _last_match_balance(lines: list[str], pattern, group: int) -> float | None:
    last = None
    for line in lines:
        m = pattern.search(line)
        if m:
            last = m.group(group)
    return _parse_amount_eu(last) if last is not None else None


def extract_balance(bank: str, text_lines: list[str]) -> float | None:
    text = "\n".join(text_lines)
    if bank == "comdirect":
        m = re.search(r'Neuer Kontostand"?\s*;?\s*"?\s*' + _AMOUNT, text)
        return _parse_amount_eu(m.group(1)) if m else None
    if bank == "scalable":
        pairs = re.findall(r"Kontostand am (\d{2}\.\d{2}\.\d{4})\s+" + _AMOUNT, text)
        if not pairs:
            return None
        latest = max(pairs, key=lambda p: datetime.strptime(p[0], "%d.%m.%Y"))
        return _parse_amount_eu(latest[1])
    if bank == "ing":
        m = re.search(r"Neuer Saldo\s+" + _AMOUNT, text)
        return _parse_amount_eu(m.group(1)) if m else None
    if bank == "amex":
        for pat in (
            r"Saldo des laufenden Monats f[üu]r.*?" + _AMOUNT + r"\s*$",
            r"Neuer Saldo\s+" + _AMOUNT,
            r"Zu zahlender Betrag\s+" + _AMOUNT,
        ):
            m = re.search(pat, text, re.MULTILINE)
            if m:
                return _parse_amount_eu(m.group(1))
        return None
    if bank == "trade_republic":
        return _last_match_balance(text_lines, _TR_AMOUNT, 2)
    if bank == "revolut":
        return _last_match_balance(text_lines, _REV_TX, 4)
    return None
