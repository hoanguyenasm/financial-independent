import hashlib
import io
import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.parsers import parse_csv, parse_pdf
from app.parsers.csv_parser import decode_csv_bytes
from app.parsers.pdf_parser import _extract_text_lines
from app.services.import_service import ImportService
from app.services.account_router import detect_owner, detect_bank, route_account
from app.services.category_seed import seed_category_rules
from app.models import ImportLog
from app.schemas import ImportLogRead, PathImportResult, TreeImportResult
import io as _io

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
    try:
        if ext == "csv":
            rows = parse_csv(io.StringIO(raw.decode("utf-8-sig")))
        else:
            rows = parse_pdf(io.BytesIO(raw))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to parse file: {exc}") from exc

    file_hash = hashlib.sha256(raw).hexdigest()
    log = ImportService.run(
        db=db,
        rows=rows,
        account_id=account_id,
        user_id=user_id,
        filename=file.filename or "unknown",
        source_type=ext,
        file_hash=file_hash,
    )
    return log


@router.post("/from-path", response_model=PathImportResult, status_code=201)
async def import_from_path(
    path: str = Form(...),
    account_id: int = Form(...),
    user_id: int = Form(...),
    db: Session = Depends(get_db),
):
    path = path.strip()

    # Collect files: single file or recursive directory walk
    if os.path.isfile(path):
        files = [path]
    elif os.path.isdir(path):
        files = []
        for root, _, fnames in os.walk(path):
            for fname in sorted(fnames):
                if _extension(fname) in _ALLOWED_EXTENSIONS:
                    files.append(os.path.join(root, fname))
        if not files:
            raise HTTPException(status_code=422, detail=f"No CSV or PDF files found in: {path}")
    else:
        raise HTTPException(status_code=422, detail=f"Path not found: {path}")

    total_imported = total_skipped = total_uncategorized = 0
    errors: list[str] = []

    for fpath in files:
        ext = _extension(fpath)
        try:
            with open(fpath, "rb") as f:
                raw = f.read()
            file_hash = hashlib.sha256(raw).hexdigest()
            if ext == "csv":
                rows = parse_csv(io.StringIO(raw.decode("utf-8-sig")))
            else:
                rows = parse_pdf(io.BytesIO(raw))
            log = ImportService.run(
                db=db, rows=rows,
                account_id=account_id, user_id=user_id,
                filename=os.path.basename(fpath), source_type=ext,
                file_hash=file_hash,
            )
            total_imported += log.rows_imported
            total_skipped += log.rows_skipped
            total_uncategorized += log.rows_uncategorized
        except Exception as exc:
            errors.append(f"{os.path.basename(fpath)}: {exc}")

    return PathImportResult(
        files_processed=len(files),
        rows_imported=total_imported,
        rows_skipped=total_skipped,
        rows_uncategorized=total_uncategorized,
        errors=errors,
    )


@router.post("/seed-rules")
def seed_rules(db: Session = Depends(get_db)):
    return {"inserted": seed_category_rules(db)}


@router.post("/recategorize")
def recategorize(db: Session = Depends(get_db)):
    return {"updated": ImportService.recategorize_all(db)}


@router.post("/from-tree", response_model=TreeImportResult, status_code=201)
async def import_from_tree(path: str = Form(...), user_id: int = Form(1), db: Session = Depends(get_db)):
    path = path.strip()
    if not os.path.isdir(path):
        raise HTTPException(status_code=422, detail=f"Not a directory: {path}")
    files: list[str] = []
    for root, _, fnames in os.walk(path):
        for fname in sorted(fnames):
            if _extension(fname) in _ALLOWED_EXTENSIONS:
                files.append(os.path.join(root, fname))

    total_imp = total_skip = total_uncat = 0
    summary: list[dict] = []
    errors: list[str] = []
    for fpath in files:
        ext = _extension(fpath)
        fname = os.path.basename(fpath)
        try:
            raw = open(fpath, "rb").read()
            fhash = hashlib.sha256(raw).hexdigest()
            if ext == "csv":
                text = decode_csv_bytes(raw)
                lines = text.splitlines()
                rows = parse_csv(_io.StringIO(text))
            else:
                lines = _extract_text_lines(_io.BytesIO(raw))
                rows = parse_pdf(_io.BytesIO(raw))
            owner = detect_owner(fpath)
            bank = detect_bank(fname, lines)
            account_id = route_account(db, bank, owner, lines)
            if account_id is None:
                summary.append({"file": fname, "bank": bank, "owner": owner, "status": "no_account"})
                continue
            log = ImportService.run(db=db, rows=rows, account_id=account_id, user_id=user_id,
                                    filename=fname, source_type=ext, file_hash=fhash)
            total_imp += log.rows_imported
            total_skip += log.rows_skipped
            total_uncat += log.rows_uncategorized
            summary.append({"file": fname, "bank": bank, "owner": owner, "account_id": account_id,
                            "status": log.status, "imported": log.rows_imported,
                            "skipped": log.rows_skipped, "uncategorized": log.rows_uncategorized})
        except Exception as exc:
            errors.append(f"{fname}: {exc}")
    return TreeImportResult(files_processed=len(files), rows_imported=total_imp,
                            rows_skipped=total_skip, rows_uncategorized=total_uncat,
                            files=summary, errors=errors)


@router.get("/logs", response_model=list[ImportLogRead])
def list_import_logs(
    account_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(ImportLog)
    if account_id is not None:
        q = q.filter(ImportLog.account_id == account_id)
    return q.order_by(ImportLog.imported_at.desc()).all()
