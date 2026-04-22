from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_login_success():
    response = client.post(
        "/api/auth/token",
        data={"username": "admin", "password": "admin"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    assert response.status_code == 200
    json_data = response.json()
    assert "access_token" in json_data
    assert json_data["token_type"] == "bearer"


def test_login_failure():
    response = client.post(
        "/api/auth/token",
        data={"username": "admin", "password": "wrongpassword"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Incorrect username or password"}


def test_consumption_route_unauthorized():
    response = client.get("/api/consumption")

    assert response.status_code == 401


def test_sensor_config_unauthorized():
    response = client.post("/api/sensor/config", json={"interval_ms": 1000})

    assert response.status_code == 401


def test_sensor_config_authorized():
    login_resp = client.post(
        "/api/auth/token",
        data={"username": "admin", "password": "admin"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    ).json()

    response = client.post(
        "/api/sensor/config",
        json={"interval_ms": 1000, "moving_average_window": 5},
        headers={"Authorization": f"Bearer {login_resp['access_token']}"},
    )

    assert response.status_code == 200
    assert response.json()["message"] == "Configuracao atualizada com sucesso"
