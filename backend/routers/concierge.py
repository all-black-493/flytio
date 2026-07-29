from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic_ai.ui import SSE_CONTENT_TYPE
from pydantic_ai.ui.vercel_ai import VercelAIAdapter

from backend.external_services.concierge import ConciergeDeps, concierge_agent
from backend.models.users import UserInDB
from backend.utils.guard import guard_deco
from backend.utils.security import get_current_user

router = APIRouter(prefix="/concierge")

# LLM calls cost real money per request - conservative budget, same
# rate-limiting mechanism (fastapi-guard, IP-keyed) as every other
# router, see utils/guard.py.
CHAT_IP_LIMIT = 20
CHAT_WINDOW_SECONDS = 15 * 60

# The AI SDK npm package installed on the frontend (see package.json) -
# the wire protocol version must match what VercelAIAdapter encodes,
# not pydantic-ai's own default (5).
AI_SDK_VERSION = 7


@router.post("/chat")
@guard_deco.rate_limit(requests=CHAT_IP_LIMIT, window=CHAT_WINDOW_SECONDS)
async def chat(
    request: Request,
    current_user: UserInDB = Depends(get_current_user),
):
    """Streams the concierge's reply using the Vercel AI SDK wire
    protocol - the frontend consumes this via @ai-sdk/react's useChat,
    not client.ts's usual fetch-and-zod-parse pattern (see
    ConciergeWidget.tsx). Auth-required: the concierge is tied to a real
    traveler, not a public anonymous tool."""
    if concierge_agent is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The concierge isn't configured yet.",
        )

    accept = request.headers.get("accept", SSE_CONTENT_TYPE)
    run_input = VercelAIAdapter.build_run_input(await request.body())
    adapter = VercelAIAdapter(
        agent=concierge_agent,
        run_input=run_input,
        accept=accept,
        sdk_version=AI_SDK_VERSION,
    )
    event_stream = adapter.run_stream(deps=ConciergeDeps(user=current_user))
    return StreamingResponse(adapter.encode_stream(event_stream), media_type=accept)
