import io
import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.parsers import parse_csv, parse_pdf
from app.services.import_service import ImportService
from app.models import ImportLog
from app.schemas import ImportLogRead, PathImportResult

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

    log = ImportService.run(
        db=db,
        rows=rows,
        account_id=account_id,
        user_id=user_id,
        filename=file.filename or "unknown",
        source_type=ext,
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
            if ext == "csv":
                rows = parse_csv(io.StringIO(raw.decode("utf-8-sig")))
            else:
                rows = parse_pdf(io.BytesIO(raw))
            log = ImportService.run(
                db=db, rows=rows,
                account_id=account_id, user_id=user_id,
                filename=os.path.basename(fpath), source_type=ext,
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


@router.get("/logs", response_model=list[ImportLogRead])
def list_import_logs(
    account_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(ImportLog)
    if account_id is not None:
        q = q.filter(ImportLog.account_id == account_id)
    return q.order_by(ImportLog.imported_at.desc()).all()
