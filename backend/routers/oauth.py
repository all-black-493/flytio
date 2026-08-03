"""Sign in with Google - a full-page browser redirect flow (not a fetch()
the frontend calls directly), since the user has to actually visit
Google's own consent screen. Two stops:

    GET /auth/google/login    - redirects the browser to Google
    GET /auth/google/callback - Google redirects back here with a code

Reuses the exact same JWT/cookie session mechanism as password login
(utils/security.py's create_access_token/set_auth_cookie) - once a
UserInDB row is resolved, an OAuth-authenticated session is
indistinguishable from a password-authenticated one to the rest of the
app.
"""

import secrets

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import RedirectResponse
from sqlmodel import Session

from backend.config import settings
from backend.utils.constants import API_V1_PREFIX
from backend.crud.db import get_session
from backend.crud.users import OAuthEmailConflictError, get_or_create_oauth_user
from backend.external_services.google_oauth import (
    GoogleOAuthError,
    google_oauth_service,
)
from backend.utils.guard import guard_deco
from backend.utils.log_manager import get_app_logger
from backend.utils.security import create_access_token, set_auth_cookie

logger = get_app_logger(__name__)

router = APIRouter(prefix="/auth/google", tags=["Auth"])

OAUTH_PROVIDER = "google"

STATE_COOKIE_NAME = "flyt_oauth_state"
# Scoped to this router's real mount point - see the set_cookie call below.
STATE_COOKIE_PATH = f"{API_V1_PREFIX}/auth/google"
# Long enough to click through Google's consent screen, short enough that
# a leaked/replayed cookie value is useless well before anyone would find
# it - the state cookie is single-purpose CSRF protection, not a session.
STATE_COOKIE_MAX_AGE_SECONDS = 10 * 60

LOGIN_IP_LIMIT = 20
LOGIN_WINDOW_SECONDS = 15 * 60


def _redirect_uri() -> str:
    # Must be byte-for-byte identical to what's registered in Google
    # Cloud Console and to what's sent in the token exchange - built from
    # BACKEND_PUBLIC_URL so it's automatically correct per environment
    # instead of a second place to keep in sync (see config.py).
    return f"{settings.BACKEND_PUBLIC_URL}{API_V1_PREFIX}/auth/google/callback"


@router.get("/login")
@guard_deco.rate_limit(requests=LOGIN_IP_LIMIT, window=LOGIN_WINDOW_SECONDS)
async def google_login(request: Request):
    state = secrets.token_urlsafe(32)
    authorization_url = google_oauth_service.build_authorization_url(
        redirect_uri=_redirect_uri(), state=state
    )

    response = RedirectResponse(authorization_url, status_code=302)
    response.set_cookie(
        STATE_COOKIE_NAME,
        state,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        # "lax" (not "strict"): this cookie must still be sent when
        # Google redirects the browser back via a top-level GET - a
        # cross-site navigation "strict" would block, but "lax" allows.
        samesite="lax",
        max_age=STATE_COOKIE_MAX_AGE_SECONDS,
        # Must match where this router is actually mounted. A browser
        # only returns a cookie to paths under its Path attribute, so a
        # bare "/auth/google" is never sent to the real callback at
        # /api/v1/auth/google/callback - state validation then fails and
        # sign-in breaks, while every server-side test that sets the
        # cookie directly still passes.
        path=STATE_COOKIE_PATH,
    )
    return response


@router.get("/callback")
async def google_callback(
    request: Request,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    session: Session = Depends(get_session),
):
    login_page = f"{settings.FRONTEND_URL}/login"
    cookie_state = request.cookies.get(STATE_COOKIE_NAME)

    def _failure(
        reason: str, error_code: str = "google_auth_failed"
    ) -> RedirectResponse:
        logger.warning("Google OAuth callback failed: %s", reason)
        response = RedirectResponse(f"{login_page}?error={error_code}", 302)
        response.delete_cookie(STATE_COOKIE_NAME, path=STATE_COOKIE_PATH)
        return response

    # Google itself reports a failure (most commonly the user clicking
    # "Cancel" on the consent screen) rather than redirecting with a code
    # - this is an expected outcome, not a server error.
    if error is not None:
        return _failure(f"Google returned error={error}")

    if not code or not state:
        return _failure("missing code or state")

    # Constant-time comparison isn't needed here (unlike a password hash
    # check) - state is a single-use, 10-minute-lived random token an
    # attacker can't have observed, so a timing side-channel reveals
    # nothing exploitable.
    if not cookie_state or state != cookie_state:
        return _failure("state mismatch (missing/expired cookie or CSRF attempt)")

    try:
        token_data = await google_oauth_service.exchange_code_for_token(
            code=code, redirect_uri=_redirect_uri()
        )
        userinfo = await google_oauth_service.fetch_userinfo(token_data["access_token"])
    except GoogleOAuthError:
        logger.exception("Google OAuth exchange failed")
        return _failure("token exchange or userinfo request failed")

    try:
        user = get_or_create_oauth_user(
            session,
            provider=OAUTH_PROVIDER,
            oauth_id=userinfo["id"],
            email=userinfo["email"],
            email_verified=bool(userinfo.get("verified_email")),
        )
    except OAuthEmailConflictError as e:
        return _failure(str(e), error_code="email_already_registered")

    # An OAuth login must respect the same account-state rules a
    # password login does - see utils/security.py's authenticate_user,
    # which this mirrors rather than reuses (that one also checks a
    # password, which doesn't apply here).
    if user.deleted_at is not None or user.banned_at is not None:
        return _failure(f"account is deleted or banned (user {user.id})")

    access_token = create_access_token(data={"sub": user.email, "purpose": "access"})
    response = RedirectResponse(f"{settings.FRONTEND_URL}/account", status_code=302)
    set_auth_cookie(response, access_token)
    response.delete_cookie(STATE_COOKIE_NAME, path=STATE_COOKIE_PATH)
    return response
