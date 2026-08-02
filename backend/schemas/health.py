from datetime import datetime
from typing import Literal

from pydantic import BaseModel

# "not_configured" is distinct from "unhealthy" - some services (Kafka,
# in envs that don't set KAFKA_BOOTSTRAP_SERVERS) are deliberately
# optional, see config.py's own comment on that default. An unconfigured
# service should never drag the overall status down to "degraded".
ServiceStatus = Literal["healthy", "unhealthy", "not_configured"]
OverallStatus = Literal["healthy", "degraded", "down"]


class ServiceHealth(BaseModel):
    status: ServiceStatus
    detail: str | None = None


class HealthResponse(BaseModel):
    status: OverallStatus
    checked_at: datetime
    services: dict[str, ServiceHealth]
