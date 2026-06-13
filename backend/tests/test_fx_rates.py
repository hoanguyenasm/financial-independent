def test_upsert_creates_rate(client):
    response = client.put("/fx-rates", json={
        "from_currency": "EUR", "to_currency": "VND", "rate": 27800, "date": "2026-06-13",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["rate"] == 27800
    assert "id" in data


def test_upsert_updates_existing_rate(client):
    client.put("/fx-rates", json={"from_currency": "EUR", "to_currency": "VND", "rate": 27800, "date": "2026-06-13"})
    response = client.put("/fx-rates", json={"from_currency": "EUR", "to_currency": "VND", "rate": 27900, "date": "2026-06-13"})
    assert response.status_code == 200
    assert response.json()["rate"] == 27900
    rates = client.get("/fx-rates?from_currency=EUR&to_currency=VND").json()
    assert len(rates) == 1


def test_latest_rate(client):
    client.put("/fx-rates", json={"from_currency": "EUR", "to_currency": "USD", "rate": 1.08, "date": "2026-06-01"})
    client.put("/fx-rates", json={"from_currency": "EUR", "to_currency": "USD", "rate": 1.09, "date": "2026-06-12"})
    response = client.get("/fx-rates/latest?from_currency=EUR&to_currency=USD")
    assert response.status_code == 200
    assert response.json()["rate"] == 1.09
    assert response.json()["date"] == "2026-06-12"


def test_latest_rate_not_found(client):
    assert client.get("/fx-rates/latest?from_currency=EUR&to_currency=GBP").status_code == 404
