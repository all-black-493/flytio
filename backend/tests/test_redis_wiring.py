"""Every Redis client must come from settings.redis_url.

REDIS_HOST/REDIS_PORT fall back to localhost, so a client built from them
connects to nothing once Redis is a managed endpoint configured as a
single URL - and does it quietly, because the health check uses a
different client and still reports healthy.
"""

import ast
from pathlib import Path
from urllib.parse import urlparse

from backend.config import settings

BACKEND = Path(__file__).resolve().parents[1]
EXCLUDED = {"tests", "alembic"}


def _application_sources() -> list[Path]:
    return [
        path
        for path in BACKEND.rglob("*.py")
        if not EXCLUDED & set(parts := set(path.relative_to(BACKEND).parts))
        and not any(part.startswith(".") for part in parts)
    ]


def _builds_redis_from_host(source: str) -> bool:
    """A Redis(...) call passing host=. AST, so comments and strings do
    not count - external_services/cache.py documents the wrong form in a
    comment, which is not a use of it."""
    for node in ast.walk(ast.parse(source)):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", "")
        if name != "Redis":
            continue
        if any(kw.arg == "host" for kw in node.keywords):
            return True
    return False


def test_the_pubsub_client_agrees_with_the_configured_url():
    from backend.utils.redis_client import redis

    expected = urlparse(settings.redis_url)
    actual = redis.connection_pool.connection_kwargs

    assert actual.get("host") == (expected.hostname or "localhost")
    assert actual.get("port") == (expected.port or 6379)


def test_no_module_builds_a_redis_client_from_host_and_port():
    offenders = sorted(
        str(path.relative_to(BACKEND))
        for path in _application_sources()
        if _builds_redis_from_host(path.read_text())
    )
    assert not offenders, f"build these from settings.redis_url: {offenders}"
