"""Single source of truth for env-derived configuration. Every module that
previously called `os.getenv(...)` (and its own `load_dotenv()`) directly
now imports `settings` from here instead - one `.env` load, one place to
see every variable the app needs, and real startup-time validation (a
missing required var now fails immediately instead of silently becoming
`None` and blowing up deep inside a request)."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolved relative to this file rather than the process cwd - the app is
# run with different working directories depending on context (Docker's
# WORKDIR is /backend, but e.g. the pytest pre-commit hook runs from the
# repo root), and a cwd-relative path silently fails to find .env in some
# of them.
_ENV_FILE = Path(__file__).resolve().parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")

    # Database
    DATABASE_URL: str

    # Redis cache
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379

    # Duffel (flights + payments)
    DUFFEL_API_TOKEN: str

    # CORS - comma-separated origins allowed to hit the API with credentials
    CORS_ORIGINS: str = ""

    # Outbound mail (Resend). MAIL_DOMAIN must be verified in the Resend
    # dashboard - once it is, Resend lets you send from *any* address at
    # that domain with no further per-address setup (see utils/email.py's
    # named senders - hello@, noreply@, bookings@ - all built from this).
    RESEND_API_KEY: str
    MAIL_DOMAIN: str
    MAIL_FROM_NAME: str = "flyt.io"

    # Auth
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int

    # Auth cookie - COOKIE_DOMAIN unset locally (host-only cookie already
    # spans ports on localhost); in production set it to the shared parent
    # domain (e.g. "flyt.io") so the cookie is visible to both the frontend
    # and API subdomains.
    COOKIE_DOMAIN: str | None = None
    COOKIE_SECURE: bool = True

    # Pesapal (customer payment collection) - sign up for a sandbox
    # merchant account at developer.pesapal.com to get these. PESAPAL_ENV
    # selects the base URL ("sandbox" -> cybqa.pesapal.com, "live" ->
    # pay.pesapal.com). PESAPAL_IPN_ID is produced once per environment by
    # running `python -m backend.scripts.register_pesapal_ipn` after the
    # rest of these are set.
    PESAPAL_CONSUMER_KEY: str
    PESAPAL_CONSUMER_SECRET: str
    PESAPAL_ENV: str = "sandbox"
    PESAPAL_IPN_ID: str = ""

    # Public URLs - FRONTEND_URL builds links handed to users (password
    # reset, booking confirmation, Pesapal's redirect back into the app);
    # BACKEND_PUBLIC_URL builds URLs handed to external services that need
    # to reach us (Pesapal's IPN webhook, the itinerary PDF link in
    # emails). Both must be real public domains in production - Pesapal's
    # servers in particular can't reach localhost, so BACKEND_PUBLIC_URL
    # needs ngrok/cloudflared for local testing.
    FRONTEND_URL: str = "http://localhost:3000"
    BACKEND_PUBLIC_URL: str = "http://localhost:8000"


settings = Settings()
