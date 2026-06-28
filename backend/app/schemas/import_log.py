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


class ImportLogReassign(BaseModel):
    account_id: int


class PathImportResult(BaseModel):
    files_processed: int
    rows_imported: int
    rows_skipped: int
    rows_uncategorized: int
    errors: list[str]


class TreeImportResult(BaseModel):
    files_processed: int
    rows_imported: int
    rows_skipped: int
    rows_uncategorized: int
    files: list[dict]
    errors: list[str]
