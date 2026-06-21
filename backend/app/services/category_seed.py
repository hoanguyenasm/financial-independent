from sqlalchemy.orm import Session
from app.models import CategoryRule

# (pattern, category). Income categories: salary, rental, airbnb, interest, dividend.
SEED_RULES: list[tuple[str, str]] = [
    # income
    ("Ropex", "salary"),
    ("Kaufland", "salary"),
    ("Miete", "rental"),
    ("Yarob Abbas", "rental"),
    ("Valentin Josu", "rental"),
    ("Kadir Dora", "rental"),
    ("ANNA ANGIOLA", "rental"),
    ("AIRBNB", "airbnb"),
    ("Erhaltene Zinsen", "interest"),
    ("Zinsen", "interest"),
    # groceries
    ("KAUFLAND", "groceries"), ("LIDL", "groceries"), ("REWE", "groceries"),
    ("EDEKA", "groceries"), ("ALDI", "groceries"), ("PENNY", "groceries"),
    ("NETTO", "groceries"),
    # dining
    ("Buonissimo", "dining"), ("McDonald", "dining"), ("Lieferando", "dining"),
    # shopping
    ("AMAZON", "shopping"), ("PAYPAL", "shopping"), ("Zalando", "shopping"),
    ("Pflanzen-Koelle", "shopping"),
    # subscriptions
    ("Prime", "subscriptions"), ("iTunes", "subscriptions"), ("APPLE", "subscriptions"),
    ("GYMPASS", "subscriptions"), ("Netflix", "subscriptions"), ("Spotify", "subscriptions"),
    # health
    ("Kinderwunsch", "health"), ("Aerzte", "health"), ("Apotheke", "health"),
    # transport
    ("Bahn", "transport"), ("Aral", "transport"), ("Shell", "transport"),
    # utilities
    ("Yello", "utilities"), ("Telekom", "utilities"), ("Vodafone", "utilities"),
    # mortgage (expense — must NOT be in _INCOME_CATEGORIES)
    ("Commerzbank", "mortgage"),
    ("Tilgung", "mortgage"),
]


def seed_category_rules(db: Session) -> int:
    existing = {(r.pattern, r.category) for r in db.query(CategoryRule).all()}
    inserted = 0
    for pattern, category in SEED_RULES:
        if (pattern, category) in existing:
            continue
        db.add(CategoryRule(pattern=pattern, category=category, account_id=None))
        inserted += 1
    db.commit()
    return inserted
