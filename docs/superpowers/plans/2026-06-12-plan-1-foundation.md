# Financial Independence Tracker — Plan 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the full backend — FastAPI app, all SQLAlchemy models, Alembic migration, Pydantic schemas, and CRUD endpoints for every entity, fully test-covered.

**Architecture:** Python/FastAPI backend, SQLite via SQLAlchemy 2.0 ORM, Alembic for migrations, Pydantic v2 schemas for validation. Test-first with pytest using an in-memory SQLite test DB. No frontend in this plan.

**Tech Stack:** Python 3.12, FastAPI 0.115, SQLAlchemy 2.0, Alembic 1.13, Pydantic v2, pytest 8.3, uvicorn, httpx (test client)

---

## File Map

```
financial-indpendent/
  backend/
    app/
      __init__.py
      main.py              ← FastAPI app, routers, CORS, startup
      config.py            ← Settings (DB path, base currency, CORS origins)
      database.py          ← Engine, session, get_db dependency
      models/
        __init__.py        ← exports all models (needed by Alembic)
        base.py            ← DeclarativeBase
        user.py            ← User model
        account.py         ← Account model
        transaction.py     ← Transaction model
        asset.py           ← Asset model
        fi_goal.py         ← FIGoal model
        category_rule.py   ← CategoryRule model
        fx_rate.py         ← FXRate model
        import_log.py      ← ImportLog model
      schemas/
        __init__.py
        user.py            ← UserCreate, UserRead, UserUpdate
        account.py         ← AccountCreate, AccountRead, AccountUpdate
        transaction.py     ← TransactionCreate, TransactionRead, TransactionUpdate
        asset.py           ← AssetCreate, AssetRead, AssetUpdate
        fi_goal.py         ← FIGoalCreate, FIGoalRead, FIGoalUpdate
        settings.py        ← AppSettingsRead, AppSettingsUpdate
      routers/
        __init__.py
        users.py           ← GET/POST/PATCH/DELETE /users
        accounts.py        ← GET/POST/PATCH/DELETE /accounts
        transactions.py    ← GET/POST/PATCH/DELETE /transactions
        assets.py          ← GET/POST/PATCH/DELETE /assets
        fi_goals.py        ← GET/POST/PATCH/DELETE /fi-goals
        settings.py        ← GET/PATCH /settings
    tests/
      __init__.py
      conftest.py          ← in-memory SQLite engine, db fixture, client fixture
      test_users.py
      test_accounts.py
      test_transactions.py
      test_assets.py
      test_fi_goals.py
      test_settings.py
    requirements.txt
    alembic.ini
    alembic/
      env.py
      versions/
        0001_initial_schema.py
  .gitignore
```

---

## Task 1: Project scaffold and dependencies

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/tests/__init__.py`
- Create: `.gitignore`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p backend/app/models backend/app/schemas backend/app/routers backend/tests
touch backend/app/__init__.py backend/app/models/__init__.py backend/app/schemas/__init__.py backend/app/routers/__init__.py backend/tests/__init__.py
```

- [ ] **Step 2: Create `backend/requirements.txt`**

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
sqlalchemy==2.0.35
alembic==1.13.3
pydantic==2.9.2
pydantic-settings==2.5.2
pdfplumber==0.11.4
httpx==0.27.2
pytest==8.3.3
pytest-asyncio==0.24.0
anyio==4.6.0
```

- [ ] **Step 3: Create `.gitignore`**

```
__pycache__/
*.pyc
*.pyo
.env
*.db
*.sqlite
.venv/
venv/
node_modules/
dist/
.superpowers/
```

- [ ] **Step 4: Create `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="FI Tracker", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 5: Install dependencies**

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
pip install -r requirements.txt
```

- [ ] **Step 6: Verify server starts**

```bash
cd backend
uvicorn app.main:app --reload
```

Expected: `Uvicorn running on http://127.0.0.1:8000`
Visit `http://localhost:8000/health` → `{"status": "ok"}`

- [ ] **Step 7: Commit**

```bash
git add backend/ .gitignore
git commit -m "feat: scaffold backend project structure"
```

---

## Task 2: Config and database connection

**Files:**
- Create: `backend/app/config.py`
- Create: `backend/app/database.py`
- Create: `backend/app/models/base.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_database.py`:

```python
from sqlalchemy import text
from app.database import get_engine

def test_database_connection():
    engine = get_engine()
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1"))
        assert result.scalar() == 1
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend
pytest tests/test_database.py -v
```

Expected: `ImportError: cannot import name 'get_engine'`

- [ ] **Step 3: Create `backend/app/config.py`**

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "sqlite:///./fi_tracker.db"
    base_currency: str = "USD"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    class Config:
        env_file = ".env"

settings = Settings()
```

- [ ] **Step 4: Create `backend/app/database.py`**

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator
from .config import settings

def get_engine(url: str | None = None):
    db_url = url or settings.database_url
    connect_args = {"check_same_thread": False} if db_url.startswith("sqlite") else {}
    return create_engine(db_url, connect_args=connect_args)

engine = get_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 5: Create `backend/app/models/base.py`**

```python
from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pytest tests/test_database.py -v
```

Expected: `PASSED`

- [ ] **Step 7: Commit**

```bash
git add backend/app/config.py backend/app/database.py backend/app/models/base.py backend/tests/test_database.py
git commit -m "feat: add config, database connection, and declarative base"
```

---

## Task 3: All SQLAlchemy models

**Files:**
- Create: `backend/app/models/user.py`
- Create: `backend/app/models/account.py`
- Create: `backend/app/models/transaction.py`
- Create: `backend/app/models/asset.py`
- Create: `backend/app/models/fi_goal.py`
- Create: `backend/app/models/category_rule.py`
- Create: `backend/app/models/fx_rate.py`
- Create: `backend/app/models/import_log.py`
- Modify: `backend/app/models/__init__.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_models.py`:

```python
from sqlalchemy import inspect
from app.database import get_engine
from app.models import Base, User, Account, Transaction, Asset, FIGoal, CategoryRule, FXRate, ImportLog

def test_all_tables_created():
    engine = get_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    assert "users" in tables
    assert "accounts" in tables
    assert "transactions" in tables
    assert "assets" in tables
    assert "fi_goals" in tables
    assert "category_rules" in tables
    assert "fx_rates" in tables
    assert "import_logs" in tables

def test_transaction_has_dual_currency_fields():
    engine = get_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    columns = {c["name"] for c in inspector.get_columns("transactions")}
    assert "amount" in columns
    assert "currency" in columns
    assert "amount_base" in columns
    assert "fx_rate" in columns
    assert "needs_review" in columns
    assert "asset_id" in columns
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_models.py -v
```

Expected: `ImportError: cannot import name 'User' from 'app.models'`

- [ ] **Step 3: Create `backend/app/models/user.py`**

```python
from sqlalchemy import String, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, UTC
from .base import Base

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
```

- [ ] **Step 4: Create `backend/app/models/account.py`**

```python
from sqlalchemy import String, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional
from .base import Base

class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(50))  # checking, savings, credit_card, brokerage, crypto, forex, real_estate, business, other
    currency: Mapped[str] = mapped_column(String(10))
    institution: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
```

- [ ] **Step 5: Create `backend/app/models/transaction.py`**

```python
from sqlalchemy import String, Boolean, Date, DateTime, Numeric, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from datetime import date, datetime, UTC
from typing import Optional
from .base import Base

class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    amount: Mapped[float] = mapped_column(Numeric(18, 4))
    currency: Mapped[str] = mapped_column(String(10))
    amount_base: Mapped[Optional[float]] = mapped_column(Numeric(18, 4), nullable=True)
    fx_rate: Mapped[Optional[float]] = mapped_column(Numeric(18, 8), nullable=True)
    description: Mapped[str] = mapped_column(String(500))
    category: Mapped[str] = mapped_column(String(100), default="uncategorized", index=True)
    type: Mapped[str] = mapped_column(String(50))  # income, expense, transfer, investment_buy, investment_sell, dividend, interest, fee
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    source: Mapped[str] = mapped_column(String(20))  # pdf, csv, manual
    asset_id: Mapped[Optional[int]] = mapped_column(ForeignKey("assets.id"), nullable=True)
    imported_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
```

- [ ] **Step 6: Create `backend/app/models/asset.py`**

```python
from sqlalchemy import String, DateTime, Numeric, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, UTC
from typing import Optional
from .base import Base

class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    symbol_or_name: Mapped[str] = mapped_column(String(200))
    asset_type: Mapped[str] = mapped_column(String(50))  # stock, etf, mutual_fund, crypto, real_estate, bond, other
    quantity: Mapped[float] = mapped_column(Numeric(18, 8), default=1)
    avg_cost: Mapped[Optional[float]] = mapped_column(Numeric(18, 4), nullable=True)
    current_value: Mapped[Optional[float]] = mapped_column(Numeric(18, 4), nullable=True)
    currency: Mapped[str] = mapped_column(String(10))
    expected_monthly_income: Mapped[Optional[float]] = mapped_column(Numeric(18, 4), nullable=True)
    ownership_pct: Mapped[float] = mapped_column(Numeric(5, 2), default=100.0)
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
```

- [ ] **Step 7: Create `backend/app/models/fi_goal.py`**

```python
from sqlalchemy import Date, Numeric, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from datetime import date
from typing import Optional
from .base import Base

class FIGoal(Base):
    __tablename__ = "fi_goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    target_net_worth: Mapped[Optional[float]] = mapped_column(Numeric(18, 2), nullable=True)
    target_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    monthly_expenses_override: Mapped[Optional[float]] = mapped_column(Numeric(18, 2), nullable=True)
    passive_income_target: Mapped[Optional[float]] = mapped_column(Numeric(18, 2), nullable=True)
    safe_withdrawal_rate: Mapped[float] = mapped_column(Numeric(5, 4), default=0.04)
    investment_return_rate: Mapped[float] = mapped_column(Numeric(5, 4), default=0.07)
    inflation_rate: Mapped[float] = mapped_column(Numeric(5, 4), default=0.03)
```

- [ ] **Step 8: Create `backend/app/models/category_rule.py`**

```python
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, UTC
from typing import Optional
from .base import Base

class CategoryRule(Base):
    __tablename__ = "category_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    pattern: Mapped[str] = mapped_column(String(300))
    category: Mapped[str] = mapped_column(String(100))
    account_id: Mapped[Optional[int]] = mapped_column(ForeignKey("accounts.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
```

- [ ] **Step 9: Create `backend/app/models/fx_rate.py`**

```python
from sqlalchemy import String, Date, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from datetime import date
from .base import Base

class FXRate(Base):
    __tablename__ = "fx_rates"
    __table_args__ = (UniqueConstraint("from_currency", "to_currency", "date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    from_currency: Mapped[str] = mapped_column(String(10), index=True)
    to_currency: Mapped[str] = mapped_column(String(10), index=True)
    rate: Mapped[float] = mapped_column(Numeric(18, 8))
    date: Mapped[date] = mapped_column(Date, index=True)
```

- [ ] **Step 10: Create `backend/app/models/import_log.py`**

```python
from sqlalchemy import String, Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, UTC
from .base import Base

class ImportLog(Base):
    __tablename__ = "import_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    filename: Mapped[str] = mapped_column(String(300))
    source_type: Mapped[str] = mapped_column(String(10))  # pdf, csv
    status: Mapped[str] = mapped_column(String(20))  # success, partial, failed
    rows_imported: Mapped[int] = mapped_column(Integer, default=0)
    rows_skipped: Mapped[int] = mapped_column(Integer, default=0)
    rows_uncategorized: Mapped[int] = mapped_column(Integer, default=0)
    imported_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
```

- [ ] **Step 11: Update `backend/app/models/__init__.py`**

```python
from .base import Base
from .user import User
from .account import Account
from .transaction import Transaction
from .asset import Asset
from .fi_goal import FIGoal
from .category_rule import CategoryRule
from .fx_rate import FXRate
from .import_log import ImportLog

__all__ = ["Base", "User", "Account", "Transaction", "Asset", "FIGoal", "CategoryRule", "FXRate", "ImportLog"]
```

- [ ] **Step 12: Run tests to verify they pass**

```bash
pytest tests/test_models.py -v
```

Expected: both tests `PASSED`

- [ ] **Step 13: Commit**

```bash
git add backend/app/models/
git commit -m "feat: add all SQLAlchemy models"
```

---

## Task 4: Alembic migration

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/versions/0001_initial_schema.py`

- [ ] **Step 1: Initialize Alembic**

```bash
cd backend
alembic init alembic
```

- [ ] **Step 2: Update `backend/alembic.ini` — set sqlalchemy.url**

Find line `sqlalchemy.url = driver://user:pass@localhost/dbname` and replace with:

```ini
sqlalchemy.url = sqlite:///./fi_tracker.db
```

- [ ] **Step 3: Update `backend/alembic/env.py`**

Replace the full file content:

```python
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
from app.models import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    connectable = engine_from_config(config.get_section(config.config_ini_section, {}), prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 4: Generate initial migration**

```bash
cd backend
alembic revision --autogenerate -m "initial schema"
```

Expected: creates `alembic/versions/xxxx_initial_schema.py`

- [ ] **Step 5: Run migration**

```bash
alembic upgrade head
```

Expected: `Running upgrade  -> xxxx, initial schema`
Check `fi_tracker.db` exists in `backend/`.

- [ ] **Step 6: Write test to verify migration creates all tables**

Add to `backend/tests/test_models.py`:

```python
def test_alembic_migration_tables(tmp_path):
    import subprocess, os
    db_path = tmp_path / "test_migrate.db"
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{db_path}"}
    result = subprocess.run(
        ["alembic", "upgrade", "head"],
        cwd=str(Path(__file__).parent.parent),
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
```

Add `from pathlib import Path` at the top of `test_models.py`.

- [ ] **Step 7: Run test**

```bash
pytest tests/test_models.py::test_alembic_migration_tables -v
```

Expected: `PASSED`

- [ ] **Step 8: Commit**

```bash
git add backend/alembic.ini backend/alembic/
git commit -m "feat: add Alembic initial migration for all tables"
```

---

## Task 5: Test fixtures (conftest)

**Files:**
- Create: `backend/tests/conftest.py`

- [ ] **Step 1: Create `backend/tests/conftest.py`**

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database import get_db
from app.models import Base

TEST_DB_URL = "sqlite:///:memory:"

@pytest.fixture(scope="function")
def db():
    engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

- [ ] **Step 2: Verify conftest loads without error**

```bash
pytest --collect-only 2>&1 | head -20
```

Expected: no import errors

- [ ] **Step 3: Commit**

```bash
git add backend/tests/conftest.py
git commit -m "feat: add pytest fixtures with in-memory SQLite"
```

---

## Task 6: Pydantic schemas

**Files:**
- Create: `backend/app/schemas/user.py`
- Create: `backend/app/schemas/account.py`
- Create: `backend/app/schemas/transaction.py`
- Create: `backend/app/schemas/asset.py`
- Create: `backend/app/schemas/fi_goal.py`
- Create: `backend/app/schemas/settings.py`
- Modify: `backend/app/schemas/__init__.py`

- [ ] **Step 1: Create `backend/app/schemas/user.py`**

```python
from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional

class UserCreate(BaseModel):
    name: str
    email: str

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None

class UserRead(BaseModel):
    id: int
    name: str
    email: str
    created_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Create `backend/app/schemas/account.py`**

```python
from pydantic import BaseModel
from typing import Optional

ACCOUNT_TYPES = {"checking", "savings", "credit_card", "brokerage", "crypto", "forex", "real_estate", "business", "other"}

class AccountCreate(BaseModel):
    owner_user_id: Optional[int] = None
    name: str
    type: str
    currency: str
    institution: Optional[str] = None
    is_active: bool = True

class AccountUpdate(BaseModel):
    owner_user_id: Optional[int] = None
    name: Optional[str] = None
    type: Optional[str] = None
    currency: Optional[str] = None
    institution: Optional[str] = None
    is_active: Optional[bool] = None

class AccountRead(BaseModel):
    id: int
    owner_user_id: Optional[int]
    name: str
    type: str
    currency: str
    institution: Optional[str]
    is_active: bool

    model_config = {"from_attributes": True}
```

- [ ] **Step 3: Create `backend/app/schemas/transaction.py`**

```python
from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional

TRANSACTION_TYPES = {"income", "expense", "transfer", "investment_buy", "investment_sell", "dividend", "interest", "fee"}
SOURCES = {"pdf", "csv", "manual"}

class TransactionCreate(BaseModel):
    account_id: int
    user_id: int
    date: date
    amount: float
    currency: str
    amount_base: Optional[float] = None
    fx_rate: Optional[float] = None
    description: str
    category: str = "uncategorized"
    type: str
    needs_review: bool = False
    source: str = "manual"
    asset_id: Optional[int] = None

class TransactionUpdate(BaseModel):
    category: Optional[str] = None
    needs_review: Optional[bool] = None
    type: Optional[str] = None
    asset_id: Optional[int] = None
    amount_base: Optional[float] = None
    fx_rate: Optional[float] = None

class TransactionRead(BaseModel):
    id: int
    account_id: int
    user_id: int
    date: date
    amount: float
    currency: str
    amount_base: Optional[float]
    fx_rate: Optional[float]
    description: str
    category: str
    type: str
    needs_review: bool
    source: str
    asset_id: Optional[int]
    imported_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 4: Create `backend/app/schemas/asset.py`**

```python
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

ASSET_TYPES = {"stock", "etf", "mutual_fund", "crypto", "real_estate", "bond", "other"}

class AssetCreate(BaseModel):
    account_id: int
    symbol_or_name: str
    asset_type: str
    quantity: float = 1.0
    avg_cost: Optional[float] = None
    current_value: Optional[float] = None
    currency: str
    expected_monthly_income: Optional[float] = None
    ownership_pct: float = 100.0

class AssetUpdate(BaseModel):
    symbol_or_name: Optional[str] = None
    quantity: Optional[float] = None
    avg_cost: Optional[float] = None
    current_value: Optional[float] = None
    expected_monthly_income: Optional[float] = None
    ownership_pct: Optional[float] = None

class AssetRead(BaseModel):
    id: int
    account_id: int
    symbol_or_name: str
    asset_type: str
    quantity: float
    avg_cost: Optional[float]
    current_value: Optional[float]
    currency: str
    expected_monthly_income: Optional[float]
    ownership_pct: float
    last_updated: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 5: Create `backend/app/schemas/fi_goal.py`**

```python
from pydantic import BaseModel
from datetime import date
from typing import Optional

class FIGoalCreate(BaseModel):
    user_id: int
    target_net_worth: Optional[float] = None
    target_date: Optional[date] = None
    monthly_expenses_override: Optional[float] = None
    passive_income_target: Optional[float] = None
    safe_withdrawal_rate: float = 0.04
    investment_return_rate: float = 0.07
    inflation_rate: float = 0.03

class FIGoalUpdate(BaseModel):
    target_net_worth: Optional[float] = None
    target_date: Optional[date] = None
    monthly_expenses_override: Optional[float] = None
    passive_income_target: Optional[float] = None
    safe_withdrawal_rate: Optional[float] = None
    investment_return_rate: Optional[float] = None
    inflation_rate: Optional[float] = None

class FIGoalRead(BaseModel):
    id: int
    user_id: int
    target_net_worth: Optional[float]
    target_date: Optional[date]
    monthly_expenses_override: Optional[float]
    passive_income_target: Optional[float]
    safe_withdrawal_rate: float
    investment_return_rate: float
    inflation_rate: float

    model_config = {"from_attributes": True}
```

- [ ] **Step 6: Create `backend/app/schemas/settings.py`**

```python
from pydantic import BaseModel

class AppSettingsRead(BaseModel):
    base_currency: str

class AppSettingsUpdate(BaseModel):
    base_currency: str
```

- [ ] **Step 7: Update `backend/app/schemas/__init__.py`**

```python
from .user import UserCreate, UserRead, UserUpdate
from .account import AccountCreate, AccountRead, AccountUpdate
from .transaction import TransactionCreate, TransactionRead, TransactionUpdate
from .asset import AssetCreate, AssetRead, AssetUpdate
from .fi_goal import FIGoalCreate, FIGoalRead, FIGoalUpdate
from .settings import AppSettingsRead, AppSettingsUpdate
```

- [ ] **Step 8: Write schema validation test**

Create `backend/tests/test_schemas.py`:

```python
from datetime import date
from app.schemas import TransactionCreate, AssetCreate, FIGoalCreate

def test_transaction_schema_defaults():
    t = TransactionCreate(
        account_id=1, user_id=1, date=date.today(),
        amount=100.0, currency="USD", description="Coffee",
        type="expense"
    )
    assert t.category == "uncategorized"
    assert t.needs_review == False
    assert t.source == "manual"

def test_asset_schema_defaults():
    a = AssetCreate(account_id=1, symbol_or_name="AAPL", asset_type="stock", currency="USD")
    assert a.quantity == 1.0
    assert a.ownership_pct == 100.0

def test_fi_goal_schema_defaults():
    g = FIGoalCreate(user_id=1)
    assert g.safe_withdrawal_rate == 0.04
    assert g.investment_return_rate == 0.07
    assert g.inflation_rate == 0.03
```

- [ ] **Step 9: Run schema tests**

```bash
pytest tests/test_schemas.py -v
```

Expected: all `PASSED`

- [ ] **Step 10: Commit**

```bash
git add backend/app/schemas/ backend/tests/test_schemas.py
git commit -m "feat: add Pydantic v2 schemas for all entities"
```

---

## Task 7: Users router

**Files:**
- Create: `backend/app/routers/users.py`
- Create: `backend/tests/test_users.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_users.py`:

```python
def test_create_user(client):
    response = client.post("/users", json={"name": "Alice", "email": "alice@example.com"})
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Alice"
    assert data["email"] == "alice@example.com"
    assert "id" in data

def test_create_user_duplicate_email(client):
    client.post("/users", json={"name": "Alice", "email": "alice@example.com"})
    response = client.post("/users", json={"name": "Alice2", "email": "alice@example.com"})
    assert response.status_code == 409

def test_list_users(client):
    client.post("/users", json={"name": "Alice", "email": "alice@example.com"})
    client.post("/users", json={"name": "Bob", "email": "bob@example.com"})
    response = client.get("/users")
    assert response.status_code == 200
    assert len(response.json()) == 2

def test_get_user(client):
    created = client.post("/users", json={"name": "Alice", "email": "alice@example.com"}).json()
    response = client.get(f"/users/{created['id']}")
    assert response.status_code == 200
    assert response.json()["name"] == "Alice"

def test_get_user_not_found(client):
    response = client.get("/users/9999")
    assert response.status_code == 404

def test_update_user(client):
    created = client.post("/users", json={"name": "Alice", "email": "alice@example.com"}).json()
    response = client.patch(f"/users/{created['id']}", json={"name": "Alice Updated"})
    assert response.status_code == 200
    assert response.json()["name"] == "Alice Updated"

def test_delete_user(client):
    created = client.post("/users", json={"name": "Alice", "email": "alice@example.com"}).json()
    response = client.delete(f"/users/{created['id']}")
    assert response.status_code == 204
    assert client.get(f"/users/{created['id']}").status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_users.py -v
```

Expected: `404 Not Found` (route doesn't exist yet)

- [ ] **Step 3: Create `backend/app/routers/users.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.database import get_db
from app.models import User
from app.schemas import UserCreate, UserRead, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])

@router.post("", response_model=UserRead, status_code=201)
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    user = User(**payload.model_dump())
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered")
    return user

@router.get("", response_model=list[UserRead])
def list_users(db: Session = Depends(get_db)):
    return db.query(User).all()

@router.get("/{user_id}", response_model=UserRead)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.patch("/{user_id}", response_model=UserRead)
def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user

@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
```

- [ ] **Step 4: Register router in `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import users

app = FastAPI(title="FI Tracker", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)

@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pytest tests/test_users.py -v
```

Expected: all 7 tests `PASSED`

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/users.py backend/app/main.py backend/tests/test_users.py
git commit -m "feat: add users CRUD endpoints"
```

---

## Task 8: Accounts router

**Files:**
- Create: `backend/app/routers/accounts.py`
- Create: `backend/tests/test_accounts.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_accounts.py`:

```python
def _make_user(client):
    return client.post("/users", json={"name": "Alice", "email": "alice@example.com"}).json()

def test_create_account(client):
    user = _make_user(client)
    response = client.post("/accounts", json={
        "owner_user_id": user["id"], "name": "Vietcombank Savings",
        "type": "savings", "currency": "VND", "institution": "Vietcombank"
    })
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Vietcombank Savings"
    assert data["type"] == "savings"
    assert data["is_active"] == True

def test_list_accounts(client):
    user = _make_user(client)
    client.post("/accounts", json={"owner_user_id": user["id"], "name": "A1", "type": "checking", "currency": "USD"})
    client.post("/accounts", json={"owner_user_id": user["id"], "name": "A2", "type": "savings", "currency": "USD"})
    response = client.get("/accounts")
    assert response.status_code == 200
    assert len(response.json()) == 2

def test_get_account(client):
    user = _make_user(client)
    created = client.post("/accounts", json={"name": "Cash", "type": "checking", "currency": "USD"}).json()
    response = client.get(f"/accounts/{created['id']}")
    assert response.status_code == 200

def test_update_account(client):
    created = client.post("/accounts", json={"name": "Old Name", "type": "checking", "currency": "USD"}).json()
    response = client.patch(f"/accounts/{created['id']}", json={"name": "New Name", "is_active": False})
    assert response.status_code == 200
    assert response.json()["name"] == "New Name"
    assert response.json()["is_active"] == False

def test_delete_account(client):
    created = client.post("/accounts", json={"name": "To Delete", "type": "checking", "currency": "USD"}).json()
    response = client.delete(f"/accounts/{created['id']}")
    assert response.status_code == 204
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_accounts.py -v
```

Expected: `404 Not Found`

- [ ] **Step 3: Create `backend/app/routers/accounts.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Account
from app.schemas import AccountCreate, AccountRead, AccountUpdate

router = APIRouter(prefix="/accounts", tags=["accounts"])

@router.post("", response_model=AccountRead, status_code=201)
def create_account(payload: AccountCreate, db: Session = Depends(get_db)):
    account = Account(**payload.model_dump())
    db.add(account)
    db.commit()
    db.refresh(account)
    return account

@router.get("", response_model=list[AccountRead])
def list_accounts(active_only: bool = False, db: Session = Depends(get_db)):
    q = db.query(Account)
    if active_only:
        q = q.filter(Account.is_active == True)
    return q.all()

@router.get("/{account_id}", response_model=AccountRead)
def get_account(account_id: int, db: Session = Depends(get_db)):
    account = db.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account

@router.patch("/{account_id}", response_model=AccountRead)
def update_account(account_id: int, payload: AccountUpdate, db: Session = Depends(get_db)):
    account = db.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(account, field, value)
    db.commit()
    db.refresh(account)
    return account

@router.delete("/{account_id}", status_code=204)
def delete_account(account_id: int, db: Session = Depends(get_db)):
    account = db.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    db.delete(account)
    db.commit()
```

- [ ] **Step 4: Register router in `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import users, accounts

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

@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 5: Run tests**

```bash
pytest tests/test_accounts.py -v
```

Expected: all 5 tests `PASSED`

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/accounts.py backend/app/main.py backend/tests/test_accounts.py
git commit -m "feat: add accounts CRUD endpoints"
```

---

## Task 9: Transactions router

**Files:**
- Create: `backend/app/routers/transactions.py`
- Create: `backend/tests/test_transactions.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_transactions.py`:

```python
from datetime import date

def _setup(client):
    user = client.post("/users", json={"name": "Alice", "email": "alice@example.com"}).json()
    account = client.post("/accounts", json={"name": "Bank", "type": "checking", "currency": "USD"}).json()
    return user["id"], account["id"]

def test_create_transaction(client):
    user_id, account_id = _setup(client)
    response = client.post("/transactions", json={
        "account_id": account_id, "user_id": user_id,
        "date": str(date.today()), "amount": 50.0, "currency": "USD",
        "description": "Grab ride", "type": "expense"
    })
    assert response.status_code == 201
    data = response.json()
    assert data["category"] == "uncategorized"
    assert data["needs_review"] == False
    assert data["source"] == "manual"

def test_list_transactions(client):
    user_id, account_id = _setup(client)
    for i in range(3):
        client.post("/transactions", json={
            "account_id": account_id, "user_id": user_id,
            "date": str(date.today()), "amount": float(i + 1),
            "currency": "USD", "description": f"tx{i}", "type": "expense"
        })
    response = client.get("/transactions")
    assert response.status_code == 200
    assert len(response.json()) == 3

def test_filter_transactions_needs_review(client):
    user_id, account_id = _setup(client)
    client.post("/transactions", json={
        "account_id": account_id, "user_id": user_id,
        "date": str(date.today()), "amount": 10.0,
        "currency": "USD", "description": "Unknown", "type": "expense",
        "needs_review": True
    })
    client.post("/transactions", json={
        "account_id": account_id, "user_id": user_id,
        "date": str(date.today()), "amount": 5.0,
        "currency": "USD", "description": "Coffee", "type": "expense",
        "category": "food"
    })
    response = client.get("/transactions?needs_review=true")
    assert response.status_code == 200
    assert len(response.json()) == 1

def test_update_transaction_category(client):
    user_id, account_id = _setup(client)
    created = client.post("/transactions", json={
        "account_id": account_id, "user_id": user_id,
        "date": str(date.today()), "amount": 10.0,
        "currency": "USD", "description": "Grab", "type": "expense"
    }).json()
    response = client.patch(f"/transactions/{created['id']}", json={"category": "transport", "needs_review": False})
    assert response.status_code == 200
    assert response.json()["category"] == "transport"
    assert response.json()["needs_review"] == False

def test_get_needs_review_count(client):
    user_id, account_id = _setup(client)
    for _ in range(3):
        client.post("/transactions", json={
            "account_id": account_id, "user_id": user_id,
            "date": str(date.today()), "amount": 1.0,
            "currency": "USD", "description": "?", "type": "expense",
            "needs_review": True
        })
    response = client.get("/transactions/needs-review-count")
    assert response.status_code == 200
    assert response.json()["count"] == 3
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_transactions.py -v
```

Expected: `404 Not Found`

- [ ] **Step 3: Create `backend/app/routers/transactions.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.models import Transaction
from app.schemas import TransactionCreate, TransactionRead, TransactionUpdate

router = APIRouter(prefix="/transactions", tags=["transactions"])

@router.get("/needs-review-count")
def needs_review_count(db: Session = Depends(get_db)):
    count = db.query(Transaction).filter(Transaction.needs_review == True).count()
    return {"count": count}

@router.post("", response_model=TransactionRead, status_code=201)
def create_transaction(payload: TransactionCreate, db: Session = Depends(get_db)):
    tx = Transaction(**payload.model_dump())
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx

@router.get("", response_model=list[TransactionRead])
def list_transactions(
    account_id: Optional[int] = None,
    user_id: Optional[int] = None,
    category: Optional[str] = None,
    needs_review: Optional[bool] = None,
    skip: int = 0,
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(Transaction)
    if account_id:
        q = q.filter(Transaction.account_id == account_id)
    if user_id:
        q = q.filter(Transaction.user_id == user_id)
    if category:
        q = q.filter(Transaction.category == category)
    if needs_review is not None:
        q = q.filter(Transaction.needs_review == needs_review)
    return q.order_by(Transaction.date.desc()).offset(skip).limit(limit).all()

@router.get("/{tx_id}", response_model=TransactionRead)
def get_transaction(tx_id: int, db: Session = Depends(get_db)):
    tx = db.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return tx

@router.patch("/{tx_id}", response_model=TransactionRead)
def update_transaction(tx_id: int, payload: TransactionUpdate, db: Session = Depends(get_db)):
    tx = db.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(tx, field, value)
    db.commit()
    db.refresh(tx)
    return tx

@router.delete("/{tx_id}", status_code=204)
def delete_transaction(tx_id: int, db: Session = Depends(get_db)):
    tx = db.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(tx)
    db.commit()
```

- [ ] **Step 4: Register router in `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import users, accounts, transactions

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

@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 5: Run tests**

```bash
pytest tests/test_transactions.py -v
```

Expected: all 5 tests `PASSED`

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/transactions.py backend/app/main.py backend/tests/test_transactions.py
git commit -m "feat: add transactions CRUD endpoints with needs-review filter"
```

---

## Task 10: Assets router

**Files:**
- Create: `backend/app/routers/assets.py`
- Create: `backend/tests/test_assets.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_assets.py`:

```python
def _setup(client):
    account = client.post("/accounts", json={"name": "Brokerage", "type": "brokerage", "currency": "USD"}).json()
    return account["id"]

def test_create_asset(client):
    account_id = _setup(client)
    response = client.post("/assets", json={
        "account_id": account_id, "symbol_or_name": "AAPL",
        "asset_type": "stock", "quantity": 10.0,
        "avg_cost": 150.0, "current_value": 1800.0, "currency": "USD"
    })
    assert response.status_code == 201
    data = response.json()
    assert data["symbol_or_name"] == "AAPL"
    assert data["ownership_pct"] == 100.0

def test_create_real_estate_asset(client):
    account_id = _setup(client)
    response = client.post("/assets", json={
        "account_id": account_id, "symbol_or_name": "District 2 Apartment",
        "asset_type": "real_estate", "currency": "VND",
        "current_value": 5000000000.0,
        "expected_monthly_income": 15000000.0,
        "ownership_pct": 50.0
    })
    assert response.status_code == 201
    data = response.json()
    assert data["expected_monthly_income"] == 15000000.0
    assert data["ownership_pct"] == 50.0

def test_list_assets_by_account(client):
    account_id = _setup(client)
    client.post("/assets", json={"account_id": account_id, "symbol_or_name": "AAPL", "asset_type": "stock", "currency": "USD"})
    client.post("/assets", json={"account_id": account_id, "symbol_or_name": "MSFT", "asset_type": "stock", "currency": "USD"})
    response = client.get(f"/assets?account_id={account_id}")
    assert response.status_code == 200
    assert len(response.json()) == 2

def test_update_asset_value(client):
    account_id = _setup(client)
    created = client.post("/assets", json={
        "account_id": account_id, "symbol_or_name": "BTC",
        "asset_type": "crypto", "current_value": 30000.0, "currency": "USD"
    }).json()
    response = client.patch(f"/assets/{created['id']}", json={"current_value": 35000.0})
    assert response.status_code == 200
    assert response.json()["current_value"] == 35000.0
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_assets.py -v
```

Expected: `404 Not Found`

- [ ] **Step 3: Create `backend/app/routers/assets.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, UTC
from typing import Optional
from app.database import get_db
from app.models import Asset
from app.schemas import AssetCreate, AssetRead, AssetUpdate

router = APIRouter(prefix="/assets", tags=["assets"])

@router.post("", response_model=AssetRead, status_code=201)
def create_asset(payload: AssetCreate, db: Session = Depends(get_db)):
    asset = Asset(**payload.model_dump())
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset

@router.get("", response_model=list[AssetRead])
def list_assets(account_id: Optional[int] = None, asset_type: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Asset)
    if account_id:
        q = q.filter(Asset.account_id == account_id)
    if asset_type:
        q = q.filter(Asset.asset_type == asset_type)
    return q.all()

@router.get("/{asset_id}", response_model=AssetRead)
def get_asset(asset_id: int, db: Session = Depends(get_db)):
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset

@router.patch("/{asset_id}", response_model=AssetRead)
def update_asset(asset_id: int, payload: AssetUpdate, db: Session = Depends(get_db)):
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(asset, field, value)
    asset.last_updated = datetime.now(UTC)
    db.commit()
    db.refresh(asset)
    return asset

@router.delete("/{asset_id}", status_code=204)
def delete_asset(asset_id: int, db: Session = Depends(get_db)):
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    db.delete(asset)
    db.commit()
```

- [ ] **Step 4: Register router in `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import users, accounts, transactions, assets

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

@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 5: Run tests**

```bash
pytest tests/test_assets.py -v
```

Expected: all 4 tests `PASSED`

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/assets.py backend/app/main.py backend/tests/test_assets.py
git commit -m "feat: add assets CRUD endpoints"
```

---

## Task 11: FI Goals router

**Files:**
- Create: `backend/app/routers/fi_goals.py`
- Create: `backend/tests/test_fi_goals.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_fi_goals.py`:

```python
def _make_user(client, email="alice@example.com"):
    return client.post("/users", json={"name": "Alice", "email": email}).json()

def test_create_fi_goal(client):
    user = _make_user(client)
    response = client.post("/fi-goals", json={
        "user_id": user["id"],
        "target_net_worth": 500000.0,
        "target_date": "2030-01-01",
        "safe_withdrawal_rate": 0.04,
        "investment_return_rate": 0.07,
        "inflation_rate": 0.03
    })
    assert response.status_code == 201
    data = response.json()
    assert data["target_net_worth"] == 500000.0
    assert data["safe_withdrawal_rate"] == 0.04

def test_one_goal_per_user(client):
    user = _make_user(client)
    client.post("/fi-goals", json={"user_id": user["id"]})
    response = client.post("/fi-goals", json={"user_id": user["id"]})
    assert response.status_code == 409

def test_get_fi_goal_by_user(client):
    user = _make_user(client)
    client.post("/fi-goals", json={"user_id": user["id"], "target_net_worth": 1000000.0})
    response = client.get(f"/fi-goals/user/{user['id']}")
    assert response.status_code == 200
    assert response.json()["target_net_worth"] == 1000000.0

def test_update_fi_goal(client):
    user = _make_user(client)
    created = client.post("/fi-goals", json={"user_id": user["id"]}).json()
    response = client.patch(f"/fi-goals/{created['id']}", json={"inflation_rate": 0.035})
    assert response.status_code == 200
    assert response.json()["inflation_rate"] == 0.035
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_fi_goals.py -v
```

Expected: `404 Not Found`

- [ ] **Step 3: Create `backend/app/routers/fi_goals.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.database import get_db
from app.models import FIGoal
from app.schemas import FIGoalCreate, FIGoalRead, FIGoalUpdate

router = APIRouter(prefix="/fi-goals", tags=["fi-goals"])

@router.post("", response_model=FIGoalRead, status_code=201)
def create_fi_goal(payload: FIGoalCreate, db: Session = Depends(get_db)):
    goal = FIGoal(**payload.model_dump())
    db.add(goal)
    try:
        db.commit()
        db.refresh(goal)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="User already has an FI goal")
    return goal

@router.get("/user/{user_id}", response_model=FIGoalRead)
def get_fi_goal_by_user(user_id: int, db: Session = Depends(get_db)):
    goal = db.query(FIGoal).filter(FIGoal.user_id == user_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="FI goal not found for this user")
    return goal

@router.get("/{goal_id}", response_model=FIGoalRead)
def get_fi_goal(goal_id: int, db: Session = Depends(get_db)):
    goal = db.get(FIGoal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="FI goal not found")
    return goal

@router.patch("/{goal_id}", response_model=FIGoalRead)
def update_fi_goal(goal_id: int, payload: FIGoalUpdate, db: Session = Depends(get_db)):
    goal = db.get(FIGoal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="FI goal not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(goal, field, value)
    db.commit()
    db.refresh(goal)
    return goal

@router.delete("/{goal_id}", status_code=204)
def delete_fi_goal(goal_id: int, db: Session = Depends(get_db)):
    goal = db.get(FIGoal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="FI goal not found")
    db.delete(goal)
    db.commit()
```

- [ ] **Step 4: Register fi_goals router in `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import users, accounts, transactions, assets, fi_goals

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

@app.get("/health")
def health():
    return {"status": "ok"}
```

Note: `settings` router is added in Task 12 after `settings.py` is created.

- [ ] **Step 5: Run tests**

```bash
pytest tests/test_fi_goals.py -v
```

Expected: all 4 tests `PASSED`

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/fi_goals.py backend/app/main.py backend/tests/test_fi_goals.py
git commit -m "feat: add FI goals CRUD endpoints"
```

---

## Task 12: App settings endpoint

**Files:**
- Create: `backend/app/routers/settings.py`
- Create: `backend/tests/test_settings.py`

The app has one household-wide base currency stored in `config.py` but overridable at runtime via an in-memory settings object. Settings do not persist across restarts unless an `.env` file is set.

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_settings.py`:

```python
def test_get_settings(client):
    response = client.get("/settings")
    assert response.status_code == 200
    assert "base_currency" in response.json()

def test_update_base_currency(client):
    response = client.patch("/settings", json={"base_currency": "VND"})
    assert response.status_code == 200
    assert response.json()["base_currency"] == "VND"
    # verify it stuck
    assert client.get("/settings").json()["base_currency"] == "VND"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_settings.py -v
```

Expected: `404 Not Found`

- [ ] **Step 3: Create `backend/app/routers/settings.py`**

```python
from fastapi import APIRouter
from app.config import settings
from app.schemas import AppSettingsRead, AppSettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])

@router.get("", response_model=AppSettingsRead)
def get_settings():
    return AppSettingsRead(base_currency=settings.base_currency)

@router.patch("", response_model=AppSettingsRead)
def update_settings(payload: AppSettingsUpdate):
    settings.base_currency = payload.base_currency
    return AppSettingsRead(base_currency=settings.base_currency)
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_settings.py -v
```

Expected: both tests `PASSED`

- [ ] **Step 5: Run full test suite**

```bash
pytest tests/ -v
```

Expected: all tests `PASSED`, 0 failures

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/settings.py backend/tests/test_settings.py
git commit -m "feat: add app settings endpoint for base currency"
```

---

## Task 13: Final verification

- [ ] **Step 1: Run full test suite**

```bash
cd backend
pytest tests/ -v --tb=short
```

Expected: all tests `PASSED`

- [ ] **Step 2: Start the server and verify interactive docs**

```bash
uvicorn app.main:app --reload
```

Open `http://localhost:8000/docs` — confirm all routers appear:
- `/users` (5 endpoints)
- `/accounts` (5 endpoints)
- `/transactions` (6 endpoints including `/needs-review-count`)
- `/assets` (5 endpoints)
- `/fi-goals` (6 endpoints)
- `/settings` (2 endpoints)

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete Plan 1 — backend foundation with all CRUD endpoints"
```
