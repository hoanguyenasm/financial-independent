def test_get_settings(client):
    response = client.get("/settings")
    assert response.status_code == 200
    assert "base_currency" in response.json()


def test_update_base_currency(client):
    response = client.patch("/settings", json={"base_currency": "VND"})
    assert response.status_code == 200
    assert response.json()["base_currency"] == "VND"
    assert client.get("/settings").json()["base_currency"] == "VND"
