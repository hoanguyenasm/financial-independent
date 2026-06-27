from sqlalchemy.orm import Session
from app.models import Account
from app.parsers.pdf_parser import detect_bank_from_lines

_OWNERS = ("Hoa", "Norah")
_INSTITUTION = {
    "comdirect": "Comdirect", "trade_republic": "Trade Republic", "revolut": "Revolut",
    "scalable": "Scalable Capital", "amex": "American Express", "ing": "ING",
}


def detect_owner(path: str) -> str | None:
    parts = path.replace("\\", "/").split("/")
    for owner in _OWNERS:
        if owner in parts:
            return owner
    return None


# Account-holder names as printed inside statements, mapped to the owner tag.
_OWNER_NAMES = {
    "Hoa": ("duc hoa nguyen", "hoa nguyen"),
    "Norah": ("bao ngoc pham", "ngoc pham", "norah"),
}


def detect_owner_from_text(text_lines: list[str]) -> str | None:
    """Browser uploads have no folder path, so read the account holder from the
    statement body (the name the bank prints on the statement)."""
    blob = "\n".join(text_lines).lower()
    for owner, names in _OWNER_NAMES.items():
        if any(n in blob for n in names):
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
    return matches[0].id
