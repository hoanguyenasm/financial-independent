from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.parsers.models import ParsedRow
from app.models import Transaction, CategoryRule, ImportLog


class ImportService:

    @staticmethod
    def _categorize(description: str, rules: list[CategoryRule], amount: float = 0.0) -> tuple[str, bool]:
        lower_desc = description.lower()
        for rule in rules:
            if rule.pattern.lower() in lower_desc:
                return rule.category, False
        if amount >= 0:
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

    @classmethod
    def run(
        cls,
        db: Session,
        rows: list[ParsedRow],
        account_id: int,
        user_id: int,
        filename: str,
        source_type: str,
    ) -> ImportLog:
        rules = db.query(CategoryRule).all()
        imported = skipped = uncategorized = 0

        for row in rows:
            if cls._is_duplicate(db, account_id, row):
                skipped += 1
                continue

            category, needs_review = cls._categorize(row.description, rules, row.amount)
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
                type="expense" if row.amount < 0 else "income",
                needs_review=needs_review,
                source="import",
            )
            db.add(tx)
            imported += 1

        log = ImportLog(
            account_id=account_id,
            filename=filename,
            source_type=source_type,
            status="done",
            rows_imported=imported,
            rows_skipped=skipped,
            rows_uncategorized=uncategorized,
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        return log
