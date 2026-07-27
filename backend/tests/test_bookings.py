from fastapi.testclient import TestClient
from backend.main import app

# TestClient defaults to a fake ("testclient", 50000) client address, which
# fastapi-guard's IP-security check rejects outright (it's not a parseable
# IP) regardless of any whitelist/blacklist config - give it a real-looking
# loopback address instead.
client = TestClient(app, client=("127.0.0.1", 50000))


def test_read_main():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Flyt is live"}
