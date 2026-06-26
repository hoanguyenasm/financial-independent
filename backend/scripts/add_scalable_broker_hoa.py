"""One-off: add Scalable Broker (Hoa) account so both Hoa sub-accounts route correctly."""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from app.database import SessionLocal
from app.models import Account

db = SessionLocal()
existing = db.query(Account).filter(Account.name == "Scalable Broker (Hoa)").first()
if existing:
    print(f"Already exists: id={existing.id}")
else:
    acc = Account(
        owner_user_id=1,
        name="Scalable Broker (Hoa)",
        type="investment",
        currency="EUR",
        institution="Scalable Capital",
        is_active=True,
    )
    db.add(acc)
    db.commit()
    db.refresh(acc)
    print(f"Created: id={acc.id}")

scalable = db.query(Account).filter(Account.institution == "Scalable Capital").all()
for a in scalable:
    print(f"  {a.id}: {a.name}  balance={a.balance}")
db.close()
