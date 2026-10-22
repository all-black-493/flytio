from datetime import datetime
from typing import Literal

from pydantic import BaseModel

# "not_configured" is distinct from "unhealthy": a dependency an
# environment deliberately doesn't have is not an outage, and should never
# drag the overall status down to "degraded". No check reports it since
# Kafka, the only optional dependency, was removed - the distinction is
# kept for the next one.
ServiceStatus = Literal["healthy", "unhealthy", "not_configured"]
OverallStatus = Literal["healthy", "degraded", "down"]


class ServiceHealth(BaseModel):
    status: ServiceStatus
    detail: str | None = None


class HealthResponse(BaseModel):
    status: OverallStatus
    checked_at: datetime
    services: dict[str, ServiceHealth]
