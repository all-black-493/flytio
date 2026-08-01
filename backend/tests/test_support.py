"""Router-level tests for the support contact form (routers/support.py) -
uses the shared api_client fixture (conftest.py); email sending itself
is mocked, not exercised against real Resend."""

from backend.routers import support as support_router


def test_contact_support_sends_relay_and_autoreply(api_client, monkeypatch):
    sent = []

    async def fake_send_html_email_async(subject, recipients, html_body, **kwargs):
        sent.append(
            (subject, recipients, kwargs.get("reply_to"), kwargs.get("from_address"))
        )

    monkeypatch.setattr(
        support_router, "send_html_email_async", fake_send_html_email_async
    )

    # _notify_staff_of_support_request opens its own real DB session
    # (background tasks can't reuse Depends(get_session), see its
    # docstring) - not exercised here, same as the email send above.
    async def fake_notify_staff(*args, **kwargs):
        return None

    monkeypatch.setattr(
        support_router, "_notify_staff_of_support_request", fake_notify_staff
    )

    response = api_client.post(
        "/support/contact",
        json={
            "name": "Amelia Earhart",
            "email": "amelia@example.com",
            "subject": "Question about my booking",
            "message": "Can I add a bag to my existing booking?",
            "booking_reference": "ABC123",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "message": "Thanks - we'll get back to you by email shortly."
    }

    assert len(sent) == 2
    relay_subject, relay_recipients, relay_reply_to, _ = sent[0]
    assert relay_subject == "Support: Question about my booking"
    assert relay_recipients == [support_router.SENDER_SUPPORT]
    assert relay_reply_to == "amelia@example.com"

    autoreply_subject, autoreply_recipients, _, autoreply_from = sent[1]
    assert autoreply_subject == "We've received your message"
    assert autoreply_recipients == ["amelia@example.com"]
    assert autoreply_from == support_router.SENDER_SUPPORT


def test_contact_support_rejects_missing_fields(api_client):
    response = api_client.post(
        "/support/contact",
        json={"name": "", "email": "not-an-email", "subject": "", "message": ""},
    )

    assert response.status_code == 422
