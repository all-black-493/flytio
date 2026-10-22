"""Router-level tests for the scheduled-work endpoints (routers/jobs.py).

The sweep itself is covered by test_departure_reminders.py; what matters
here is that nothing can trigger it without the shared secret, and that
an unconfigured secret refuses rather than runs.
"""

import pytest

import backend.routers.jobs as jobs_module
from backend.utils.constants import API_V1_PREFIX, DEPARTURE_REMINDERS_PATH

URL = f"{API_V1_PREFIX}{DEPARTURE_REMINDERS_PATH}"
SECRET = "a-long-random-scheduler-secret"


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(jobs_module.settings, "CRON_SECRET", SECRET)


@pytest.fixture
def swept(monkeypatch):
    """Records invocations so a test can tell "ran" from "refused"."""
    calls = []

    async def _fake_sweep() -> int:
        calls.append(True)
        return 2

    monkeypatch.setattr(jobs_module, "send_due_departure_reminders", _fake_sweep)
    return calls


def test_correct_secret_runs_the_sweep(api_client, configured, swept):
    response = api_client.post(URL, headers={"Authorization": f"Bearer {SECRET}"})

    assert response.status_code == 200
    # Returned so the scheduler's logs can tell a working sweep from a
    # silent one.
    assert response.json() == {"sent": 2}
    assert len(swept) == 1


@pytest.mark.parametrize(
    "headers",
    [
        pytest.param({}, id="no header"),
        pytest.param({"Authorization": "Bearer wrong"}, id="wrong secret"),
        pytest.param({"Authorization": SECRET}, id="missing bearer scheme"),
        pytest.param({"Authorization": f"Basic {SECRET}"}, id="wrong scheme"),
    ],
)
def test_the_sweep_does_not_run_without_the_secret(
    api_client, configured, swept, headers
):
    assert api_client.post(URL, headers=headers).status_code == 401
    assert not swept


def test_an_unconfigured_secret_refuses_rather_than_running(
    api_client, monkeypatch, swept
):
    monkeypatch.setattr(jobs_module.settings, "CRON_SECRET", "")

    response = api_client.post(URL, headers={"Authorization": "Bearer anything"})

    assert response.status_code == 503
    assert not swept


def test_the_endpoint_is_exempt_from_the_fail_secure_guard():
    """guard_core answers 500 to everything when Redis is unreachable.

    A sweep that 500s is a reminder nobody receives, silently.
    """
    from backend.utils.guard import security_config

    assert URL in security_config.exclude_paths
