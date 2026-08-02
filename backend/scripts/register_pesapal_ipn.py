"""One-off setup: registers flyt's IPN URL with Pesapal and prints the
resulting ipn_id to paste into backend/.env as PESAPAL_IPN_ID.

Run once per environment (sandbox/live) after PESAPAL_CONSUMER_KEY/SECRET
are set:

    python -m backend.scripts.register_pesapal_ipn

Checks GetIpnList first and reuses an existing registration for this exact
URL if one's already there - RegisterIPN itself has no such check and
mints a brand new ipn_id (and a new entry in the merchant dashboard) on
every call, so re-running this script naively would accumulate duplicates.

Registers as POST - the conventional choice for a webhook with side
effects (GET requests are more prone to being cached, prefetched, or
followed by crawlers/scanners, none of which should re-trigger a payment
reconciliation). The /payments/ipn route itself accepts either method
regardless, so this is a preference, not a hard requirement.

BACKEND_PUBLIC_URL must be reachable from the public internet for Pesapal
to actually deliver IPN calls later (use ngrok/cloudflared for local
testing) - but registration itself will succeed even if it isn't, since
Pesapal doesn't verify reachability at registration time.
"""

import asyncio

from backend.config import settings
from backend.utils.constants import API_V1_PREFIX
from backend.external_services.payment import pesapal_payment_service


async def main() -> None:
    backend_url = settings.BACKEND_PUBLIC_URL
    ipn_url = f"{backend_url.rstrip('/')}{API_V1_PREFIX}/payments/ipn"

    existing = await pesapal_payment_service.get_registered_ipns()
    match = next((ipn for ipn in existing if ipn.url == ipn_url), None)

    if match:
        ipn_id = match.ipn_id
        print(f"Already registered: {ipn_url} (created {match.created_date})")
    else:
        response = await pesapal_payment_service.register_ipn(ipn_url, "POST")
        ipn_id = response.ipn_id
        print(f"Registered IPN URL: {ipn_url}")

    await pesapal_payment_service.aclose()

    print(f"ipn_id: {ipn_id}")
    print("\nAdd this to backend/.env:")
    print(f"PESAPAL_IPN_ID={ipn_id}")


if __name__ == "__main__":
    asyncio.run(main())
