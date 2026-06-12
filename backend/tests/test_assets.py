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
