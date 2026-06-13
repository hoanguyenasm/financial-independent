def test_nw_snapshot_capture_and_list(client):
    account = client.post("/accounts", json={"name": "Giro", "type": "checking", "currency": "EUR"}).json()
    client.post("/assets", json={
        "account_id": account["id"],
        "symbol_or_name": "VWCE",
        "asset_type": "etf",
        "currency": "EUR",
        "current_value": 50000.0,
        "ownership_pct": 100.0,
    })

    r = client.post("/nw-snapshots")
    assert r.status_code == 201
    assert r.json()["net_worth"] == 50000.0

    r2 = client.get("/nw-snapshots")
    assert r2.status_code == 200
    assert len(r2.json()) == 1
    assert r2.json()[0]["net_worth"] == 50000.0


def test_nw_snapshot_upserts_same_day(client):
    account = client.post("/accounts", json={"name": "Giro", "type": "checking", "currency": "EUR"}).json()
    client.post("/assets", json={
        "account_id": account["id"],
        "symbol_or_name": "VWCE",
        "asset_type": "etf",
        "currency": "EUR",
        "current_value": 50000.0,
        "ownership_pct": 100.0,
    })
    client.post("/nw-snapshots")

    client.post("/assets", json={
        "account_id": account["id"],
        "symbol_or_name": "BTC",
        "asset_type": "crypto",
        "currency": "EUR",
        "current_value": 10000.0,
        "ownership_pct": 100.0,
    })
    client.post("/nw-snapshots")

    snaps = client.get("/nw-snapshots").json()
    assert len(snaps) == 1
    assert snaps[0]["net_worth"] == 60000.0
