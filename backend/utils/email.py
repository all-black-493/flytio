import resend
from pydantic import EmailStr
from resend.exceptions import ResendError

from backend.config import settings
from backend.utils.email_templates import email_shell, paragraphs_html
from backend.utils.log_manager import get_app_logger

logger = get_app_logger(__name__)

resend.api_key = settings.RESEND_API_KEY

# Once a domain is verified in Resend, you can send from any address at
# it with no further per-address setup (confirmed against Resend's own
# docs) - so rather than one blanket sender for every email, each kind of
# email goes out under the address that actually fits its purpose.
SENDER_WELCOME = f"hello@{settings.MAIL_DOMAIN}"
SENDER_TRANSACTIONAL = f"noreply@{settings.MAIL_DOMAIN}"
SENDER_BOOKINGS = f"bookings@{settings.MAIL_DOMAIN}"
SENDER_SUPPORT = f"support@{settings.MAIL_DOMAIN}"


async def _send(
    subject: str,
    recipients: list[EmailStr],
    html: str,
    from_address: str,
    reply_to: str | None = None,
) -> None:
    """Every outbound email goes through here. Not wrapped in try/except -
    callers already treat a failed send as non-fatal to whatever operation
    triggered it (see e.g. crud/payments.py's _complete_booking, which logs
    and moves on rather than letting a bad email undo an already-completed
    booking); catching here too would just hide the same failure twice."""
    payload = {
        "from": f"{settings.MAIL_FROM_NAME} <{from_address}>",
        "to": [str(r) for r in recipients],
        "subject": subject,
        "html": html,
    }
    if reply_to:
        payload["reply_to"] = reply_to
    try:
        response = await resend.Emails.send_async(payload)
        logger.info("Sent email %r to %s (id=%s)", subject, recipients, response["id"])
    except ResendError as e:
        logger.error(
            "Resend send failed for %r to %s: %s (%s)",
            subject,
            recipients,
            e.message,
            e.code,
        )
        raise


async def send_email_async(
    subject: str,
    recipients: list[EmailStr],
    body_text: str,
    from_address: str = SENDER_TRANSACTIONAL,
):
    inner = f"<h2 style='margin:0 0 16px;font-size:18px;'>{subject}</h2>{paragraphs_html(body_text)}"
    html = email_shell(preheader=subject, inner_html=inner)
    await _send(subject, recipients, html, from_address)


async def send_html_email_async(
    subject: str,
    recipients: list[EmailStr],
    html_body: str,
    from_address: str = SENDER_TRANSACTIONAL,
    reply_to: str | None = None,
):
    """Sends `html_body` as-is, unlike send_email_async which wraps plain
    text in a fixed template - for callers building their own full HTML
    (e.g. utils/email_templates.py's booking confirmation manifest).
    `reply_to` lets a reply from the recipient's mail client go straight
    to a different address than `from_address` - used by the support
    contact form so support@ can hit reply and land in the customer's
    inbox, not its own."""
    await _send(subject, recipients, html_body, from_address, reply_to=reply_to)
