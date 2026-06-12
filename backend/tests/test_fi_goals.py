def _make_user(client, email="alice@example.com"):
    return client.post("/users", json={"name": "Alice", "email": email}).json()


def test_create_fi_goal(client):
    user = _make_user(client)
    response = client.post("/fi-goals", json={
        "user_id": user["id"],
        "target_net_worth": 500000.0,
        "target_date": "2030-01-01",
        "safe_withdrawal_rate": 0.04,
        "investment_return_rate": 0.07,
        "inflation_rate": 0.03
    })
    assert response.status_code == 201
    data = response.json()
    assert data["target_net_worth"] == 500000.0
    assert data["safe_withdrawal_rate"] == 0.04


def test_one_goal_per_user(client):
    user = _make_user(client)
    client.post("/fi-goals", json={"user_id": user["id"]})
    response = client.post("/fi-goals", json={"user_id": user["id"]})
    assert response.status_code == 409


def test_get_fi_goal_by_user(client):
    user = _make_user(client)
    client.post("/fi-goals", json={"user_id": user["id"], "target_net_worth": 1000000.0})
    response = client.get(f"/fi-goals/user/{user['id']}")
    assert response.status_code == 200
    assert response.json()["target_net_worth"] == 1000000.0


def test_update_fi_goal(client):
    user = _make_user(client)
    created = client.post("/fi-goals", json={"user_id": user["id"]}).json()
    response = client.patch(f"/fi-goals/{created['id']}", json={"inflation_rate": 0.035})
    assert response.status_code == 200
    assert response.json()["inflation_rate"] == 0.035
