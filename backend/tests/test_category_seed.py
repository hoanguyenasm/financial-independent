from app.services.category_seed import seed_category_rules, SEED_RULES
from app.models import CategoryRule


def test_seed_is_idempotent(db):
    n1 = seed_category_rules(db)
    assert n1 == len(SEED_RULES)
    n2 = seed_category_rules(db)
    assert n2 == 0
    assert db.query(CategoryRule).count() == len(SEED_RULES)


def test_seed_contains_income_and_expense(db):
    cats = {c for _, c in SEED_RULES}
    assert {"salary", "rental", "airbnb", "groceries", "utilities"} <= cats
