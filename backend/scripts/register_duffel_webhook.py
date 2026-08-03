"""One-off setup: registers flyt's webhook URL with Duffel and prints the
resulting secret to paste into backend/.env as DUFFEL_WEBHOOK_SECRET.

Run once per environment (test/live) after DUFFEL_API_TOKEN is set:

    python -m backend.scripts.register_duffel_webhook

Duffel allows exactly ONE webhook per organisation per mode, so re-running
this against an environment that already has one fails outright with:

    Field 'identity_organisation_id' a webhook for this organisation and
    mode already exists

That is a guardrail, not a problem: duplicate deliveries are impossible.
But it does mean rotating the secret is delete-then-create, never
create-then-swap - there is no way to have the old and new endpoint
coexist, and the secret is shown exactly once at creation, with no call
to read it back.

To inspect or remove what is already registered:

    GET    https://api.duffel.com/air/webhooks          # id, url, events
    DELETE https://api.duffel.com/air/webhooks/{id}

both with `Duffel-Version: v2` and a Bearer DUFFEL_API_TOKEN.

BACKEND_PUBLIC_URL must be reachable from the public internet for Duffel
to actually deliver webhooks later (use ngrok/cloudflared for local
testing) - registration itself succeeds regardless, since Duffel doesn't
verify reachability at registration time.
"""

import asyncio

from backend.config import settings
from backend.utils.constants import API_V1_PREFIX
from backend.external_services.flight import duffel_flight_service

# The only event this app's webhook receiver (routers/webhooks.py) knows
# how to handle today - see _HANDLED_EVENT_TYPES there.
EVENTS = ["order.airline_initiated_change_detected"]


async def main() -> None:
    backend_url = settings.BACKEND_PUBLIC_URL
    webhook_url = f"{backend_url.rstrip('/')}{API_V1_PREFIX}/webhooks/duffel"

    response = await duffel_flight_service.create_webhook(webhook_url, EVENTS)
    await duffel_flight_service.aclose()

    data = response["data"]
    print(f"Registered webhook: {data['url']} for events {data['events']}")
    # The id is printed because it is the only handle Duffel gives you for
    # this endpoint afterwards - pinging it (POST /air/webhooks/id/{id}/
    # actions/ping) and deleting it both need it, and the creation
    # response is the one place it is handed over. There is no documented
    # "list my webhooks" call to recover it from later.
    print(f"Webhook id:         {data['id']}")
    print("\nSave BOTH of these now - the secret is shown exactly once:")
    print(f"DUFFEL_WEBHOOK_SECRET={data['secret']}")
    print(
        f"\nTest it reaches you:\n"
        f"  curl -X POST 'https://api.duffel.com/air/webhooks/id/{data['id']}/actions/ping' \\\n"
        f"    -H 'Accept: application/json' -H 'Content-Type: application/json' \\\n"
        f"    -H 'Duffel-Version: v2' -H \"Authorization: Bearer $DUFFEL_API_TOKEN\" -d '{{}}'"
    )


if __name__ == "__main__":
    asyncio.run(main())
