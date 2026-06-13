from datetime import date


def _setup(client):
    user = client.post("/users", json={"name": "Hoa", "email": "hoa@example.com"}).json()
    account = client.post("/accounts", json={"name": "Giro", "type": "checking", "currency": "EUR"}).json()
    return user["id"], account["id"]


def _tx(client, user_id, account_id, d, amount, tx_type, category="other", amount_base=None, needs_review=False):
    return client.post("/transactions", json={
        "account_id": account_id, "user_id": user_id, "date": d,
        "amount": amount, "currency": "EUR",
        "amount_base": amount_base if amount_base is not None else amount,
        "description": "tx", "type": tx_type, "category": category,
        "needs_review": needs_review,
    })


def test_cashflow_monthly_groups_income_and_expense(client):
    user_id, account_id = _setup(client)
    today = date.today()
    m = today.strftime("%Y-%m")
    _tx(client, user_id, account_id, f"{m}-01", 5000.0, "income", "salary")
    _tx(client, user_id, account_id, f"{m}-02", -1200.0, "expense", "mortgage")
    _tx(client, user_id, account_id, f"{m}-03", -300.0, "expense", "supermarket")
    # excluded from both sides
    _tx(client, user_id, account_id, f"{m}-04", -500.0, "transfer")
    _tx(client, user_id, account_id, f"{m}-05", -400.0, "investment_buy", "etf")

    response = client.get("/analytics/cashflow-monthly?months=12")
    assert response.status_code == 200
    rows = response.json()
    row = next(r for r in rows if r["month"] == m)
    assert row["income"] == 5000.0
    assert row["expense"] == 1500.0
    assert row["net"] == 3500.0


def test_cashflow_monthly_passive_income_types_count_as_income(client):
    user_id, account_id = _setup(client)
    m = date.today().strftime("%Y-%m")
    _tx(client, user_id, account_id, f"{m}-01", 100.0, "dividend")
    _tx(client, user_id, account_id, f"{m}-02", 50.0, "interest")
    row = next(r for r in client.get("/analytics/cashflow-monthly").json() if r["month"] == m)
    assert row["income"] == 150.0


def test_cashflow_monthly_empty(client):
    response = client.get("/analytics/cashflow-monthly")
    assert response.status_code == 200
    assert response.json() == []
