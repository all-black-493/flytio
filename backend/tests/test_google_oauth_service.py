"""Unit tests for external_services/google_oauth.py - no real Google
connectivity, httpx calls are mocked at the client-method level."""

import asyncio

import httpx
import pytest

from backend.external_services.google_oauth import GoogleOAuthError, GoogleOAuthService


def _run(coro):
    return asyncio.run(coro)


class _FakeAsyncClient:
    """Just enough of httpx.AsyncClient's surface for these tests -
    post/get delegate to whichever fake coroutine the test supplies."""

    def __init__(self, post=None, get=None):
        self._post = post
        self._get = get

    async def post(self, url, data=None, headers=None):
        return await self._post(url, data, headers)

    async def get(self, url, headers=None):
        return await self._get(url, headers)


@pytest.fixture
def service():
    svc = GoogleOAuthService()
    svc.client_id = "test-client-id"
    svc.client_secret = "test-client-secret"
    svc.auth_url = "https://accounts.google.com/o/oauth2/v2/auth"
    svc.token_url = "https://oauth2.googleapis.com/token"
    svc.userinfo_url = "https://www.googleapis.com/oauth2/v2/userinfo"
    return svc


def test_build_authorization_url_includes_required_params(service):
    url = service.build_authorization_url(
        redirect_uri="http://localhost:8000/auth/google/callback", state="abc123"
    )

    assert url.startswith(service.auth_url + "?")
    assert "client_id=test-client-id" in url
    assert (
        "redirect_uri=http%3A%2F%2Flocalhost%3A8000%2Fauth%2Fgoogle%2Fcallback" in url
    )
    assert "response_type=code" in url
    assert "state=abc123" in url
    assert "scope=openid" in url


def test_exchange_code_for_token_returns_data_on_success(service, monkeypatch):
    async def fake_post(url, data, headers):
        assert url == service.token_url
        assert data["code"] == "test-code"
        assert data["client_secret"] == "test-client-secret"
        return httpx.Response(
            200, json={"access_token": "tok_123", "token_type": "Bearer"}
        )

    monkeypatch.setattr(service, "_client", _FakeAsyncClient(post=fake_post))

    result = _run(
        service.exchange_code_for_token(
            code="test-code", redirect_uri="http://localhost:8000/auth/google/callback"
        )
    )
    assert result["access_token"] == "tok_123"


def test_exchange_code_for_token_raises_on_http_error(service, monkeypatch):
    async def fake_post(url, data, headers):
        return httpx.Response(400, json={"error": "invalid_grant"})

    monkeypatch.setattr(service, "_client", _FakeAsyncClient(post=fake_post))

    with pytest.raises(GoogleOAuthError):
        _run(
            service.exchange_code_for_token(
                code="bad-code",
                redirect_uri="http://localhost:8000/auth/google/callback",
            )
        )


def test_exchange_code_for_token_raises_when_access_token_missing(service, monkeypatch):
    async def fake_post(url, data, headers):
        return httpx.Response(200, json={"token_type": "Bearer"})

    monkeypatch.setattr(service, "_client", _FakeAsyncClient(post=fake_post))

    with pytest.raises(GoogleOAuthError):
        _run(
            service.exchange_code_for_token(
                code="test-code",
                redirect_uri="http://localhost:8000/auth/google/callback",
            )
        )


def test_fetch_userinfo_returns_data_on_success(service, monkeypatch):
    async def fake_get(url, headers):
        assert url == service.userinfo_url
        assert headers["Authorization"] == "Bearer tok_123"
        return httpx.Response(
            200,
            json={
                "id": "1234567890",
                "email": "amelia@example.com",
                "verified_email": True,
                "name": "Amelia Earhart",
            },
        )

    monkeypatch.setattr(service, "_client", _FakeAsyncClient(get=fake_get))

    result = _run(service.fetch_userinfo("tok_123"))
    assert result["id"] == "1234567890"
    assert result["email"] == "amelia@example.com"


def test_fetch_userinfo_raises_on_http_error(service, monkeypatch):
    async def fake_get(url, headers):
        return httpx.Response(401, json={"error": "invalid_token"})

    monkeypatch.setattr(service, "_client", _FakeAsyncClient(get=fake_get))

    with pytest.raises(GoogleOAuthError):
        _run(service.fetch_userinfo("bad-token"))


def test_client_raises_when_not_configured():
    svc = GoogleOAuthService()
    svc.client_id = ""
    svc.client_secret = ""
    with pytest.raises(ValueError):
        _ = svc.client
