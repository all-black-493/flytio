from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic_ai.ui import SSE_CONTENT_TYPE
from pydantic_ai.ui.ag_ui import AGUIAdapter

from backend.external_services import concierge as concierge_service
from backend.external_services.concierge import ConciergeDeps
from backend.models.users import UserInDB
from backend.utils.guard import guard_deco
from backend.utils.security import get_current_user

router = APIRouter(prefix="/concierge", tags=["Concierge"])

# LLM calls cost real money per request - conservative budget, same
# rate-limiting mechanism (fastapi-guard, IP-keyed) as every other
# router, see utils/guard.py.
CHAT_IP_LIMIT = 20
CHAT_WINDOW_SECONDS = 15 * 60


@router.post("/chat")
@guard_deco.rate_limit(requests=CHAT_IP_LIMIT, window=CHAT_WINDOW_SECONDS)
async def chat(
    request: Request,
    current_user: UserInDB = Depends(get_current_user),
):
    """Streams the concierge's reply over the AG-UI protocol as SSE - the
    frontend consumes it with @tanstack/ai-react's useChat, not client.ts's
    usual fetch-and-zod-parse pattern (see ConciergeWidget.tsx).

    AG-UI rather than the Vercel AI SDK protocol because it emits tool
    calls as first-class, individually addressable events with their own
    lifecycle, which is what lets the UI show what the agent is doing
    while it does it (searching flights, and so on) instead of a silent
    pause. Both are pydantic-ai adapters over the same agent, so this is a
    wire-format change only - no agent or tool code moved.

    Auth-required: the concierge is tied to a real traveler, not a public
    anonymous tool."""
    # Accessed via the module (not imported by name) so tests can
    # monkeypatch backend.external_services.concierge.concierge_agent
    # directly, and so this always reflects the module's current state
    # rather than whatever it was at import time.
    agent = concierge_service.concierge_agent
    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The concierge isn't configured yet.",
        )

    accept = request.headers.get("accept", SSE_CONTENT_TYPE)
    run_input = AGUIAdapter.build_run_input(await request.body())
    adapter = AGUIAdapter(agent=agent, run_input=run_input, accept=accept)
    event_stream = adapter.run_stream(deps=ConciergeDeps(user=current_user))
    return StreamingResponse(adapter.encode_stream(event_stream), media_type=accept)
