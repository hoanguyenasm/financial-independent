import io
import os
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


@router.post("/from-path", response_model=ImportLogRead, status_code=201)
async def import_from_path(
    path: str = Form(...),
    account_id: int = Form(...),
    user_id: int = Form(...),
    db: Session = Depends(get_db),
):
    path = path.strip()
    if not os.path.isfile(path):
        raise HTTPException(status_code=422, detail=f"File not found: {path}")
    ext = _extension(path)
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=422, detail=f"Unsupported file type: .{ext}")
    try:
        with open(path, "rb") as f:
            raw = f.read()
        if ext == "csv":
            rows = parse_csv(io.StringIO(raw.decode("utf-8-sig")))
        else:
            rows = parse_pdf(io.BytesIO(raw))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to parse: {exc}") from exc
    log = ImportService.run(
        db=db, rows=rows,
        account_id=account_id, user_id=user_id,
        filename=os.path.basename(path), source_type=ext,
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
