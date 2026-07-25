from typing import Annotated

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    Response,
    status,
)
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session

from backend.config import settings
from backend.crud.db import get_session
from backend.crud.users import create_user, get_user_by_email, update_user_password
from backend.models.users import UserInDB
from backend.schemas.auth import ForgotPasswordRequest, ResetPasswordRequest, Token
from backend.schemas.users import UserCreate, UserRead
from backend.utils.email import send_email_async
from backend.utils.rate_limit import is_rate_limited
from backend.utils.security import (
    authenticate_user,
    clear_auth_cookie,
    create_access_token,
    create_password_reset_token,
    get_current_user,
    set_auth_cookie,
    verify_password_reset_token,
)


router = APIRouter(prefix="/api")

# Fixed-window limits for /forgot-password: per-email guards a specific
# address from being email-bombed; per-IP guards against a sweep across
# many addresses. Applied before the user lookup below so the check fires
# identically whether or not the email is registered - it can't be used to
# distinguish the two.
FORGOT_PASSWORD_EMAIL_LIMIT = 3
FORGOT_PASSWORD_IP_LIMIT = 12
FORGOT_PASSWORD_WINDOW_SECONDS = 15 * 60


@router.post(
    "/register/",
    response_model=UserRead,
)
async def register(
    background_tasks: BackgroundTasks,
    user_in: UserCreate,
    session: Session = Depends(get_session),
):
    user = get_user_by_email(session, user_in.email)
    if user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )
    user = create_user(session, email=user_in.email, password=user_in.password)

    subject = "Welcome to Flyt.io !"
    recipients = [user_in.email]
    body_text = f"Hello {user_in.email},\n\nThank you for registering with us. We are excited to have you on board!"

    background_tasks.add_task(send_email_async, subject, recipients, body_text)
    return user


@router.post("/token")
async def login(
    response: Response,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: Session = Depends(get_session),
) -> Token:
    user = authenticate_user(session, form_data.username, form_data.password)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"sub": user.email, "purpose": "access"})
    set_auth_cookie(response, access_token)
    return Token(access_token=access_token, token_type="bearer")


@router.post("/logout")
async def logout(response: Response):
    clear_auth_cookie(response)
    return {"message": "Logged out"}


@router.get("/me", response_model=UserRead)
async def read_current_user(current_user: UserInDB = Depends(get_current_user)):
    return current_user


@router.post("/forgot-password")
async def forgot_password(
    background_tasks: BackgroundTasks,
    request: ForgotPasswordRequest,
    http_request: Request,
    session: Session = Depends(get_session),
):
    """
    Always returns the same generic acknowledgement whether or not the
    email is registered - the response itself must not reveal which
    emails exist in the system (user enumeration).
    """
    client_ip = http_request.client.host if http_request.client else "unknown"
    if is_rate_limited(
        f"ratelimit:forgot-password:email:{request.email}",
        limit=FORGOT_PASSWORD_EMAIL_LIMIT,
        window_seconds=FORGOT_PASSWORD_WINDOW_SECONDS,
    ) or is_rate_limited(
        f"ratelimit:forgot-password:ip:{client_ip}",
        limit=FORGOT_PASSWORD_IP_LIMIT,
        window_seconds=FORGOT_PASSWORD_WINDOW_SECONDS,
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )

    user = get_user_by_email(session, request.email)
    if user:
        frontend_url = settings.FRONTEND_URL
        reset_token = create_password_reset_token(user.email)
        reset_link = f"{frontend_url}/reset-password?token={reset_token}"

        subject = "Reset your Flyt.io password"
        body_text = (
            f"Hello {user.email},\n\nSomeone requested a password reset for this "
            f"account. Use the link below to choose a new password - it expires "
            f"in 30 minutes:\n\n{reset_link}\n\nIf you didn't request this, you "
            f"can safely ignore this email."
        )
        background_tasks.add_task(send_email_async, subject, [user.email], body_text)

    return {"message": "If that email is registered, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(
    background_tasks: BackgroundTasks,
    request: ResetPasswordRequest,
    session: Session = Depends(get_session),
):
    email = verify_password_reset_token(request.token)
    if email is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link is invalid or has expired.",
        )
    user = get_user_by_email(session, email)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link is invalid or has expired.",
        )
    update_user_password(session, user, request.new_password)

    subject = "Your Flyt.io password was changed"
    body_text = (
        f"Hello {user.email},\n\nYour Flyt.io password was just changed, and any "
        f"devices you were previously signed in on have been signed out. If this "
        f"wasn't you, contact support immediately."
    )
    background_tasks.add_task(send_email_async, subject, [user.email], body_text)

    return {"message": "Password updated - you can now sign in."}
