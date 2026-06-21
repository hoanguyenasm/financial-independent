import os
from sqlalchemy.orm import Session
from app.models import Account
from app.parsers.pdf_parser import detect_bank_from_lines

_OWNERS = ("Hoa", "Norah")
_INSTITUTION = {
    "comdirect": "Comdirect", "trade_republic": "Trade Republic", "revolut": "Revolut",
    "scalable": "Scalable Capital", "amex": "American Express", "ing": "ING",
}


def detect_owner(path: str) -> str | None:
    parts = [p for chunk in path.replace("\\", "/").split("/") for p in [chunk]]
    for owner in _OWNERS:
        if owner in parts:
            return owner
    return None


def detect_bank(filename: str, text_lines: list[str]) -> str | None:
    name = filename.lower()
    header = "\n".join(text_lines[:6])
    if name.startswith("umsaetze_") or "Umsätze" in header or "comdirect" in header.lower():
        return "comdirect"
    return detect_bank_from_lines(text_lines)


def route_account(db: Session, bank: str | None, owner: str | None, text_lines: list[str]) -> int | None:
    if not bank or not owner:
        return None
    institution = _INSTITUTION.get(bank)
    if not institution:
        return None
    matches = [
        a for a in db.query(Account).filter(Account.institution == institution).all()
        if f"({owner})" in a.name
    ]
    if not matches:
        return None
    if bank == "scalable" and len(matches) > 1:
        text = "\n".join(text_lines).lower()
        is_broker = "finanzinstrument" in text or "isin" in text
        for a in matches:
            if ("broker" in a.name.lower()) == is_broker:
                return a.id
    return matches[0].id
