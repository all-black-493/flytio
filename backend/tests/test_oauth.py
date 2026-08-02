"""Tests for Google sign-in: crud/users.py's get_or_create_oauth_user
(the account-linking/creation logic) and routers/oauth.py (the redirect
+ callback endpoints), with Google itself mocked throughout - no real
network calls."""

from urllib.parse import parse_qs, urlparse

import pytest
from sqlmodel import Session

import backend.routers.oauth as oauth_module
from backend.crud.db import get_session
from backend.crud.users import (
    OAuthEmailConflictError,
    ban_user,
    create_oauth_user,
    create_user,
    get_or_create_oauth_user,
)
from backend.main import app
from backend.utils.security import verify_password


@pytest.fixture
def db_client(api_client, sqlite_engine):
    """api_client is session-scoped and shared by the whole test suite
    (see conftest.py) - unlike every other test file, this one exercises
    real HTTP redirects that set real cookies (flyt_token via a
    successful callback, flyt_oauth_state via /login), so without
    explicit cleanup here those cookies would leak into every test that
    runs afterwards, in this file or any other, for the rest of the
    session."""

    def _override_get_session():
        with Session(sqlite_engine) as session:
            yield session

    app.dependency_overrides[get_session] = _override_get_session
    try:
        yield api_client
    finally:
        app.dependency_overrides.pop(get_session, None)
        api_client.cookies.delete("flyt_token")
        api_client.cookies.delete("flyt_oauth_state")


# ---------- crud/users.py::get_or_create_oauth_user ----------


def test_get_or_create_oauth_user_creates_new_account(sqlite_engine):
    with Session(sqlite_engine) as session:
        user = get_or_create_oauth_user(
            session,
            provider="google",
            oauth_id="google-1",
            email="new@example.com",
            email_verified=True,
        )

        assert user.email == "new@example.com"
        assert user.oauth_provider == "google"
        assert user.oauth_id == "google-1"
        assert user.password is None


def test_get_or_create_oauth_user_finds_existing_oauth_account(sqlite_engine):
    with Session(sqlite_engine) as session:
        created = create_oauth_user(
            session,
            email="returning@example.com",
            provider="google",
            oauth_id="google-2",
        )

        found = get_or_create_oauth_user(
            session,
            provider="google",
            oauth_id="google-2",
            email="returning@example.com",
            email_verified=True,
        )

        assert found.id == created.id


def test_get_or_create_oauth_user_auto_links_verified_email_to_password_account(
    sqlite_engine,
):
    with Session(sqlite_engine) as session:
        existing = create_user(session, email="dual@example.com", password="hunter2")

        linked = get_or_create_oauth_user(
            session,
            provider="google",
            oauth_id="google-3",
            email="dual@example.com",
            email_verified=True,
        )

        assert linked.id == existing.id
        assert linked.oauth_provider == "google"
        assert linked.oauth_id == "google-3"
        # The original password must survive - linking must not touch it,
        # so the account can still be reached the original way too.
        assert verify_password("hunter2", linked.password)


def test_get_or_create_oauth_user_rejects_unverified_email_collision(sqlite_engine):
    """Not auto-linking on an unverified email (see the verified-email
    test above) is only half the story - the other half is that this
    must not silently create a second account with the same email
    either, since UserInDB.email is unique. It has to fail loudly."""
    with Session(sqlite_engine) as session:
        create_user(session, email="unverified@example.com", password="hunter2")

        with pytest.raises(OAuthEmailConflictError):
            get_or_create_oauth_user(
                session,
                provider="google",
                oauth_id="google-4",
                email="unverified@example.com",
                email_verified=False,
            )


def test_get_or_create_oauth_user_recovers_from_concurrent_insert(sqlite_engine):
    """Simulates two requests racing to create the same brand-new
    Google account: this call happens *after* another insert for the
    same (provider, oauth_id) has already landed, so the uq_user_oauth_
    identity constraint (models/users.py) rejects this one's own insert
    attempt - the function must recover by returning the row that won,
    not propagate the IntegrityError."""
    with Session(sqlite_engine) as session:
        winner = create_oauth_user(
            session, email="racer@example.com", provider="google", oauth_id="google-5"
        )

    with Session(sqlite_engine) as session:
        result = get_or_create_oauth_user(
            session,
            provider="google",
            oauth_id="google-5",
            email="racer@example.com",
            email_verified=True,
        )
        assert result.id == winner.id


# ---------- routers/oauth.py ----------


def test_google_login_redirects_to_google_with_state_cookie(db_client):
    response = db_client.get("/auth/google/login", follow_redirects=False)

    assert response.status_code == 302
    location = response.headers["location"]
    parsed = urlparse(location)
    assert parsed.netloc == "accounts.google.com"
    query = parse_qs(parsed.query)
    assert query["response_type"] == ["code"]
    assert "state" in query

    state_cookie = response.cookies.get("flyt_oauth_state")
    assert state_cookie == query["state"][0]


def test_google_callback_rejects_state_mismatch(db_client):
    db_client.cookies.set("flyt_oauth_state", "expected-state")

    response = db_client.get(
        "/auth/google/callback?code=abc&state=wrong-state", follow_redirects=False
    )

    assert response.status_code == 302
    assert response.headers["location"].startswith(
        f"{oauth_module.settings.FRONTEND_URL}/login?error="
    )
    assert "flyt_token" not in response.cookies


def test_google_callback_handles_google_reported_error(db_client):
    db_client.cookies.set("flyt_oauth_state", "some-state")

    response = db_client.get(
        "/auth/google/callback?error=access_denied&state=some-state",
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert "login?error=" in response.headers["location"]


def test_google_callback_happy_path_creates_user_and_sets_session_cookie(
    db_client, monkeypatch
):
    db_client.cookies.set("flyt_oauth_state", "matching-state")

    async def fake_exchange(*, code, redirect_uri):
        assert code == "auth-code-123"
        return {"access_token": "google-access-token"}

    async def fake_userinfo(access_token):
        assert access_token == "google-access-token"
        return {
            "id": "google-uid-1",
            "email": "newgoogleuser@example.com",
            "verified_email": True,
        }

    monkeypatch.setattr(
        oauth_module.google_oauth_service, "exchange_code_for_token", fake_exchange
    )
    monkeypatch.setattr(
        oauth_module.google_oauth_service, "fetch_userinfo", fake_userinfo
    )

    response = db_client.get(
        "/auth/google/callback?code=auth-code-123&state=matching-state",
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert (
        response.headers["location"] == f"{oauth_module.settings.FRONTEND_URL}/account"
    )
    assert "flyt_token" in response.cookies
    assert response.cookies.get("flyt_oauth_state") in (None, "")


def test_google_callback_rejects_banned_user(db_client, monkeypatch, sqlite_engine):
    with Session(sqlite_engine) as session:
        admin = create_user(session, email="admin@example.com", password="x")
        target = create_user(session, email="banned@example.com", password="x")
        ban_user(session, target, "policy violation", admin)

    db_client.cookies.set("flyt_oauth_state", "matching-state")

    async def fake_exchange(*, code, redirect_uri):
        return {"access_token": "google-access-token"}

    async def fake_userinfo(access_token):
        return {
            "id": "google-uid-banned",
            "email": "banned@example.com",
            "verified_email": True,
        }

    monkeypatch.setattr(
        oauth_module.google_oauth_service, "exchange_code_for_token", fake_exchange
    )
    monkeypatch.setattr(
        oauth_module.google_oauth_service, "fetch_userinfo", fake_userinfo
    )

    response = db_client.get(
        "/auth/google/callback?code=auth-code-123&state=matching-state",
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert "login?error=" in response.headers["location"]
    assert "flyt_token" not in response.cookies


def test_google_callback_rejects_unverified_email_collision(
    db_client, monkeypatch, sqlite_engine
):
    with Session(sqlite_engine) as session:
        create_user(session, email="collision@example.com", password="hunter2")

    db_client.cookies.set("flyt_oauth_state", "matching-state")

    async def fake_exchange(*, code, redirect_uri):
        return {"access_token": "google-access-token"}

    async def fake_userinfo(access_token):
        return {
            "id": "google-uid-collision",
            "email": "collision@example.com",
            "verified_email": False,
        }

    monkeypatch.setattr(
        oauth_module.google_oauth_service, "exchange_code_for_token", fake_exchange
    )
    monkeypatch.setattr(
        oauth_module.google_oauth_service, "fetch_userinfo", fake_userinfo
    )

    response = db_client.get(
        "/auth/google/callback?code=auth-code-123&state=matching-state",
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert "error=email_already_registered" in response.headers["location"]
    assert "flyt_token" not in response.cookies
