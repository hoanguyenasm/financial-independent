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


def test_list_rules_includes_match_count(client):
    user = client.post("/users", json={"name": "Hoa", "email": "h@e.com"}).json()
    account = client.post("/accounts", json={"name": "Bank", "type": "checking", "currency": "EUR"}).json()
    client.post("/category-rules", json={"pattern": "REWE", "category": "groceries"})

    def _tx(desc, cat):
        client.post("/transactions", json={
            "account_id": account["id"], "user_id": user["id"], "date": "2026-04-01",
            "amount": -10.0, "currency": "EUR", "description": desc, "type": "expense", "category": cat,
        })
    _tx("REWE SAGT DANKE", "groceries")      # matches pattern + category
    _tx("REWE City Markt", "groceries")      # matches
    _tx("REWE refund", "shopping")           # pattern matches but different category -> not counted
    _tx("EDEKA", "groceries")                # category matches but pattern doesn't -> not counted

    rule = next(r for r in client.get("/category-rules").json() if r["pattern"] == "REWE")
    assert rule["match_count"] == 2


def test_update_rule_category(client):
    created = client.post("/category-rules", json={"pattern": "REWE", "category": "groceries"}).json()
    resp = client.patch(f"/category-rules/{created['id']}", json={"category": "dining"})
    assert resp.status_code == 200
    assert resp.json()["category"] == "dining"
    assert resp.json()["pattern"] == "REWE"  # unchanged
    # persisted
    rule = next(r for r in client.get("/category-rules").json() if r["id"] == created["id"])
    assert rule["category"] == "dining"


def test_update_rule_not_found(client):
    assert client.patch("/category-rules/9999", json={"category": "dining"}).status_code == 404


def test_delete_rule(client):
    created = client.post("/category-rules", json={"pattern": "A", "category": "food"}).json()
    response = client.delete(f"/category-rules/{created['id']}")
    assert response.status_code == 204
    assert client.get("/category-rules").json() == []


def test_delete_rule_not_found(client):
    assert client.delete("/category-rules/9999").status_code == 404
