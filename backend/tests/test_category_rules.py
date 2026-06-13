def test_create_rule(client):
    response = client.post("/category-rules", json={"pattern": "REWE SAGT DANKE", "category": "supermarket"})
    assert response.status_code == 201
    data = response.json()
    assert data["pattern"] == "REWE SAGT DANKE"
    assert data["category"] == "supermarket"
    assert data["account_id"] is None
    assert "id" in data


def test_create_rule_scoped_to_account(client):
    account = client.post("/accounts", json={"name": "Bank", "type": "checking", "currency": "EUR"}).json()
    response = client.post("/category-rules", json={
        "pattern": "NETFLIX.COM", "category": "subscriptions", "account_id": account["id"],
    })
    assert response.status_code == 201
    assert response.json()["account_id"] == account["id"]


def test_list_rules(client):
    client.post("/category-rules", json={"pattern": "A", "category": "food"})
    client.post("/category-rules", json={"pattern": "B", "category": "travel"})
    response = client.get("/category-rules")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_delete_rule(client):
    created = client.post("/category-rules", json={"pattern": "A", "category": "food"}).json()
    response = client.delete(f"/category-rules/{created['id']}")
    assert response.status_code == 204
    assert client.get("/category-rules").json() == []


def test_delete_rule_not_found(client):
    assert client.delete("/category-rules/9999").status_code == 404
