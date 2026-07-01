from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from app.parsers.models import ParsedRow
from app.models import Transaction, CategoryRule, ImportLog

import re
import unicodedata


def _normalize(s: str) -> str:
    """Lowercase + replace German umlauts with ASCII equivalents for matching."""
    s = s.lower()
    replacements = {"ü": "ue", "ä": "ae", "ö": "oe", "ß": "ss"}
    for ch, rep in replacements.items():
        s = s.replace(ch, rep)
    return s


# Keywords (already normalized via _normalize) indicating transaction types
_TRANSFER_KW = {
    "ueberweisung", "umbuchung", "uebertrag", "transfer", "zahlungseingang", "zahlungsausgang",
    "incoming transfer", "outgoing transfer",
    "von eur flexible", "an eur flexible",   # Revolut money market
    "instant access savings",                 # Revolut savings vault ↔ current account
    "umgetauscht", "waehrungswechsel",        # FX conversion
    "abhebung vom geldkonto",                 # Scalable withdrawal
}
# Passive, recurring buys (ETF savings plans) vs. active one-off trades. Both are
# "investment_buy" at the type level; the category split (etf vs trading) is decided
# in _categorize so the cash-flow view can separate passive from active investing.
_SAVINGS_PLAN_KW = {"savings plan execution", "sparplan"}
_TRADE_KW = {"kauf eines finanzinstruments", "buy trade", "handel"}
_INVESTMENT_BUY_KW = _SAVINGS_PLAN_KW | _TRADE_KW
_INTEREST_KW = {"zinsen", "interest payment", "erhaltene zinsen", "zinsertrag"}
# "ertrag" is matched as a whole word (see _infer_type) rather than a substring,
# because "uebertrag" (transfer) contains it and must not be read as a dividend.
_DIVIDEND_KW = {
    "dividende", "dividend", "ausschuettung",
    "kapitalmassnah", "cash dividend",
}

# Module constants for categorization logic
_INCOME_CATEGORIES = {"salary", "rental", "airbnb", "interest", "dividend", "income"}
# Categories that make sense for investment rows. Buys/sells carry the security name
# (e.g. "Apple", "Netflix"), so consumer rules must be ignored for them — only these apply.
_INVESTMENT_CATEGORIES = {"etf", "trading", "crypto", "gold", "investment_buy", "investment_sell", "investment_fees"}
# Neutral categories are direction-agnostic: a deposit (Kaution) or transfer rule must
# match whether the money is coming in or going back out.
_NEUTRAL_CATEGORIES = {"transfer", "deposit"}
# Categories that only make sense on a credit (money coming in). Reimbursement shares
# this direction requirement with income, but must stay out of _INCOME_CATEGORIES since
# it's not real income for cash-flow purposes (see analytics._INCOME_CATS).
_CREDIT_ONLY_CATEGORIES = _INCOME_CATEGORIES | {"reimbursement"}
_HOUSEHOLD_NAMES = ("duc hoa nguyen", "bao ngoc pham", "ngoc pham")


def _infer_type(description: str, amount: float) -> str:
    n = _normalize(description)
    # Interest and dividend are only income (credits). A negative amount containing
    # "Zinsen" / "Ertrag" etc. is interest PAID or a reversal — not passive income.
    if amount > 0:
        if any(k in n for k in _INTEREST_KW):
            return "interest"
        if any(k in n for k in _DIVIDEND_KW) or re.search(r"\bertrag\b", n):
            return "dividend"
    if any(k in n for k in _INVESTMENT_BUY_KW):
        return "investment_buy" if amount < 0 else "investment_sell"
    if any(k in n for k in _TRANSFER_KW):
        return "transfer"
    return "expense" if amount < 0 else "income"


class ImportService:

    @staticmethod
    def _categorize(description: str, rules: list[CategoryRule], amount: float = 0.0, tx_type: str = "") -> tuple[str, bool]:
        lower_desc = description.lower()
        credit = amount > 0
        investment = tx_type in ("investment_buy", "investment_sell")
        # 1. explicit rules, direction-aware (rules win over the transfer type).
        #    Neutral categories (deposit/transfer) match regardless of direction.
        #    Longest pattern first, so a specific rule ("Prime-Abonnement") beats a
        #    generic substring ("Prime") when both match. For investment rows, only
        #    investment-category rules apply (a stock named "Apple" isn't a subscription).
        for rule in sorted(rules, key=lambda r: len(r.pattern), reverse=True):
            if rule.pattern.lower() not in lower_desc:
                continue
            if investment and rule.category not in _INVESTMENT_CATEGORIES:
                continue
            if rule.category in _NEUTRAL_CATEGORIES or credit == (rule.category in _CREDIT_ONLY_CATEGORIES):
                return rule.category, False
        # 2. household self-transfers are internal
        if any(n in lower_desc for n in _HOUSEHOLD_NAMES):
            return "transfer", False
        # 3-4. type-based inference
        if tx_type == "interest":
            return "interest", False
        if tx_type == "dividend":
            return "dividend", False
        if tx_type == "investment_buy":
            # passive recurring Sparplan -> etf, everything else -> active trading
            n = _normalize(description)
            if any(k in n for k in _SAVINGS_PLAN_KW):
                return "etf", False
            return "trading", False
        if tx_type in ("transfer", "investment_sell"):
            return tx_type, False
        # 5. fallback
        if credit:
            return "income", False
        return "uncategorized", True

    @staticmethod
    def _is_duplicate(db: Session, account_id: int, row: ParsedRow) -> bool:
        return db.query(Transaction).filter(
            and_(
                Transaction.account_id == account_id,
                Transaction.date == row.date,
                Transaction.amount == row.amount,
                Transaction.description == row.description,
            )
        ).first() is not None

    @staticmethod
    def file_already_imported(db: Session, file_hash: str | None, account_id: int | None = None) -> bool:
        if not file_hash:
            return False
        q = db.query(ImportLog).filter(
            ImportLog.file_hash == file_hash, ImportLog.status == "done"
        )
        if account_id is not None:
            q = q.filter(ImportLog.account_id == account_id)
        return q.first() is not None

    @classmethod
    def run(
        cls,
        db: Session,
        rows: list[ParsedRow],
        account_id: int,
        user_id: int,
        filename: str,
        source_type: str,
        file_hash: str | None = None,
    ) -> ImportLog:
        if cls.file_already_imported(db, file_hash, account_id):
            log = ImportLog(account_id=account_id, filename=filename, source_type=source_type,
                            status="duplicate_file", rows_imported=0, rows_skipped=0,
                            rows_uncategorized=0, file_hash=file_hash)
            db.add(log)
            db.commit()
            db.refresh(log)
            return log

        rules = db.query(CategoryRule).filter(
            or_(CategoryRule.account_id == account_id, CategoryRule.account_id.is_(None))
        ).all()
        imported = skipped = uncategorized = 0
        new_txs: list[Transaction] = []

        for row in rows:
            if cls._is_duplicate(db, account_id, row):
                skipped += 1
                continue

            tx_type = _infer_type(row.description, row.amount)
            category, needs_review = cls._categorize(row.description, rules, row.amount, tx_type)
            if needs_review:
                uncategorized += 1

            tx = Transaction(
                account_id=account_id,
                user_id=user_id,
                date=row.date,
                amount=row.amount,
                currency=row.currency,
                amount_base=None,
                fx_rate=None,
                description=row.description,
                category=category,
                type=tx_type,
                needs_review=needs_review,
                source="import",
            )
            db.add(tx)
            new_txs.append(tx)
            imported += 1

        log = ImportLog(
            account_id=account_id,
            filename=filename,
            source_type=source_type,
            status="done",
            rows_imported=imported,
            rows_skipped=skipped,
            rows_uncategorized=uncategorized,
            file_hash=file_hash,
        )
        db.add(log)
        db.flush()  # populate log.id

        for tx in new_txs:
            tx.import_log_id = log.id

        db.commit()
        db.refresh(log)
        return log

    @classmethod
    def recategorize_all(cls, db: Session) -> int:
        rules = db.query(CategoryRule).all()
        changed = 0
        for tx in db.query(Transaction).all():
            category, needs_review = cls._categorize(tx.description, rules, float(tx.amount), tx.type)
            if tx.category != category or bool(tx.needs_review) != needs_review:
                tx.category = category
                tx.needs_review = needs_review
                changed += 1
        db.commit()
        return changed
