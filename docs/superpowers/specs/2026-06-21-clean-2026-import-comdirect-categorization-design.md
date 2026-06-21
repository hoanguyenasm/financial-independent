# Clean 2026 Import + Comdirect Parser + Categorization — Design

**Date:** 2026-06-21
**Status:** Approved (pending spec review)

## Goal

Produce a trustworthy dashboard, transaction list, and expense categorization for the
two months of real data in `G:\My Drive\12_Budget_2026` (April + Mai 2026). Concretely:

1. Every supported bank statement in the 2026 tree is imported to the **correct account**.
2. Expenses are **categorized** (only genuine unknowns remain "needs review").
3. Re-running an import does not create **duplicate** transactions.
4. The **Comdirect** Finanzreport (a primary checking account) is included.

## Problems being solved (root causes found during investigation)

- **Everything is "needs review":** the DB has **zero** `CategoryRule` rows, and
  `ImportService._categorize` depends entirely on rules → every expense falls through to
  `uncategorized` → `needs_review`.
- **Doubled transactions:** the same statement file is physically copied into multiple
  month folders (e.g. AmEx `24042026_-_23052026.pdf` exists in both `April/Hoa` and
  `Mai/Hoa`). Re-importing the copy doubles rows. There is no file-level import guard.
- **Comdirect not imported:** `Finanzreport*.pdf` returns 0 rows because pdfplumber /
  pdfminer extract no text from these PDFs. They ARE text-based — **pypdfium2**
  (already a dependency) extracts them cleanly with correct umlauts. No OCR needed.
- **One-account path import:** `/import/from-path` forces a single `account_id` for an
  entire recursive folder, so a mixed-bank, two-owner tree is misattributed.

## Scope

In scope: clean re-import of the 2026 tree only; new Comdirect parser; bank+owner
account routing; file-hash double-import guard; seed category rules + recategorize;
dashboard verification for April + Mai 2026.

Out of scope: 2025 data; OCR; FX/multi-currency; UI changes beyond verifying existing
screens; an auto-learning categorizer (seed rules only).

## Components

### 1. PDFium text-extraction fallback (`app/parsers/pdf_parser.py`)
`_extract_text_lines` tries pdfplumber first; if it yields no non-empty lines, fall back
to `pypdfium2`. Existing parsers (TR, Revolut, Scalable, AmEx, ING) keep using
pdfplumber output unchanged — zero regression risk. The fallback unlocks Comdirect (and
is available to any future text-empty statement).

### 2. Comdirect Finanzreport parser (`_parse_comdirect`)
- **Detector** `_looks_like_comdirect`: text contains "comdirect" and "Finanzreport".
- **Format:** multi-line records under the "Umsätze Girokonto" section. Fields per
  record: `Buchungstag` (date, DD.MM.YYYY) → transaction date; `Vorgang` (e.g.
  "Lastschrift / Belastung", "Übertrag", "Gutschrift") + `Auftraggeber/Empfänger` +
  `Buchungstext` → description; amount in the **Ausgang** column = negative, **Eingang**
  column = positive.
- **Approach:** state machine that opens a record on a `Buchungstag` date line,
  accumulates description lines, and closes on the amount line. Ignore the
  "Alter Saldo" / "Neuer Saldo" / "Kontoübersicht" summary lines.
- Returns `ParsedRow(date, description, amount, currency="EUR")`, consistent with the
  other parsers.

### 3. Bank + owner account router (`app/services/account_router.py`)
- **Owner** from the file path: a path segment equal to `Hoa` or `Norah`.
- **Bank** from the existing parser detectors + the new Comdirect detector.
- **Mapping** (bank, owner) → `account_id`, resolved by querying accounts by
  `institution` + owner tag in the name (no hard-coded IDs). For Norah's two Scalable
  accounts (Capital vs Broker), disambiguate by statement content: a statement with
  securities/`Wertpapier`/depot activity → Broker, otherwise Cash. If still ambiguous,
  default to the Cash/Capital account and log a warning.
- Files whose (bank, owner) has no matching account are skipped with a recorded reason.

### 4. File-hash double-import guard (`ImportLog.file_hash`)
- Add nullable `file_hash` column (SHA-256 hex of file bytes) via Alembic migration.
- Before importing a file, if an `ImportLog` with the same `file_hash` and
  `status="done"` exists, skip the entire file (count it as a skipped file, not skipped
  rows). Keeps the existing per-transaction dedup as a second layer.

### 5. Tree import entry point
A new `POST /import/from-tree` (Form: `path`, `user_id` optional) that walks the tree,
and for each file: computes the hash (guard), detects bank+owner, routes to an account,
parses, and runs `ImportService`. Returns a per-file summary
(file, bank, account, imported/skipped/uncategorized, reason-if-skipped). The existing
`/import/from-path` and `/import` endpoints are unchanged.

### 6. Seed category rules + recategorize (direction-aware)

`_categorize` becomes **direction-aware**: positive amounts (credits) are matched against
**income** rules first; negative amounts (debits) against **expense** rules. This resolves
the `Kaufland` collision — a Kaufland credit is salary, a KAUFLAND debit is groceries.

**Household names** (treated as internal transfers, never income): `Duc Hoa Nguyen` (Hoa),
`Bao Ngoc Pham` / `Ngoc Pham` (Norah). A credit whose description contains a household
name → `transfer` (e.g. the 38,000 "Gutschrift Duc Hoa Nguyen" is internal, not income).

**Income categories (match credits only):**
- **salary:** `Ropex` (Hoa), `Kaufland` (Norah, credit direction only)
- **rental:** a credit from a person name **not** in the household list (the tenant
  credits: Yarob Abbas, Valentin Josu, Kadir Dora, ANNA ANGIOLA, …). Implemented as a
  fallback: positive amount, not a household name, not matched by another income rule →
  rental. Specific known tenant names are also seeded as explicit rules.
- **airbnb:** `airbnb`
- **interest:** `Erhaltene Zinsen`, `Zinsen` (also covered by `_infer_type`)
- **dividend:** `Ertrag` (whole word), `Ausschüttung`, `Dividend` (via `_infer_type`)

**Expense categories (match debits only):**
- groceries: KAUFLAND, LIDL, REWE, EDEKA, ALDI, PENNY, NETTO
- dining: Buonissimo, McDonald, Lieferando, restaurant/cafe
- shopping: AMAZON, PAYPAL, Zalando, Pflanzen-Koelle
- subscriptions: Prime, iTunes/APPLE, Gympass, Netflix, Spotify
- health: Kinderwunsch, Aerzte/Arzt, Apotheke
- transport: DB/Bahn, Aral/Shell, fuel
- utilities: Yello Strom, Telekom, Vodafone

- Type-based fallbacks already in `_categorize` cover transfer/investment/fee.
- A one-off recategorize routine re-runs `_categorize` over existing transactions so
  seeded rules take effect without re-import.

### Scalable Cash vs Broker — decision
Keep both Norah accounts separate (Cash = interest/savings bucket, Broker = invested
assets/dividends). Route each statement by content: securities activity
(`Kauf/Verkauf eines Finanzinstruments`, ISIN) → Broker; otherwise → Cash.

## Data flow

```
from-tree(path)
  └─ for each *.pdf/*.csv (sorted):
       hash → seen? skip file
       detect bank + owner → route to account_id (or skip)
       parse (pdfplumber → pdfium fallback) → rows
       ImportService.run(rows, account_id) → per-txn dedup + categorize
  └─ summary per file
```

## Error handling
- Unparseable / zero-row file: recorded in summary with reason, import continues.
- Unknown bank or missing account: file skipped with reason, no crash.
- Duplicate file hash: file skipped, reason "duplicate file".
- A parser exception on one file never aborts the tree import.

## Testing (TDD)
- `_parse_comdirect`: unit tests on representative line sequences (Lastschrift expense,
  Gutschrift income, Übertrag transfer; skip summary lines).
- PDFium fallback: a parse of a Comdirect file yields > 0 rows.
- Account router: (bank, owner) → expected account; Scalable Cash vs Broker; unknown → skip.
- File-hash guard: importing the same bytes twice imports rows once, second is skipped.
- Category rules: a KAUFLAND **debit** → groceries; a Kaufland **credit** → salary
  (direction-aware); `Ropex` credit → salary; tenant-name credit → rental; household-name
  credit (`Bao Ngoc Pham`) → transfer, not rental; recategorize updates existing rows.
- Full suite stays green (currently 82 + new tests).

## Verification (real data)
- Back up `fi_tracker.db`; wipe transactions + import logs (keep accounts).
- Run from-tree on `G:\My Drive\12_Budget_2026`.
- Assert: Comdirect rows present; no doubled rows; majority of expenses categorized;
  dashboard `/analytics/summary` + `/analytics/cashflow-monthly` +
  `/analytics/expense-by-category` sane for Apr+Mai 2026; verify in the running UI.

## Known remaining limitation
- Revolut `consolidated_statement_*.pdf` may still yield 0 rows; the Revolut
  `account-statement_*.pdf` covers the same period, so no data is lost. Confirmed
  during build.
