"""Signature verification for Duffel's webhook deliveries (routers/
webhooks.py) - see https://duffel.com/docs/guides/receiving-webhooks.
"""

import hashlib
import hmac


def verify_duffel_signature(
    secret: str, raw_body: bytes, signature_header: str
) -> bool:
    """Verifies an X-Duffel-Signature header ("t=<unix_ts>,v1=<hex_hmac>")
    against the RAW request body - must be the exact bytes Duffel sent,
    not a re-serialized/parsed-then-dumped copy, since re-serialization
    can reorder keys or change whitespace and silently break the
    signature. Returns False (never raises) on any malformed input, so a
    garbled or hostile header can't crash the receiver.
    """
    if not secret:
        return False
    try:
        pairs = dict(part.split("=", 1) for part in signature_header.split(","))
        timestamp = pairs["t"]
        provided_signature = pairs["v1"]
    except (KeyError, ValueError):
        return False

    signed_payload = timestamp.encode() + b"." + raw_body
    expected_signature = hmac.new(
        secret.encode(), signed_payload, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(provided_signature, expected_signature)
