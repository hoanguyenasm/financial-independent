import io
import os
import tempfile
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
    # Same file bytes → file-hash guard fires; entire file is skipped
    assert body["rows_imported"] == 0
    assert body["status"] == "duplicate_file"


def test_import_unsupported_format(client):
    response = client.post(
        "/import",
        data={"account_id": "1", "user_id": "1"},
        files={"file": ("data.xlsx", io.BytesIO(b"fake"), "application/vnd.ms-excel")},
    )
    assert response.status_code == 422


def test_import_partial_overlap_different_files(client):
    """Per-transaction dedup fires when two DIFFERENT files share some rows.

    File A has 3 rows; file B has different bytes (different header + 2 overlapping rows).
    The file-hash guard must NOT fire (different SHA-256); overlapping rows are skipped
    by the per-transaction duplicate check instead.
    """
    # File A – 3 data rows, header uses semicolons
    csv_a = (
        "Buchungsdatum;Verwendungszweck;Betrag;Währung\n"
        "01.05.2026;REWE Supermarkt;-42.80;EUR\n"
        "05.05.2026;Gehalt Robert Bosch;7293.00;EUR\n"
        "10.05.2026;Netflix;-12.99;EUR\n"
    )
    # File B – different bytes: different filename + an extra row + same 2 rows as A
    csv_b = (
        "Buchungsdatum;Verwendungszweck;Betrag;Waehrung\n"  # header differs → different SHA-256
        "01.05.2026;REWE Supermarkt;-42.80;EUR\n"           # duplicate of A row 1
        "05.05.2026;Gehalt Robert Bosch;7293.00;EUR\n"       # duplicate of A row 2
        "20.05.2026;Lidl;-8.50;EUR\n"                        # new row
    )
    bytes_a = csv_a.encode("utf-8")
    bytes_b = csv_b.encode("utf-8")
    # Sanity: bytes differ so file-hash guard won't fire
    assert bytes_a != bytes_b

    resp_a = client.post(
        "/import",
        data={"account_id": "1", "user_id": "1"},
        files={"file": ("file_a.csv", io.BytesIO(bytes_a), "text/csv")},
    )
    assert resp_a.status_code == 201
    assert resp_a.json()["rows_imported"] == 3
    assert resp_a.json()["status"] == "done"

    resp_b = client.post(
        "/import",
        data={"account_id": "1", "user_id": "1"},
        files={"file": ("file_b.csv", io.BytesIO(bytes_b), "text/csv")},
    )
    assert resp_b.status_code == 201
    body_b = resp_b.json()
    # File-hash guard must NOT have fired
    assert body_b["status"] == "done", (
        f"Expected status='done' (per-tx dedup), got '{body_b['status']}'"
    )
    # 2 rows in B overlap with A → skipped by per-transaction dedup
    assert body_b["rows_skipped"] >= 1
    assert body_b["rows_imported"] >= 1  # at least the new Lidl row

    # Both uploads produce persisted logs (audit trail)
    logs_resp = client.get("/import/logs")
    assert logs_resp.status_code == 200
    logs = logs_resp.json()
    assert len(logs) == 2
    # All log entries have real ids and imported_at (non-null, non-optional)
    for log in logs:
        assert log["id"] is not None
        assert log["imported_at"] is not None


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


def test_seed_rules(client):
    response = client.post("/import/seed-rules")
    assert response.status_code == 200
    body = response.json()
    assert "inserted" in body
    assert body["inserted"] >= 0


def test_recategorize_endpoint(client):
    response = client.post("/import/recategorize")
    assert response.status_code == 200
    assert "updated" in response.json()


def test_import_from_tree_no_account_match(client):
    """Post a temp dir with one CSV; no account rows exist so expect no_account status."""
    csv_content = (
        "Buchungsdatum;Verwendungszweck;Betrag;Währung\n"
        "01.05.2026;REWE Supermarkt;-42.80;EUR\n"
    ).encode("utf-8")
    with tempfile.TemporaryDirectory() as tmpdir:
        # Simulate an owner subfolder like the real tree
        owner_dir = os.path.join(tmpdir, "Hoa")
        os.makedirs(owner_dir)
        csv_path = os.path.join(owner_dir, "umsaetze_may.csv")
        with open(csv_path, "wb") as f:
            f.write(csv_content)
        response = client.post(
            "/import/from-tree",
            data={"path": tmpdir, "user_id": "1"},
        )
    assert response.status_code == 201
    body = response.json()
    assert body["files_processed"] >= 1
    # No matching account in test DB → status no_account
    assert any(f["status"] == "no_account" for f in body["files"])


def test_import_from_tree_invalid_path(client):
    response = client.post(
        "/import/from-tree",
        data={"path": "/nonexistent/path/xyz", "user_id": "1"},
    )
    assert response.status_code == 422


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
