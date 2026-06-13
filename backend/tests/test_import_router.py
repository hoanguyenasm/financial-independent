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
