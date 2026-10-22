"""Scheduled work, triggered by a scheduler rather than by a user.

A function is the app, so there is no process to hold a timer in. The
departure sweep therefore becomes an HTTP endpoint that something
external calls on a schedule: Upstash QStash every fifteen minutes, which
is where the interval in crud/reminders.py comes from.

Authentication is a shared secret presented as `Authorization: Bearer
<CRON_SECRET>`. That is Vercel Cron's own convention, chosen so the
scheduler can be swapped for Vercel Cron - which sends exactly this
header - without touching the endpoint. QStash sends it as
`Upstash-Forward-Authorization`, which arrives here as `Authorization`.

The sweep is safe to call more often than scheduled, and safe to call
concurrently: crud/reminders.py claims each leg with a conditional UPDATE
before anything is sent.
"""

import hmac

from fastapi import APIRouter, Header, HTTPException, status

from backend.config import settings
from backend.utils.constants import DEPARTURE_REMINDERS_PATH, JOBS_PREFIX
from backend.utils.log_manager import get_app_logger
from backend.workers.reminders import send_due_departure_reminders

logger = get_app_logger(__name__)

router = APIRouter(prefix=JOBS_PREFIX, tags=["Jobs"])


def _authorise(authorization: str | None) -> None:
    if not settings.CRON_SECRET:
        # Refuse rather than run: an unauthenticated sweep is a way to
        # send a traveller the same email repeatedly.
        logger.error("CRON_SECRET is not set - refusing to run scheduled work")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Scheduled work is not configured",
        )

    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not hmac.compare_digest(
        token, settings.CRON_SECRET
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)


@router.post(DEPARTURE_REMINDERS_PATH.removeprefix(JOBS_PREFIX))
async def run_departure_reminder_sweep(
    authorization: str | None = Header(default=None),
) -> dict[str, int]:
    """One sweep. Returns how many legs were reminded, for the scheduler's
    own logs - it has no other way to tell a working sweep from a silent
    one."""
    _authorise(authorization)
    return {"sent": await send_due_departure_reminders()}
