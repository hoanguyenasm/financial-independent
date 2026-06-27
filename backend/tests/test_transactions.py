from datetime import date


def _setup(client):
    user = client.post("/users", json={"name": "Alice", "email": "alice@example.com"}).json()
    account = client.post("/accounts", json={"name": "Bank", "type": "checking", "currency": "USD"}).json()
    return user["id"], account["id"]


def test_create_transaction(client):
    user_id, account_id = _setup(client)
    response = client.post("/transactions", json={
        "account_id": account_id, "user_id": user_id,
        "date": str(date.today()), "amount": 50.0, "currency": "USD",
        "description": "Grab ride", "type": "expense"
    })
    assert response.status_code == 201
    data = response.json()
    assert data["category"] == "uncategorized"
    assert data["needs_review"] == False
    assert data["source"] == "manual"


def test_list_transactions(client):
    user_id, account_id = _setup(client)
    for i in range(3):
        client.post("/transactions", json={
            "account_id": account_id, "user_id": user_id,
            "date": str(date.today()), "amount": float(i + 1),
            "currency": "USD", "description": f"tx{i}", "type": "expense"
        })
    response = client.get("/transactions")
    assert response.status_code == 200
    assert len(response.json()) == 3


def test_filter_transactions_by_month(client):
    user_id, account_id = _setup(client)
    today = date.today()
    this_m = today.strftime("%Y-%m")
    prev_total = today.year * 12 + (today.month - 1) - 1
    prev = date(prev_total // 12, prev_total % 12 + 1, 15)
    for d in (f"{this_m}-05", f"{this_m}-20"):
        client.post("/transactions", json={
            "account_id": account_id, "user_id": user_id, "date": d,
            "amount": 5.0, "currency": "USD", "description": "this month", "type": "income",
            "category": "salary",
        })
    client.post("/transactions", json={
        "account_id": account_id, "user_id": user_id, "date": str(prev),
        "amount": 5.0, "currency": "USD", "description": "last month", "type": "income",
        "category": "salary",
    })
    rows = client.get(f"/transactions?category=salary&month={this_m}").json()
    assert len(rows) == 2
    assert all(r["description"] == "this month" for r in rows)


def test_filter_transactions_needs_review(client):
    user_id, account_id = _setup(client)
    client.post("/transactions", json={
        "account_id": account_id, "user_id": user_id,
        "date": str(date.today()), "amount": 10.0,
        "currency": "USD", "description": "Unknown", "type": "expense",
        "needs_review": True
    })
    client.post("/transactions", json={
        "account_id": account_id, "user_id": user_id,
        "date": str(date.today()), "amount": 5.0,
        "currency": "USD", "description": "Coffee", "type": "expense",
        "category": "food"
    })
    response = client.get("/transactions?needs_review=true")
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_update_transaction_category(client):
    user_id, account_id = _setup(client)
    created = client.post("/transactions", json={
        "account_id": account_id, "user_id": user_id,
        "date": str(date.today()), "amount": 10.0,
        "currency": "USD", "description": "Grab", "type": "expense"
    }).json()
    response = client.patch(f"/transactions/{created['id']}", json={"category": "transport", "needs_review": False})
    assert response.status_code == 200
    assert response.json()["category"] == "transport"
    assert response.json()["needs_review"] == False


def test_get_needs_review_count(client):
    user_id, account_id = _setup(client)
    for _ in range(3):
        client.post("/transactions", json={
            "account_id": account_id, "user_id": user_id,
            "date": str(date.today()), "amount": 1.0,
            "currency": "USD", "description": "?", "type": "expense",
            "needs_review": True
        })
    response = client.get("/transactions/needs-review-count")
    assert response.status_code == 200
    assert response.json()["count"] == 3
