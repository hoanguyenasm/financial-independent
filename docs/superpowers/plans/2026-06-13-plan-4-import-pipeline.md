# Plan 4 — Import Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a statement import pipeline that accepts CSV and PDF bank exports, parses them into normalized transactions, applies category rules, detects duplicates, persists an ImportLog, and wires the frontend Import screen to call the real endpoint.

**Architecture:** A pure-Python `parsers/` layer handles format-specific extraction; an `ImportService` class owns the orchestration (parse → categorize → dedup → write); a single `/import` FastAPI router exposes the multipart upload and log-listing endpoints. The frontend Import screen replaces its mock `fetch` stub with a real `POST /import` call and renders the server response.

**Tech Stack:** FastAPI `UploadFile`, pdfplumber (already in requirements.txt), Python `csv` stdlib, SQLAlchemy (already wired), pytest + TestClient (existing test harness), vanilla JS/HTML frontend.

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `backend/app/parsers/__init__.py` | Re-exports `ParsedRow`, `parse_csv`, `parse_pdf` |
| Create | `backend/app/parsers/models.py` | `ParsedRow` dataclass (date, description, amount, currency) |
| Create | `backend/app/parsers/csv_parser.py` | Smart-column CSV parser (auto-detect delimiter, date format, debit/credit columns) |
| Create | `backend/app/parsers/pdf_parser.py` | pdfplumber table extractor → ParsedRow list |
| Create | `backend/app/services/__init__.py` | Empty init |
| Create | `backend/app/services/import_service.py` | `ImportService.run()` — orchestrates parse, categorize, dedup, persist |
| Create | `backend/app/schemas/import_log.py` | `ImportLogRead` Pydantic schema |
| Modify | `backend/app/schemas/__init__.py` | Export `ImportLogRead` |
| Create | `backend/app/routers/import_router.py` | `POST /import`, `GET /import/logs` |
| Modify | `backend/app/main.py` | Register `import_router` |
| Create | `backend/tests/test_csv_parser.py` | Unit tests for CSV parser |
| Create | `backend/tests/test_pdf_parser.py` | Unit tests for PDF parser |
| Create | `backend/tests/test_import_service.py` | Integration tests for ImportService |
| Create | `backend/tests/test_import_router.py` | API tests for `/import` endpoints |
| Create | `backend/tests/fixtures/sample.csv` | Minimal test CSV file |
| Create | `backend/tests/fixtures/sample.pdf` | Minimal test PDF (generated inline in test) |
| Modify | `frontend/public/app/app.js` | Wire Import screen to `POST /import`, render ImportLog response |

---

## Task 1: ParsedRow dataclass and CSV parser

**Files:**
- Create: `backend/app/parsers/models.py`
- Create: `backend/app/parsers/csv_parser.py`
- Create: `backend/app/parsers/__init__.py`
- Create: `backend/tests/fixtures/sample.csv`
- Create: `backend/tests/test_csv_parser.py`

### Background

The CSV parser must handle three common European bank export formats:
- **Semicolon-delimited, DD.MM.YYYY** — DKB, Comdirect, ING (most German banks)
- **Comma-delimited, YYYY-MM-DD** — Revolut, N26, Wise
- **Separate Soll/Haben columns** — some Comdirect exports have "Soll" (debit, negative) and "Haben" (credit, positive) as separate columns instead of a single signed "amount"

Column detection priority:
1. Sniff delimiter from first line
2. Normalize headers: lowercase, strip quotes/whitespace
3. Date column: first column whose header contains `date`, `datum`, `buchung`, `valuta`
4. Amount column: first column whose header contains `amount`, `betrag`, `umsatz`, `saldo`; fall back to `haben`/`soll` pair
5. Description column: first column whose header contains `description`, `verwendungszweck`, `buchungstext`, `payee`, `empfänger`, `memo`
6. Currency column: first column whose header contains `currency`, `währung`; fall back to caller-supplied `default_currency`

Amount sign convention: negative = expense (money out), positive = income (money in).

- [ ] **Step 1: Create ParsedRow dataclass**

```python
# backend/app/parsers/models.py
from dataclasses import dataclass
from datetime import date


@dataclass
class ParsedRow:
    date: date
    description: str
    amount: float          # negative = expense, positive = income
    currency: str          # ISO 4217
```

- [ ] **Step 2: Create sample CSV fixture**

Create `backend/tests/fixtures/sample.csv` with this exact content (semicolon-delimited, DD.MM.YYYY, signed amount, EUR):

```
Buchungsdatum;Verwendungszweck;Betrag;Währung
01.05.2026;REWE Supermarkt;-42.80;EUR
05.05.2026;Gehalt Robert Bosch GmbH;7293.00;EUR
10.05.2026;Netflix;-17.99;EUR
15.05.2026;Mieteinnahme Wohnung Stuttgart;2100.00;EUR
```

- [ ] **Step 3: Write failing CSV parser tests**

```python
# backend/tests/test_csv_parser.py
import io
from datetime import date
import pytest
from app.parsers.csv_parser import parse_csv
from app.parsers.models import ParsedRow


SEMICOLON_CSV = """\
Buchungsdatum;Verwendungszweck;Betrag;Währung
01.05.2026;REWE Supermarkt;-42.80;EUR
05.05.2026;Gehalt Robert Bosch GmbH;7293.00;EUR
10.05.2026;Netflix;-17.99;EUR
"""

COMMA_CSV = """\
date,description,amount,currency
2026-05-01,REWE Supermarkt,-42.80,EUR
2026-05-05,Salary,7293.00,EUR
"""

SOLL_HABEN_CSV = """\
Buchungsdatum;Buchungstext;Soll;Haben;Währung
01.05.2026;REWE;42.80;;EUR
05.05.2026;Gehalt;;7293.00;EUR
"""


def test_parse_semicolon_csv():
    rows = parse_csv(io.StringIO(SEMICOLON_CSV))
    assert len(rows) == 3
    assert rows[0] == ParsedRow(date=date(2026, 5, 1), description="REWE Supermarkt", amount=-42.80, currency="EUR")
    assert rows[1].amount == 7293.00
    assert rows[2].amount == -17.99


def test_parse_comma_csv():
    rows = parse_csv(io.StringIO(COMMA_CSV))
    assert len(rows) == 2
    assert rows[0].date == date(2026, 5, 1)
    assert rows[0].description == "REWE Supermarkt"
    assert rows[0].currency == "EUR"


def test_parse_soll_haben_csv():
    rows = parse_csv(io.StringIO(SOLL_HABEN_CSV))
    assert len(rows) == 2
    assert rows[0].amount == -42.80   # Soll → negative
    assert rows[1].amount == 7293.00  # Haben → positive


def test_default_currency_fallback():
    no_cur = "date,description,amount\n2026-05-01,REWE,-42.80\n"
    rows = parse_csv(io.StringIO(no_cur), default_currency="USD")
    assert rows[0].currency == "USD"


def test_parse_csv_file(tmp_path):
    src = tmp_path / "sample.csv"
    src.write_text(SEMICOLON_CSV, encoding="utf-8")
    with open(src, encoding="utf-8") as f:
        rows = parse_csv(f)
    assert len(rows) == 3


def test_empty_csv_returns_empty_list():
    rows = parse_csv(io.StringIO("Buchungsdatum;Verwendungszweck;Betrag\n"))
    assert rows == []


def test_malformed_amount_row_is_skipped():
    bad = "date,description,amount\n2026-05-01,REWE,not-a-number\n"
    rows = parse_csv(io.StringIO(bad))
    assert rows == []
```

- [ ] **Step 4: Run tests to confirm they fail**

```
cd backend && .venv\Scripts\python -m pytest tests/test_csv_parser.py -v 2>&1 | head -30
```

Expected: `ModuleNotFoundError: No module named 'app.parsers'`

- [ ] **Step 5: Implement CSV parser**

```python
# backend/app/parsers/csv_parser.py
import csv
import io
from datetime import date, datetime
from typing import TextIO
from .models import ParsedRow

_DATE_FORMATS = ["%d.%m.%Y", "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%d.%m.%y"]
_DATE_HEADERS = {"date", "datum", "buchungsdatum", "buchung", "valutadatum", "valuta"}
_DESC_HEADERS = {"description", "verwendungszweck", "buchungstext", "payee", "empfänger", "memo", "auftraggeber"}
_AMT_HEADERS  = {"amount", "betrag", "umsatz", "buchungsbetrag"}
_CUR_HEADERS  = {"currency", "währung", "wahrung"}
_DEBIT_HEADERS  = {"soll", "ausgabe", "debit"}
_CREDIT_HEADERS = {"haben", "einnahme", "credit"}


def _sniff_delimiter(sample: str) -> str:
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=";,\t|")
        return dialect.delimiter
    except csv.Error:
        return ","


def _parse_date(value: str) -> date | None:
    value = value.strip().strip('"')
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def _parse_amount(value: str) -> float | None:
    value = value.strip().strip('"').replace(" ", "")
    if not value:
        return None
    # European decimal: 1.234,56 → 1234.56
    if "," in value and "." in value:
        if value.rindex(",") > value.rindex("."):
            value = value.replace(".", "").replace(",", ".")
        else:
            value = value.replace(",", "")
    elif "," in value:
        value = value.replace(",", ".")
    try:
        return float(value)
    except ValueError:
        return None


def _find_col(headers: list[str], candidates: set[str]) -> int | None:
    for i, h in enumerate(headers):
        if h in candidates:
            return i
    return None


def parse_csv(file: TextIO, default_currency: str = "EUR") -> list[ParsedRow]:
    content = file.read()
    if isinstance(content, bytes):
        content = content.decode("utf-8-sig")
    delimiter = _sniff_delimiter(content[:1024])
    reader = csv.reader(io.StringIO(content), delimiter=delimiter)
    raw_headers = next(reader, None)
    if not raw_headers:
        return []
    headers = [h.strip().strip('"').lower() for h in raw_headers]

    date_col  = _find_col(headers, _DATE_HEADERS)
    desc_col  = _find_col(headers, _DESC_HEADERS)
    amt_col   = _find_col(headers, _AMT_HEADERS)
    cur_col   = _find_col(headers, _CUR_HEADERS)
    debit_col = _find_col(headers, _DEBIT_HEADERS)
    credit_col= _find_col(headers, _CREDIT_HEADERS)

    if date_col is None or desc_col is None:
        return []
    has_single_amount = amt_col is not None
    has_soll_haben = debit_col is not None or credit_col is not None

    rows: list[ParsedRow] = []
    for raw in reader:
        if not any(c.strip() for c in raw):
            continue
        def cell(i): return raw[i].strip().strip('"') if i is not None and i < len(raw) else ""

        parsed_date = _parse_date(cell(date_col))
        if parsed_date is None:
            continue

        if has_single_amount:
            amount = _parse_amount(cell(amt_col))
        elif has_soll_haben:
            debit  = _parse_amount(cell(debit_col))  if debit_col  is not None else None
            credit = _parse_amount(cell(credit_col)) if credit_col is not None else None
            if debit and debit > 0:
                amount = -debit
            elif credit and credit > 0:
                amount = credit
            else:
                amount = None
        else:
            amount = None

        if amount is None:
            continue

        currency = cell(cur_col) if cur_col is not None and cell(cur_col) else default_currency
        rows.append(ParsedRow(date=parsed_date, description=cell(desc_col), amount=amount, currency=currency))
    return rows
```

- [ ] **Step 6: Create parsers package init**

```python
# backend/app/parsers/__init__.py
from .models import ParsedRow
from .csv_parser import parse_csv
from .pdf_parser import parse_pdf
```

Note: `parse_pdf` will be defined in Task 2. For now the import will fail — that's fine, tests are scoped to csv_parser directly.

Temporarily stub `parse_pdf` so the package init doesn't break the CSV tests:

```python
# backend/app/parsers/__init__.py
from .models import ParsedRow
from .csv_parser import parse_csv

try:
    from .pdf_parser import parse_pdf
except ImportError:
    pass
```

- [ ] **Step 7: Run CSV tests — expect all pass**

```
cd backend && .venv\Scripts\python -m pytest tests/test_csv_parser.py -v
```

Expected: `6 passed`

- [ ] **Step 8: Commit**

```bash
git add backend/app/parsers/models.py backend/app/parsers/csv_parser.py backend/app/parsers/__init__.py backend/tests/test_csv_parser.py backend/tests/fixtures/sample.csv
git commit -m "feat: add ParsedRow dataclass and smart-column CSV parser"
```

---

## Task 2: PDF parser

**Files:**
- Create: `backend/app/parsers/pdf_parser.py`
- Create: `backend/tests/test_pdf_parser.py`
- Modify: `backend/app/parsers/__init__.py`

### Background

pdfplumber is already installed. The approach: open the PDF, extract tables from every page, pass each table through the same column-detection logic as the CSV parser. If no tables are found, fall back to extracting raw text lines and applying a heuristic regex.

- [ ] **Step 1: Write failing PDF parser tests**

```python
# backend/tests/test_pdf_parser.py
import io
import pytest
from datetime import date

# We generate a minimal single-page PDF in-memory using reportlab so tests
# don't depend on a checked-in binary. reportlab is not in requirements.txt;
# we skip these tests if it is unavailable.
pytest.importorskip("reportlab")

from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Table
from app.parsers.pdf_parser import parse_pdf
from app.parsers.models import ParsedRow


def _make_pdf_bytes(rows: list[list[str]]) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4)
    table = Table(rows)
    doc.build([table])
    return buf.getvalue()


def test_parse_pdf_with_table():
    data = [
        ["Buchungsdatum", "Verwendungszweck", "Betrag", "Währung"],
        ["01.05.2026", "REWE Supermarkt", "-42.80", "EUR"],
        ["05.05.2026", "Gehalt Robert Bosch", "7293.00", "EUR"],
    ]
    pdf_bytes = _make_pdf_bytes(data)
    rows = parse_pdf(io.BytesIO(pdf_bytes))
    assert len(rows) == 2
    assert rows[0] == ParsedRow(date=date(2026, 5, 1), description="REWE Supermarkt", amount=-42.80, currency="EUR")
    assert rows[1].amount == 7293.00


def test_parse_pdf_empty_table():
    data = [["Buchungsdatum", "Verwendungszweck", "Betrag", "Währung"]]
    pdf_bytes = _make_pdf_bytes(data)
    rows = parse_pdf(io.BytesIO(pdf_bytes))
    assert rows == []


def test_parse_pdf_default_currency():
    data = [
        ["date", "description", "amount"],
        ["2026-05-01", "REWE", "-42.80"],
    ]
    pdf_bytes = _make_pdf_bytes(data)
    rows = parse_pdf(io.BytesIO(pdf_bytes), default_currency="USD")
    assert rows[0].currency == "USD"
```

- [ ] **Step 2: Run tests to confirm they fail**

```
cd backend && .venv\Scripts\python -m pytest tests/test_pdf_parser.py -v 2>&1 | head -20
```

Expected: skip or `ModuleNotFoundError: No module named 'app.parsers.pdf_parser'`

- [ ] **Step 3: Implement PDF parser**

```python
# backend/app/parsers/pdf_parser.py
import io
import csv
from typing import BinaryIO
import pdfplumber
from .csv_parser import parse_csv, _DATE_HEADERS, _find_col
from .models import ParsedRow


def _table_to_csv_stream(table: list[list[str | None]]) -> io.StringIO:
    buf = io.StringIO()
    writer = csv.writer(buf)
    for row in table:
        writer.writerow([cell or "" for cell in row])
    buf.seek(0)
    return buf


def parse_pdf(file: BinaryIO, default_currency: str = "EUR") -> list[ParsedRow]:
    rows: list[ParsedRow] = []
    with pdfplumber.open(file) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                if not table or len(table) < 2:
                    continue
                stream = _table_to_csv_stream(table)
                page_rows = parse_csv(stream, default_currency=default_currency)
                rows.extend(page_rows)
    return rows
```

- [ ] **Step 4: Update parsers `__init__.py`**

```python
# backend/app/parsers/__init__.py
from .models import ParsedRow
from .csv_parser import parse_csv
from .pdf_parser import parse_pdf
```

- [ ] **Step 5: Run PDF tests**

```
cd backend && .venv\Scripts\python -m pytest tests/test_pdf_parser.py -v
```

Expected: `3 passed` (or `3 skipped` if reportlab is not installed — acceptable; note it in output). If skipped, install reportlab for verification: `.venv\Scripts\pip install reportlab` then re-run.

- [ ] **Step 6: Run full test suite to confirm no regressions**

```
cd backend && .venv\Scripts\python -m pytest tests/ -q
```

Expected: all previous tests still pass, PDF tests pass or skip.

- [ ] **Step 7: Commit**

```bash
git add backend/app/parsers/pdf_parser.py backend/app/parsers/__init__.py backend/tests/test_pdf_parser.py
git commit -m "feat: add pdfplumber PDF parser (table extraction → ParsedRow)"
```

---

## Task 3: ImportService — orchestrate parse, categorize, dedup, persist

**Files:**
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/import_service.py`
- Create: `backend/tests/test_import_service.py`

### Background

`ImportService.run()` accepts a parsed list of `ParsedRow` items plus metadata (account_id, user_id, filename, source_type) and a DB session, then:
1. **Categorize**: for each row, scan all `CategoryRule` rows; apply first rule whose `pattern` is a case-insensitive substring of `description`. Unmatched → `"uncategorized"`, set `needs_review=True`.
2. **Deduplicate**: skip rows where `(account_id, date, amount, description)` already exists in `transactions`.
3. **Persist transactions**: `source="import"`.
4. **Write ImportLog**: status `"done"`, counts of imported/skipped/uncategorized.

Returns an `ImportLog` ORM instance.

- [ ] **Step 1: Create services package**

```python
# backend/app/services/__init__.py
```

(empty file)

- [ ] **Step 2: Write failing ImportService tests**

```python
# backend/tests/test_import_service.py
from datetime import date
import pytest
from app.parsers.models import ParsedRow
from app.services.import_service import ImportService
from app.models import Transaction, CategoryRule, ImportLog


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
    assert log.rows_uncategorized == 1      # "Gehalt Robert Bosch" has no rule
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
    # No FX rate stored → amount_base defaults to amount, fx_rate = None
    ImportService.run(db=db, rows=rows, account_id=1, user_id=1, filename="x.csv", source_type="csv")
    tx = db.query(Transaction).first()
    assert tx.currency == "USD"
    # amount_base is None when no FX rate available (frontend handles display)
    assert tx.amount_base is None
```

- [ ] **Step 3: Run tests to confirm they fail**

```
cd backend && .venv\Scripts\python -m pytest tests/test_import_service.py -v 2>&1 | head -20
```

Expected: `ModuleNotFoundError: No module named 'app.services'`

- [ ] **Step 4: Implement ImportService**

```python
# backend/app/services/import_service.py
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.parsers.models import ParsedRow
from app.models import Transaction, CategoryRule, ImportLog


class ImportService:

    @staticmethod
    def _categorize(description: str, rules: list[CategoryRule]) -> tuple[str, bool]:
        lower_desc = description.lower()
        for rule in rules:
            if rule.pattern.lower() in lower_desc:
                return rule.category, False
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

            category, needs_review = cls._categorize(row.description, rules)
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
```

- [ ] **Step 5: Run ImportService tests**

```
cd backend && .venv\Scripts\python -m pytest tests/test_import_service.py -v
```

Expected: `6 passed`

- [ ] **Step 6: Run full test suite**

```
cd backend && .venv\Scripts\python -m pytest tests/ -q
```

Expected: all previous 47+ tests pass, 6 new pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/__init__.py backend/app/services/import_service.py backend/tests/test_import_service.py
git commit -m "feat: add ImportService — parse, categorize, dedup, persist transactions"
```

---

## Task 4: ImportLog schema and `/import` router

**Files:**
- Create: `backend/app/schemas/import_log.py`
- Modify: `backend/app/schemas/__init__.py`
- Create: `backend/app/routers/import_router.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_import_router.py`

### Background

Two endpoints:
- `POST /import` — multipart form: `file` (UploadFile), `account_id` (int), `user_id` (int). Detects file type from filename extension (`.csv` vs `.pdf`). Returns `ImportLogRead`.
- `GET /import/logs` — query params: `account_id` (optional int). Returns `list[ImportLogRead]` sorted newest-first.

- [ ] **Step 1: Create ImportLog schema**

```python
# backend/app/schemas/import_log.py
from pydantic import BaseModel
from datetime import datetime


class ImportLogRead(BaseModel):
    id: int
    account_id: int
    filename: str
    source_type: str
    status: str
    rows_imported: int
    rows_skipped: int
    rows_uncategorized: int
    imported_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Export ImportLogRead from schemas package**

Open `backend/app/schemas/__init__.py`. Add one line at the bottom:

```python
from .import_log import ImportLogRead
```

The full file after edit should look like:
```python
from .user import UserCreate, UserRead, UserUpdate
from .account import AccountCreate, AccountRead, AccountUpdate
from .transaction import TransactionCreate, TransactionRead, TransactionUpdate
from .asset import AssetCreate, AssetRead, AssetUpdate
from .fi_goal import FIGoalCreate, FIGoalRead, FIGoalUpdate
from .settings import AppSettingsRead, AppSettingsUpdate
from .import_log import ImportLogRead
```

- [ ] **Step 3: Write failing router tests**

```python
# backend/tests/test_import_router.py
import io
import pytest


CSV_CONTENT = (
    "Buchungsdatum;Verwendungszweck;Betrag;Währung\n"
    "01.05.2026;REWE Supermarkt;-42.80;EUR\n"
    "05.05.2026;Gehalt Robert Bosch;7293.00;EUR\n"
)


def test_import_csv_success(client):
    file_bytes = CSV_CONTENT.encode("utf-8")
    response = client.post(
        "/import",
        data={"account_id": "1", "user_id": "1"},
        files={"file": ("may.csv", io.BytesIO(file_bytes), "text/csv")},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["rows_imported"] == 2
    assert body["rows_skipped"] == 0
    assert body["status"] == "done"
    assert body["filename"] == "may.csv"
    assert body["source_type"] == "csv"


def test_import_duplicate_rows_skipped(client):
    file_bytes = CSV_CONTENT.encode("utf-8")
    client.post(
        "/import",
        data={"account_id": "1", "user_id": "1"},
        files={"file": ("may.csv", io.BytesIO(file_bytes), "text/csv")},
    )
    response = client.post(
        "/import",
        data={"account_id": "1", "user_id": "1"},
        files={"file": ("may.csv", io.BytesIO(file_bytes), "text/csv")},
    )
    body = response.json()
    assert body["rows_skipped"] == 2
    assert body["rows_imported"] == 0


def test_import_unsupported_format(client):
    response = client.post(
        "/import",
        data={"account_id": "1", "user_id": "1"},
        files={"file": ("data.xlsx", io.BytesIO(b"fake"), "application/vnd.ms-excel")},
    )
    assert response.status_code == 422


def test_list_import_logs_empty(client):
    response = client.get("/import/logs")
    assert response.status_code == 200
    assert response.json() == []


def test_list_import_logs_after_upload(client):
    file_bytes = CSV_CONTENT.encode("utf-8")
    client.post(
        "/import",
        data={"account_id": "1", "user_id": "1"},
        files={"file": ("may.csv", io.BytesIO(file_bytes), "text/csv")},
    )
    response = client.get("/import/logs")
    assert response.status_code == 200
    logs = response.json()
    assert len(logs) == 1
    assert logs[0]["filename"] == "may.csv"


def test_list_import_logs_filtered_by_account(client):
    file_bytes = CSV_CONTENT.encode("utf-8")
    client.post(
        "/import",
        data={"account_id": "1", "user_id": "1"},
        files={"file": ("a1.csv", io.BytesIO(file_bytes), "text/csv")},
    )
    client.post(
        "/import",
        data={"account_id": "2", "user_id": "1"},
        files={"file": ("a2.csv", io.BytesIO(file_bytes), "text/csv")},
    )
    response = client.get("/import/logs?account_id=1")
    logs = response.json()
    assert len(logs) == 1
    assert logs[0]["account_id"] == 1
```

- [ ] **Step 4: Run tests to confirm they fail**

```
cd backend && .venv\Scripts\python -m pytest tests/test_import_router.py -v 2>&1 | head -20
```

Expected: `404 Not Found` or `ImportError`

- [ ] **Step 5: Implement import router**

```python
# backend/app/routers/import_router.py
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.parsers import parse_csv, parse_pdf
from app.services.import_service import ImportService
from app.models import ImportLog
from app.schemas import ImportLogRead

router = APIRouter(prefix="/import", tags=["import"])

_ALLOWED_EXTENSIONS = {"csv", "pdf"}


def _extension(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


@router.post("", response_model=ImportLogRead, status_code=201)
async def import_file(
    file: UploadFile = File(...),
    account_id: int = Form(...),
    user_id: int = Form(...),
    db: Session = Depends(get_db),
):
    ext = _extension(file.filename or "")
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=422, detail=f"Unsupported file type: .{ext}. Use CSV or PDF.")

    raw = await file.read()
    if ext == "csv":
        import io
        rows = parse_csv(io.StringIO(raw.decode("utf-8-sig")))
    else:
        import io
        rows = parse_pdf(io.BytesIO(raw))

    log = ImportService.run(
        db=db,
        rows=rows,
        account_id=account_id,
        user_id=user_id,
        filename=file.filename or "unknown",
        source_type=ext,
    )
    return log


@router.get("/logs", response_model=list[ImportLogRead])
def list_import_logs(
    account_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(ImportLog)
    if account_id is not None:
        q = q.filter(ImportLog.account_id == account_id)
    return q.order_by(ImportLog.imported_at.desc()).all()
```

- [ ] **Step 6: Register the router in main.py**

Edit `backend/app/main.py`. Add import and `include_router` call:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import users, accounts, transactions, assets, fi_goals, settings
from app.routers.import_router import router as import_router

app = FastAPI(title="FI Tracker", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(accounts.router)
app.include_router(transactions.router)
app.include_router(assets.router)
app.include_router(fi_goals.router)
app.include_router(settings.router)
app.include_router(import_router)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 7: Run import router tests**

```
cd backend && .venv\Scripts\python -m pytest tests/test_import_router.py -v
```

Expected: `6 passed`

- [ ] **Step 8: Run full test suite**

```
cd backend && .venv\Scripts\python -m pytest tests/ -q
```

Expected: all tests pass (53+ total).

- [ ] **Step 9: Commit**

```bash
git add backend/app/schemas/import_log.py backend/app/schemas/__init__.py backend/app/routers/import_router.py backend/app/main.py backend/tests/test_import_router.py
git commit -m "feat: add ImportLog schema and /import router (POST upload + GET logs)"
```

---

## Task 5: Wire frontend Import screen to live API

**Files:**
- Modify: `frontend/public/app/app.js` (the Import screen section)

### Background

The frontend Import screen currently has a `handleImport` function that logs to console and shows mock feedback. This task replaces that stub with a real `fetch('POST /import', FormData)` call and renders the server `ImportLogRead` response in the UI.

The frontend uses the `API_BASE` constant already defined in `app.js` as `http://localhost:8000`.

The Import screen HTML (rendered by the `importScreen()` function) contains:
- A file input (`#import-file`) 
- An account selector (`#import-account`)
- A submit button (`#import-btn`)
- A results div (`#import-result`)

The `handleImport` function reads these elements and performs the submission.

- [ ] **Step 1: Read the current import screen code**

Open `frontend/public/app/app.js` and find the `importScreen` function and `handleImport` function. Note the exact element IDs.

Run: `grep -n "importScreen\|handleImport\|import-result\|import-file\|import-btn\|import-account" frontend/public/app/app.js`

This gives you the exact line numbers to edit.

- [ ] **Step 2: Replace handleImport with live API call**

Find the existing `handleImport` (or equivalent) function. Replace its body so it:
1. Reads the selected file and account_id from the DOM
2. Builds a `FormData` with `file`, `account_id`, `user_id=1` (hardcoded for now — single-user MVP)
3. `POST`s to `${API_BASE}/import`
4. On success: renders a summary card in `#import-result`
5. On error: shows the error message in `#import-result`

The replacement body:

```javascript
async function handleImport() {
  const fileInput = document.getElementById('import-file');
  const accountSelect = document.getElementById('import-account');
  const resultDiv = document.getElementById('import-result');

  if (!fileInput || !fileInput.files.length) {
    resultDiv.innerHTML = '<p class="err">Please select a file.</p>';
    return;
  }

  const file = fileInput.files[0];
  const accountId = accountSelect ? accountSelect.value : '1';

  const formData = new FormData();
  formData.append('file', file);
  formData.append('account_id', accountId);
  formData.append('user_id', '1');

  resultDiv.innerHTML = '<p class="muted">Uploading…</p>';

  try {
    const resp = await fetch(`${API_BASE}/import`, { method: 'POST', body: formData });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      resultDiv.innerHTML = `<p class="err">Import failed: ${err.detail}</p>`;
      return;
    }
    const log = await resp.json();
    resultDiv.innerHTML = `
      <div class="import-summary card">
        <h4>Import complete</h4>
        <p><strong>${log.rows_imported}</strong> transactions imported</p>
        <p><strong>${log.rows_skipped}</strong> duplicates skipped</p>
        <p><strong>${log.rows_uncategorized}</strong> need review</p>
        <p class="muted">${log.filename} · ${log.source_type.toUpperCase()}</p>
      </div>`;
  } catch (e) {
    resultDiv.innerHTML = `<p class="err">Network error: ${e.message}</p>`;
  }
}
```

- [ ] **Step 3: Verify frontend builds without errors**

```
npm run build --prefix frontend
```

Expected: build succeeds with no TypeScript/JS errors.

- [ ] **Step 4: Manual smoke test**

Start the backend:
```
cd backend && .venv\Scripts\uvicorn app.main:app --reload
```

Start the frontend (separate terminal):
```
npm run dev --prefix frontend
```

Open `http://localhost:5173`, navigate to the Import screen, select a CSV file with the format:
```
Buchungsdatum;Verwendungszweck;Betrag;Währung
01.05.2026;REWE Supermarkt;-42.80;EUR
```
Click Import. Verify the summary card appears with `1 transactions imported`.

- [ ] **Step 5: Commit**

```bash
git add frontend/public/app/app.js
git commit -m "feat: wire Import screen to POST /import endpoint with ImportLog summary card"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|-------------|------|
| CSV parsing with smart column detection | Task 1 |
| PDF parsing with pdfplumber | Task 2 |
| Category rule application | Task 3 |
| Duplicate detection | Task 3 |
| ImportLog persistence | Task 3 |
| POST /import endpoint | Task 4 |
| GET /import/logs endpoint | Task 4 |
| Frontend Import screen wiring | Task 5 |

### Placeholder scan

No TBDs, no "implement later", no "similar to Task N" references. Every step contains actual code.

### Type consistency

- `ParsedRow` defined in Task 1, used identically in Tasks 2, 3, 4.
- `ImportService.run()` signature defined in Task 3, called identically in Task 4.
- `ImportLogRead` defined in Task 4, returned from router in Task 4.
- `parse_csv` / `parse_pdf` imported from `app.parsers` in Tasks 1, 2, 4 — consistent.
- `API_BASE` variable referenced in Task 5 — already present in `app.js` from Plan 2.
