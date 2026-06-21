"""One-off: wipe transactions + import logs (keep accounts), seed rules, import 2026 tree, recategorize."""
from app.database import SessionLocal
from app.models import Transaction, ImportLog, Account
from app.services.category_seed import seed_category_rules
from app.services.import_service import ImportService
import io, os, hashlib
from app.parsers import parse_pdf, parse_csv
from app.parsers.csv_parser import decode_csv_bytes
from app.parsers.pdf_parser import _extract_text_lines
from app.parsers.balance_extractor import extract_balance
from app.services.account_router import detect_owner, detect_bank, route_account

TREE = r"G:\My Drive\12_Budget_2026"

db = SessionLocal()
db.query(Transaction).delete(); db.query(ImportLog).delete()
for a in db.query(Account).all():
    a.balance = None; a.balance_as_of = None
db.commit()
print("seeded rules:", seed_category_rules(db))

files = [os.path.join(r, f) for r, _, fs in os.walk(TREE) for f in sorted(fs)
         if f.lower().rsplit(".", 1)[-1] in ("pdf", "csv")]
for fp in files:
    raw = open(fp, "rb").read(); fhash = hashlib.sha256(raw).hexdigest()
    ext = fp.lower().rsplit(".", 1)[-1]
    if ext == "csv":
        text = decode_csv_bytes(raw); lines = text.splitlines(); rows = parse_csv(io.StringIO(text))
    else:
        lines = _extract_text_lines(io.BytesIO(raw)); rows = parse_pdf(io.BytesIO(raw))
    owner = detect_owner(fp); bank = detect_bank(os.path.basename(fp), lines)
    acc = route_account(db, bank, owner, lines)
    if acc is None:
        print(f"SKIP {os.path.basename(fp)} bank={bank} owner={owner}"); continue
    log = ImportService.run(db=db, rows=rows, account_id=acc, user_id=1,
                            filename=os.path.basename(fp), source_type=ext, file_hash=fhash)
    print(f"{os.path.basename(fp)[:40]:40} bank={bank} owner={owner} acc={acc} "
          f"imp={log.rows_imported} skip={log.rows_skipped} status={log.status}")
    bal = extract_balance(bank, lines)
    as_of = max((r.date for r in rows), default=None)
    if bal is not None and acc is not None:
        a = db.get(Account, acc)
        if a is not None and (a.balance_as_of is None or (as_of is not None and as_of > a.balance_as_of)):
            a.balance = bal; a.balance_as_of = as_of; db.commit()
            print(f"   balance[{acc}] = {bal} as of {as_of}")
print("recategorized:", ImportService.recategorize_all(db))
db.close()
