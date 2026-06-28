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
    # car: charging, wash, fuel, parking, maintenance
    ("Tesla", "car"), ("Tesla Supercharger", "car"), ("Supercharger", "car"), ("Ionity", "car"),
    ("EnBW mobility", "car"), ("Ladestation", "car"), ("Charging", "car"),
    ("Waschstrasse", "car"), ("Waschpark", "car"), ("Car Wash", "car"), ("Autowäsche", "car"),
    ("Aral", "car"), ("Shell", "car"), ("Esso", "car"), ("Tankstelle", "car"),
    ("Parkhaus", "car"), ("PARKING", "car"), ("ADAC", "car"), ("Werkstatt", "car"),
    # public transport
    ("Bahn", "transit"), ("Deutsche Bahn", "transit"), ("VVS", "transit"),
    ("BVG", "transit"), ("FlixBus", "transit"), ("MVG", "transit"),
    # investment fees & taxes (broker charges, transaction taxes)
    ("Finanztransaktionssteuer", "investment_fees"), ("Transaktionssteuer", "investment_fees"),
    ("Servicegebühr", "investment_fees"), ("Depotgebühr", "investment_fees"),
    ("Verwahrentgelt", "investment_fees"), ("Ordergebühr", "investment_fees"),
    # Scalable PRIME+ broker subscription fee — more specific than "Prime" (Amazon).
    ("Prime-Abonnement", "investment_fees"),
    # ETF savings plans (Sparplan) run monthly on Scalable. Their broker buys all read
    # "Kauf eines Finanzinstruments" — only the ISIN tells them apart from one-off trades,
    # so match the ISIN (now folded into the description) to tag them as passive ETF.
    ("IE00BLPK3577", "etf"),   # WisdomTree Cybersecurity
    ("IE00BMC38736", "etf"),   # VanEck Semiconductor
    ("IE000M7V94E1", "etf"),   # VanEck Uranium & Nuclear Technologies
    ("DE000A2T0VU5", "etf"),   # Xtrackers Physical Gold ETC
    ("IE000BI8OT95", "etf"),   # Amundi Core MSCI World
    # utilities
    ("Yello", "utilities"), ("Telekom", "utilities"), ("Vodafone", "utilities"),
    # mortgage (expense — must NOT be in _INCOME_CATEGORIES)
    ("Commerzbank", "mortgage"),
    ("Tilgung", "mortgage"),
    # credit-card settlement pulled from the bank account = internal transfer, not expense
    ("American Express", "transfer"),
    ("AMERICAN EXPRESS", "transfer"),
    # rental deposit (Kaution) held on behalf of a tenant — neither income nor expense
    ("Kaution", "deposit"),
    ("Mietkaution", "deposit"),
    ("Deposit", "deposit"),
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
