from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from pydantic import EmailStr

from backend.config import settings
from backend.utils.email_templates import email_shell, paragraphs_html

conf = ConnectionConfig(
    MAIL_USERNAME=settings.MAIL_USERNAME,
    MAIL_PASSWORD=settings.MAIL_PASSWORD,
    MAIL_FROM=settings.MAIL_FROM,
    MAIL_FROM_NAME=settings.MAIL_FROM_NAME,
    MAIL_PORT=settings.MAIL_PORT,
    MAIL_SERVER=settings.MAIL_SERVER,
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False,
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True,
)


async def send_email_async(subject: str, recipients: list[EmailStr], body_text: str):
    inner = f"<h2 style='margin:0 0 16px;font-size:18px;'>{subject}</h2>{paragraphs_html(body_text)}"
    html = email_shell(preheader=subject, inner_html=inner)

    message = MessageSchema(
        subject=subject, recipients=recipients, body=html, subtype=MessageType.html
    )

    fm = FastMail(conf)

    await fm.send_message(message)


async def send_html_email_async(
    subject: str, recipients: list[EmailStr], html_body: str
):
    """Sends `html_body` as-is, unlike send_email_async which wraps plain
    text in a fixed template - for callers building their own full HTML
    (e.g. utils/email_templates.py's booking confirmation manifest)."""
    message = MessageSchema(
        subject=subject, recipients=recipients, body=html_body, subtype=MessageType.html
    )
    fm = FastMail(conf)
    await fm.send_message(message)
