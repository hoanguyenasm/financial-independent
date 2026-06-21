from datetime import date
import pytest
from app.parsers.models import ParsedRow
from app.services.import_service import ImportService, _infer_type
from app.models import Transaction, CategoryRule, ImportLog


def test_uebertrag_typed_as_transfer_not_dividend():
    # "Übertrag" (German for transfer) normalizes to "uebertrag", which contains
    # the substring "ertrag" — it must NOT be misclassified as a dividend.
    assert _infer_type("Übertrag/ DucHoaNguyen End-to-End-Ref.:", -90500.0) == "transfer"


def test_uebertrag_sondertilgung_typed_as_transfer():
    assert _infer_type("Übertrag/ DucHoaNguyenundBao Sondertilgung", -22850.0) == "transfer"


def test_genuine_dividend_still_typed_as_dividend():
    assert _infer_type("Ertrag Cash Dividend for ISIN US67066G1040", 12.50) == "dividend"
    assert _infer_type("Kapitalmaßnahme Ausschüttungen", 8.30) == "dividend"


@pytest.fixture
def seed_rule(db):
    rule = CategoryRule(pattern="REWE", category="supermarket")
    db.add(rule)
    db.commit()
    return rule


def test_import_service_basic(db):
    rows = [
        ParsedRow(date=date(2026, 5, 1), description="REWE Supermarkt", amount=-42.80, currency="EUR"),
        ParsedRow(date=date(2026, 5, 5), description="Gehalt Robert Bosch", amount=7293.00, currency="EUR"),
    ]
    log = ImportService.run(
        db=db, rows=rows, account_id=1, user_id=1,
        filename="may.csv", source_type="csv",
    )
    assert log.rows_imported == 2
    assert log.rows_skipped == 0
    assert log.rows_uncategorized == 1
    assert log.status == "done"
    txns = db.query(Transaction).all()
    assert len(txns) == 2


def test_category_rule_applied(db, seed_rule):
    rows = [ParsedRow(date=date(2026, 5, 1), description="REWE Supermarkt", amount=-42.80, currency="EUR")]
    ImportService.run(db=db, rows=rows, account_id=1, user_id=1, filename="x.csv", source_type="csv")
    tx = db.query(Transaction).first()
    assert tx.category == "supermarket"
    assert tx.needs_review is False


def test_uncategorized_flagged_for_review(db):
    rows = [ParsedRow(date=date(2026, 5, 1), description="Unknown vendor", amount=-10.00, currency="EUR")]
    ImportService.run(db=db, rows=rows, account_id=1, user_id=1, filename="x.csv", source_type="csv")
    tx = db.query(Transaction).first()
    assert tx.category == "uncategorized"
    assert tx.needs_review is True


def test_duplicate_skipped(db):
    rows = [ParsedRow(date=date(2026, 5, 1), description="REWE", amount=-42.80, currency="EUR")]
    ImportService.run(db=db, rows=rows, account_id=1, user_id=1, filename="a.csv", source_type="csv")
    log2 = ImportService.run(db=db, rows=rows, account_id=1, user_id=1, filename="b.csv", source_type="csv")
    assert log2.rows_skipped == 1
    assert log2.rows_imported == 0
    assert db.query(Transaction).count() == 1


def test_import_log_written_to_db(db):
    rows = [ParsedRow(date=date(2026, 5, 1), description="REWE", amount=-42.80, currency="EUR")]
    ImportService.run(db=db, rows=rows, account_id=1, user_id=1, filename="may.csv", source_type="csv")
    log = db.query(ImportLog).first()
    assert log is not None
    assert log.filename == "may.csv"
    assert log.source_type == "csv"
    assert log.account_id == 1


def test_amount_base_and_fx_rate_set(db):
    rows = [ParsedRow(date=date(2026, 5, 1), description="Amazon", amount=-50.00, currency="USD")]
    ImportService.run(db=db, rows=rows, account_id=1, user_id=1, filename="x.csv", source_type="csv")
    tx = db.query(Transaction).first()
    assert tx.currency == "USD"
    assert tx.amount_base is None
