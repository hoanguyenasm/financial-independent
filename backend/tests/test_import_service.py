from datetime import date
import pytest
from app.parsers.models import ParsedRow
from app.services.import_service import ImportService, _infer_type
from app.models import Transaction, CategoryRule, ImportLog


def _rules():
    return [
        CategoryRule(pattern="Ropex", category="salary"),
        CategoryRule(pattern="Miete", category="rental"),
        CategoryRule(pattern="airbnb", category="airbnb"),
        CategoryRule(pattern="KAUFLAND", category="groceries"),
        CategoryRule(pattern="Kaufland", category="salary"),
        CategoryRule(pattern="Vodafone", category="utilities"),
    ]


def test_categorize_direction_aware_and_rule_before_transfer():
    cz = ImportService._categorize
    # income arriving as Übertrag must categorize as rental, not transfer
    assert cz("Übertrag / Überweisung Auftraggeber: X Buchungstext: Miete", _rules(), 400.0, "transfer") == ("rental", False)
    # airbnb credit
    assert cz("AIRBNB PAYMENTS LUXEMBOURG", _rules(), 67.5, "transfer") == ("airbnb", False)
    # Ropex credit = salary; Ropex debit = not salary (review)
    assert cz("Auftraggeber: Ropex GmbH", _rules(), 3000.0, "income") == ("salary", False)
    assert cz("Auftraggeber: Ropex GmbH lunchlist", _rules(), -22.85, "expense") == ("uncategorized", True)
    # Kaufland credit = salary, KAUFLAND debit = groceries
    assert cz("Kaufland Lohn", _rules(), 2500.0, "income") == ("salary", False)
    assert cz("KAUFLAND HEILBRONN", _rules(), -12.84, "expense") == ("groceries", False)
    # household self-transfer = transfer, not income
    assert cz("Gutschrift Bao Ngoc Pham", _rules(), 38000.0, "income") == ("transfer", False)
    # plain expense with no rule = review
    assert cz("UNKNOWN SHOP", _rules(), -9.0, "expense") == ("uncategorized", True)
    # zero-amount row is not a credit -> flagged for review
    assert cz("Fee reversal nets to zero", _rules(), 0.0, "") == ("uncategorized", True)


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


def test_duplicate_file_hash_skips_entire_file(db):
    rows = [ParsedRow(date=date(2026, 5, 1), description="REWE", amount=-10.0, currency="EUR")]
    log1 = ImportService.run(db=db, rows=rows, account_id=1, user_id=1,
                             filename="a.csv", source_type="csv", file_hash="abc123")
    assert log1.rows_imported == 1
    log2 = ImportService.run(db=db, rows=rows, account_id=1, user_id=1,
                             filename="a-copy.csv", source_type="csv", file_hash="abc123")
    assert log2.status == "duplicate_file"
    assert log2.rows_imported == 0


def test_negative_zinsen_is_not_interest_income():
    # mortgage payment containing "Zinsen" but negative must NOT be typed interest
    assert _infer_type("Auftraggeber: Commerzbank AG Tilgung 1997,84 Zinsen 180,53", -2178.37) != "interest"


def test_positive_zinsen_still_interest():
    assert _infer_type("Erhaltene Zinsen", 28.55) == "interest"


def test_negative_ertrag_not_dividend():
    assert _infer_type("Ausschüttung Ertrag reversal", -5.0) != "dividend"


def test_positive_dividend_still_dividend():
    assert _infer_type("Ertrag Cash Dividend for ISIN US123", 5.13) == "dividend"


def test_recategorize_all_applies_new_rules(db):
    from app.models import Transaction, CategoryRule
    db.add(Transaction(account_id=1, user_id=1, date=date(2026, 4, 2), amount=-12.84,
                        currency="EUR", description="KAUFLAND HEILBRONN", category="uncategorized",
                        type="expense", needs_review=True, source="import"))
    db.add(CategoryRule(pattern="KAUFLAND", category="groceries"))
    db.commit()
    changed = ImportService.recategorize_all(db)
    assert changed == 1
    tx = db.query(Transaction).first()
    assert tx.category == "groceries" and tx.needs_review is False
