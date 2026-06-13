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
    data = response.json()
    assert len(data) == 12
    assert all(r["income"] == 0.0 and r["expense"] == 0.0 and r["net"] == 0.0 for r in data)


def test_summary(client):
    user_id, account_id = _setup(client)
    m = date.today().strftime("%Y-%m")
    # assets: 1000 * 100% + 200000 * 50% = 101000 net worth
    client.post("/assets", json={
        "account_id": account_id, "symbol_or_name": "VWCE", "asset_type": "etf",
        "currency": "EUR", "current_value": 1000.0,
    })
    client.post("/assets", json={
        "account_id": account_id, "symbol_or_name": "Apartment", "asset_type": "real_estate",
        "currency": "EUR", "current_value": 200000.0, "ownership_pct": 50.0,
    })
    _tx(client, user_id, account_id, f"{m}-01", 6000.0, "income", "salary")
    _tx(client, user_id, account_id, f"{m}-02", 240.0, "dividend")
    _tx(client, user_id, account_id, f"{m}-03", -2400.0, "expense", "mortgage")
    _tx(client, user_id, account_id, f"{m}-04", -10.0, "expense", needs_review=True)

    response = client.get("/analytics/summary")
    assert response.status_code == 200
    s = response.json()
    assert s["net_worth"] == 101000.0
    # trailing-12-month averages: income (6000+240)/12, expenses 2410/12
    assert s["monthly_expenses"] == round(2410 / 12, 2)
    assert s["passive_income_monthly"] == round(240 / 12, 2)
    assert s["savings_rate"] == round((6240 - 2410) / 6240, 4)
    assert s["needs_review"] == 1
    # income=6240, expenses=2410, so (6240-2410)/12 = 319.17
    assert s["base_monthly_savings"] == round((6240 - 2410) / 12, 2)


def test_summary_empty_db(client):
    s = client.get("/analytics/summary").json()
    assert s == {
        "net_worth": 0.0, "passive_income_monthly": 0.0,
        "monthly_expenses": 0.0, "savings_rate": 0.0, "needs_review": 0,
        "fi_target": 0.0, "base_monthly_savings": 0.0,
    }


def test_expense_by_category(client):
    user_id, account_id = _setup(client)
    m = date.today().strftime("%Y-%m")
    _tx(client, user_id, account_id, f"{m}-01", -1200.0, "expense", "mortgage")
    _tx(client, user_id, account_id, f"{m}-02", -300.0, "expense", "supermarket")
    _tx(client, user_id, account_id, f"{m}-03", -300.0, "expense", "supermarket")
    _tx(client, user_id, account_id, f"{m}-04", 5000.0, "income", "salary")  # excluded

    response = client.get("/analytics/expense-by-category?months=12")
    assert response.status_code == 200
    rows = response.json()
    cats = {r["category"]: r for r in rows}
    assert "mortgage" in cats
    assert cats["mortgage"]["total_base"] == 1200.0
    assert cats["mortgage"]["txn_count"] == 1
    assert "supermarket" in cats
    assert cats["supermarket"]["total_base"] == 600.0
    assert cats["supermarket"]["txn_count"] == 2
    assert "salary" not in cats


def test_summary_includes_fi_target(client):
    user = client.post("/users", json={"name": "Hoa", "email": "hoa@example.com"}).json()
    goal_payload = {
        "user_id": user["id"],
        "target_net_worth": 500000.0,
        "safe_withdrawal_rate": 0.04,
        "investment_return_rate": 0.07,
        "inflation_rate": 0.03,
    }
    client.post("/fi-goals", json=goal_payload)
    s = client.get("/analytics/summary").json()
    assert s["fi_target"] == 500000.0
