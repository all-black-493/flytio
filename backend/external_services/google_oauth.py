from urllib.parse import urlencode

import httpx

from backend.config import settings

# openid isn't actually used (routers/oauth.py reads the userinfo
# response, not the id_token Google also returns) - requested anyway
# since asking for email+profile without it is the unusual case, not the
# expected one, and some Google API surfaces are stricter about scope
# combinations than others.
GOOGLE_SCOPES = "openid email profile"


class GoogleOAuthError(Exception):
    """Raised when Google's token or userinfo endpoint returns an error,
    or an unexpected (missing required field) response."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class GoogleOAuthService:
    """Google's OAuth2 Authorization Code flow over plain REST with
    httpx, called from routers/oauth.py. Google's own Python SDKs
    (google-auth, google-auth-oauthlib) are built around this exact same
    flow with far more surface area than a login-only integration needs
    - same reasoning as external_services/flight.py's raw-httpx choice
    over Duffel's SDK."""

    def __init__(self):
        self.client_id = settings.GOOGLE_CLIENT_ID
        self.client_secret = settings.GOOGLE_CLIENT_SECRET
        self.auth_url = settings.GOOGLE_AUTH_URL
        self.token_url = settings.GOOGLE_TOKEN_URL
        self.userinfo_url = settings.GOOGLE_USERINFO_URL
        self._client: httpx.AsyncClient | None = None

    @property
    def client(self) -> httpx.AsyncClient:
        # Created lazily so the app (and tests) can import this module
        # before Google credentials are configured.
        if self._client is None:
            if not self.client_id or not self.client_secret:
                raise ValueError(
                    "Google OAuth credentials not configured (set "
                    "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)"
                )
            self._client = httpx.AsyncClient(timeout=httpx.Timeout(15.0))
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def build_authorization_url(self, *, redirect_uri: str, state: str) -> str:
        """The URL routers/oauth.py's /login redirects the browser to -
        never called by the backend itself, so this doesn't need the
        httpx client (and works even before it's configured, to fail
        with a clearer error later at the actual API calls)."""
        params = {
            "client_id": self.client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": GOOGLE_SCOPES,
            "state": state,
        }
        return f"{self.auth_url}?{urlencode(params)}"

    async def exchange_code_for_token(self, *, code: str, redirect_uri: str) -> dict:
        """Server-to-server exchange of the one-time authorization code
        for an access token - the redirect_uri passed here must be
        byte-for-byte identical to the one used to build the
        authorization URL, per the OAuth2 spec (it's re-validated here as
        an anti-tampering check, not just routing)."""
        response = await self.client.post(
            self.token_url,
            data={
                "code": code,
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Accept": "application/json"},
        )
        if response.is_error:
            raise GoogleOAuthError(
                f"Google token exchange failed (HTTP {response.status_code}): "
                f"{response.text}"
            )
        data = response.json()
        if "access_token" not in data:
            raise GoogleOAuthError("Google token response missing access_token")
        return data

    async def fetch_userinfo(self, access_token: str) -> dict:
        """Returns Google's userinfo v2 shape: id, email, verified_email,
        name, given_name, family_name, picture, locale. `id` (not email)
        is the stable identifier - see models/users.py's oauth_id."""
        response = await self.client.get(
            self.userinfo_url,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if response.is_error:
            raise GoogleOAuthError(
                f"Google userinfo request failed (HTTP {response.status_code}): "
                f"{response.text}"
            )
        data = response.json()
        if "id" not in data or "email" not in data:
            raise GoogleOAuthError("Google userinfo response missing id or email")
        return data


google_oauth_service = GoogleOAuthService()
