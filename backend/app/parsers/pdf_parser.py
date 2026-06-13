import io
import csv
from typing import BinaryIO
import pdfplumber
from .csv_parser import parse_csv
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
            tables = page.extract_tables() or []
            for table in tables:
                if not table or len(table) < 2:
                    continue
                stream = _table_to_csv_stream(table)
                page_rows = parse_csv(stream, default_currency=default_currency)
                rows.extend(page_rows)
    return rows
