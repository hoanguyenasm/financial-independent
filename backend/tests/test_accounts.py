def _make_user(client):
    return client.post("/users", json={"name": "Alice", "email": "alice@example.com"}).json()


def test_create_account(client):
    user = _make_user(client)
    response = client.post("/accounts", json={
        "owner_user_id": user["id"], "name": "Vietcombank Savings",
        "type": "savings", "currency": "VND", "institution": "Vietcombank"
    })
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Vietcombank Savings"
    assert data["type"] == "savings"
    assert data["is_active"] == True


def test_list_accounts(client):
    user = _make_user(client)
    client.post("/accounts", json={"owner_user_id": user["id"], "name": "A1", "type": "checking", "currency": "USD"})
    client.post("/accounts", json={"owner_user_id": user["id"], "name": "A2", "type": "savings", "currency": "USD"})
    response = client.get("/accounts")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_get_account(client):
    created = client.post("/accounts", json={"name": "Cash", "type": "checking", "currency": "USD"}).json()
    response = client.get(f"/accounts/{created['id']}")
    assert response.status_code == 200


def test_update_account(client):
    created = client.post("/accounts", json={"name": "Old Name", "type": "checking", "currency": "USD"}).json()
    response = client.patch(f"/accounts/{created['id']}", json={"name": "New Name", "is_active": False})
    assert response.status_code == 200
    assert response.json()["name"] == "New Name"
    assert response.json()["is_active"] == False


def test_delete_account(client):
    created = client.post("/accounts", json={"name": "To Delete", "type": "checking", "currency": "USD"}).json()
    response = client.delete(f"/accounts/{created['id']}")
    assert response.status_code == 204


def test_account_read_exposes_balance_fields(client):
    r = client.post("/accounts", json={"name": "Giro", "type": "checking", "currency": "EUR"})
    assert r.status_code == 201
    body = r.json()
    assert "balance" in body and body["balance"] is None
    assert "balance_as_of" in body and body["balance_as_of"] is None
