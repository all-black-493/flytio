"""Regenerates test/fixtures/tokens.json - JWTs minted by the same PyJWT the
Python service signs with, so test/hs256.test.ts proves the Worker accepts
exactly what that service issues and refuses the rest.

  PYTHONPATH=. uv run --project backend python worker/test/token_fixtures.py
"""

import base64
import json
import pathlib
import sys
from datetime import datetime, timedelta, timezone

import jwt

# Not the production key. Test material only; the real one is a Worker secret.
SECRET = "parity-test-secret-not-in-use-anywhere"
ISSUED = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)


def token(secret=SECRET, algorithm="HS256", **overrides) -> str:
    payload = {
        "sub": "traveller@flyt.africa",
        "purpose": "access",
        "iat": ISSUED,
        "exp": ISSUED + timedelta(minutes=60),
    }
    payload.update(overrides)
    return jwt.encode(payload, secret, algorithm=algorithm)


def b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def unsigned() -> str:
    """The alg=none forgery, which PyJWT will not mint - hand-built instead."""
    header = b64(json.dumps({"alg": "none", "typ": "JWT"}).encode())
    payload = b64(
        json.dumps(
            {
                "sub": "traveller@flyt.africa",
                "purpose": "access",
                "iat": int(ISSUED.timestamp()),
                "exp": int((ISSUED + timedelta(minutes=60)).timestamp()),
            }
        ).encode()
    )
    return f"{header}.{payload}."


def main() -> None:
    valid = token()
    head, body, signature = valid.split(".")

    fixtures = {
        "secret": SECRET,
        "issuedAtEpoch": int(ISSUED.timestamp()),
        "expiresAtEpoch": int((ISSUED + timedelta(minutes=60)).timestamp()),
        "valid": valid,
        "passwordReset": token(purpose="password_reset"),
        "expired": token(
            iat=ISSUED - timedelta(days=2), exp=ISSUED - timedelta(days=1)
        ),
        "wrongSecret": token(secret="some-other-key-entirely"),
        # Same key, stronger algorithm: still a refusal, because the Worker
        # pins HS256 rather than trusting the header's `alg`.
        "hs512": token(algorithm="HS512"),
        "unsigned": unsigned(),
        # One flipped character in the payload, signature left untouched.
        "tampered": f"{head}.{body[:-2]}{'aa' if body[-2:] != 'aa' else 'bb'}.{signature}",
        "notAJwt": "definitely-not-a-token",
    }

    out = pathlib.Path(__file__).parent / "fixtures" / "tokens.json"
    out.write_text(json.dumps(fixtures, indent=2) + "\n")
    print(f"wrote {len(fixtures) - 3} tokens", file=sys.stderr)


if __name__ == "__main__":
    main()
