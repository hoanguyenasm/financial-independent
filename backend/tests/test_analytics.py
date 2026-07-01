from datetime import date


def _months_ago_str(months: int) -> str:
    today = date.today()
    total = today.year * 12 + (today.month - 1) - months
    return date(total // 12, total % 12 + 1, 1).strftime("%Y-%m")


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
        "cash": 0.0, "invested": 0.0, "re_equity": 0.0,
        "savings_series": [0.0] * 12, "savings_rate_avg": 0.0,
        "rental_monthly_avg": 0.0, "rental_series": [0.0] * 12,
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


def test_income_by_category(client):
    user_id, account_id = _setup(client)
    m = date.today().strftime("%Y-%m")
    _tx(client, user_id, account_id, f"{m}-01", 5000.0, "income", "salary")
    _tx(client, user_id, account_id, f"{m}-02", 2100.0, "income", "rental")
    _tx(client, user_id, account_id, f"{m}-03", 2100.0, "income", "rental")
    _tx(client, user_id, account_id, f"{m}-04", 150.0, "dividend", "dividend")
    _tx(client, user_id, account_id, f"{m}-05", -300.0, "expense", "supermarket")  # excluded

    response = client.get("/analytics/income-by-category?months=12")
    assert response.status_code == 200
    cats = {r["category"]: r for r in response.json()}
    assert cats["salary"]["total_base"] == 5000.0
    assert cats["rental"]["total_base"] == 4200.0
    assert cats["rental"]["txn_count"] == 2
    assert cats["dividend"]["total_base"] == 150.0
    assert "supermarket" not in cats


def test_income_by_category_excludes_transfer(client):
    user_id, account_id = _setup(client)
    m = date.today().strftime("%Y-%m")
    _tx(client, user_id, account_id, f"{m}-01", 4000.0, "income", "salary")
    _tx(client, user_id, account_id, f"{m}-02", 9000.0, "income", "transfer")  # internal
    cats = {r["category"]: r for r in client.get("/analytics/income-by-category").json()}
    assert "transfer" not in cats
    assert cats["salary"]["total_base"] == 4000.0


def test_investment_by_category_splits_passive_active_and_includes_sells(client):
    user_id, account_id = _setup(client)
    m = date.today().strftime("%Y-%m")
    # investment buys are stored negative (money leaving the cash account)
    _tx(client, user_id, account_id, f"{m}-01", -600.0, "investment_buy", "etf")      # passive Sparplan
    _tx(client, user_id, account_id, f"{m}-02", -400.0, "investment_buy", "etf")      # passive Sparplan
    _tx(client, user_id, account_id, f"{m}-03", -250.0, "investment_buy", "trading")  # active trade
    _tx(client, user_id, account_id, f"{m}-04", -1200.0, "expense", "mortgage")       # excluded
    _tx(client, user_id, account_id, f"{m}-05", 800.0, "investment_sell", "investment_sell")

    response = client.get("/analytics/investment-by-category?months=12")
    assert response.status_code == 200
    cats = {r["category"]: r for r in response.json()}
    assert cats["etf"]["total_base"] == 1000.0
    assert cats["etf"]["txn_count"] == 2
    assert cats["trading"]["total_base"] == 250.0
    assert cats["investment_sell"]["total_base"] == 800.0  # sells now belong here
    assert "mortgage" not in cats


def test_investment_sell_is_not_income(client):
    user_id, account_id = _setup(client)
    m = date.today().strftime("%Y-%m")
    _tx(client, user_id, account_id, f"{m}-01", 5000.0, "income", "salary")
    _tx(client, user_id, account_id, f"{m}-02", 800.0, "investment_sell", "investment_sell")

    inc = {r["category"]: r for r in client.get("/analytics/income-by-category").json()}
    assert "investment_sell" not in inc
    assert inc["salary"]["total_base"] == 5000.0
    # and it must not inflate cash-flow income either
    row = next(r for r in client.get("/analytics/cashflow-monthly").json() if r["month"] == m)
    assert row["income"] == 5000.0


def test_income_and_investment_by_category_single_month(client):
    user_id, account_id = _setup(client)
    this_m = date.today().strftime("%Y-%m")
    last = _months_ago_str(1)
    _tx(client, user_id, account_id, f"{this_m}-01", 5000.0, "income", "salary")
    _tx(client, user_id, account_id, f"{last}-15", 4000.0, "income", "salary")
    _tx(client, user_id, account_id, f"{this_m}-02", -500.0, "investment_buy", "etf")
    _tx(client, user_id, account_id, f"{last}-16", -900.0, "investment_buy", "etf")

    inc = {r["category"]: r for r in client.get(f"/analytics/income-by-category?month={this_m}").json()}
    assert inc["salary"]["total_base"] == 5000.0
    inv = {r["category"]: r for r in client.get(f"/analytics/investment-by-category?month={this_m}").json()}
    assert inv["etf"]["total_base"] == 500.0


def test_transfers_excluded_from_expenses(client):
    # A household-name debit can be type="expense" but category="transfer" (internal
    # movement). It must NOT count as an expense in either aggregation.
    user_id, account_id = _setup(client)
    m = date.today().strftime("%Y-%m")
    _tx(client, user_id, account_id, f"{m}-01", -300.0, "expense", "supermarket")
    _tx(client, user_id, account_id, f"{m}-02", -5000.0, "expense", "transfer")  # internal
    _tx(client, user_id, account_id, f"{m}-03", 4000.0, "income", "salary")

    by_cat = {r["category"]: r for r in client.get("/analytics/expense-by-category?months=12").json()}
    assert "transfer" not in by_cat
    assert by_cat["supermarket"]["total_base"] == 300.0

    summary = client.get("/analytics/summary").json()
    # expenses = 300 (supermarket only), not 5300; savings = (4000-300)
    assert summary["monthly_expenses"] == round(300.0 / 12, 2)
    assert summary["base_monthly_savings"] == round((4000.0 - 300.0) / 12, 2)


def test_deposit_is_neutral_in_cashflow_and_summary(client):
    user_id, account_id = _setup(client)
    m = date.today().strftime("%Y-%m")
    _tx(client, user_id, account_id, f"{m}-01", 4000.0, "income", "salary")
    _tx(client, user_id, account_id, f"{m}-02", -800.0, "expense", "groceries")
    # received and refunded Kaution — both tagged deposit, must not move income/expense
    _tx(client, user_id, account_id, f"{m}-03", 1500.0, "income", "deposit")   # received
    _tx(client, user_id, account_id, f"{m}-04", -1500.0, "expense", "deposit")  # refunded

    row = next(r for r in client.get("/analytics/cashflow-monthly").json() if r["month"] == m)
    assert row["income"] == 4000.0
    assert row["expense"] == 800.0

    inc = {r["category"]: r for r in client.get("/analytics/income-by-category").json()}
    exp = {r["category"]: r for r in client.get("/analytics/expense-by-category").json()}
    assert "deposit" not in inc and "deposit" not in exp

    s = client.get("/analytics/summary").json()
    assert s["monthly_expenses"] == round(800.0 / 12, 2)
    assert s["savings_rate"] == round((4000.0 - 800.0) / 4000.0, 4)


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


def test_net_worth_from_balances_and_assets(client, db):
    from app.models import Account, Asset
    db.add(Account(name="Giro", type="checking", currency="EUR", balance=1000.00))
    db.add(Account(name="Broker", type="investment", currency="EUR", balance=500.00))
    db.add(Account(name="AmEx", type="credit_card", currency="EUR", balance=300.00))  # owed
    acc = Account(name="RE", type="checking", currency="EUR")
    db.add(acc)
    db.commit()
    db.add(Asset(account_id=acc.id, symbol_or_name="Apartment", asset_type="realestate",
                 quantity=1, current_value=236000.00, currency="EUR", ownership_pct=100.0))
    db.commit()
    # 1000 + 500 - 300 (credit card liability) + 236000 = 237200
    nw = client.get("/analytics/summary").json()["net_worth"]
    assert nw == 237200.0


def test_summary_net_worth_breakdown(client, db):
    from app.models import Account, Asset
    db.add(Account(name="Giro", type="checking", currency="EUR", balance=1000.00))
    broker = Account(name="Broker", type="investment", currency="EUR", balance=500.00)
    db.add(broker)
    db.add(Account(name="AmEx", type="credit_card", currency="EUR", balance=300.00))
    acc = Account(name="RE", type="checking", currency="EUR")
    db.add(acc)
    db.commit()
    # ownership-weighted real estate: 200000 * 50% = 100000
    db.add(Asset(account_id=acc.id, symbol_or_name="Apartment", asset_type="real_estate",
                 quantity=1, current_value=200000.00, currency="EUR", ownership_pct=50.0))
    # non-realestate asset counts as invested alongside broker balances
    db.add(Asset(account_id=broker.id, symbol_or_name="VWCE", asset_type="etf",
                 quantity=1, current_value=2000.00, currency="EUR", ownership_pct=100.0))
    db.commit()
    s = client.get("/analytics/summary").json()
    assert s["cash"] == 1000.0
    assert s["invested"] == 2500.0        # 500 broker balance + 2000 ETF asset
    assert s["re_equity"] == 100000.0
    # breakdown reconciles with net worth (minus the 300 credit-card liability)
    assert s["net_worth"] == 1000.0 + 2500.0 + 100000.0 - 300.0


def test_summary_savings_and_rental_series(client):
    user_id, account_id = _setup(client)
    m = date.today().strftime("%Y-%m")
    prev = _months_ago_str(1)
    # current month: income 4000, expenses 1000 -> rate 75%
    _tx(client, user_id, account_id, f"{m}-01", 4000.0, "income", "salary")
    _tx(client, user_id, account_id, f"{m}-02", -1000.0, "expense", "groceries")
    # previous month: income 2000, expenses 1500 -> rate 25%
    _tx(client, user_id, account_id, f"{prev}-01", 2000.0, "income", "salary")
    _tx(client, user_id, account_id, f"{prev}-02", -1500.0, "expense", "groceries")
    # rental + airbnb income
    _tx(client, user_id, account_id, f"{m}-03", 2100.0, "income", "rental")
    _tx(client, user_id, account_id, f"{prev}-03", 900.0, "income", "airbnb")

    s = client.get("/analytics/summary").json()
    assert len(s["savings_series"]) == 12
    # current month: income 4000+2100, expenses 1000 -> (6100-1000)/6100 = 83.6%
    assert s["savings_series"][-1] == 83.6
    # previous month: income 2000+900, expenses 1500 -> (2900-1500)/2900 = 48.3%
    assert s["savings_series"][-2] == 48.3
    # months with no income stay at 0
    assert s["savings_series"][0] == 0.0
    assert len(s["rental_series"]) == 12
    assert s["rental_series"][-1] == 2100.0
    assert s["rental_series"][-2] == 900.0
    assert s["rental_monthly_avg"] == round(3000.0 / 12, 2)
    # avg over months WITH income only: (83.6 + 48.3) / 2
    assert s["savings_rate_avg"] == 65.9


def test_passive_income_includes_rental_and_airbnb(client):
    user_id, account_id = _setup(client)
    m = date.today().strftime("%Y-%m")
    _tx(client, user_id, account_id, f"{m}-01", 120.0, "dividend", "dividend")
    _tx(client, user_id, account_id, f"{m}-02", 2100.0, "income", "rental")
    _tx(client, user_id, account_id, f"{m}-03", 900.0, "income", "airbnb")
    _tx(client, user_id, account_id, f"{m}-04", 4000.0, "income", "salary")  # not passive

    s = client.get("/analytics/summary").json()
    assert s["passive_income_monthly"] == round((120.0 + 2100.0 + 900.0) / 12, 2)
