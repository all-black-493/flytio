from typing import Annotated

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Response,
    status,
)
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session

from backend.config import settings
from backend.crud.db import get_session
from backend.crud.users import (
    create_user,
    delete_user_account,
    get_user_by_email,
    update_user_password,
)
from backend.models.users import UserInDB
from backend.schemas.auth import (
    ChangePasswordRequest,
    DeleteAccountRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    Token,
)
from backend.schemas.users import UserCreate, UserRead
from backend.utils.constants import KafkaEventTypes, KafkaTopics
from backend.utils.email import send_email_async
from backend.utils.guard import guard_deco
from backend.utils.kafka import kafka_producer
from backend.utils.security import (
    authenticate_user,
    clear_auth_cookie,
    create_access_token,
    create_password_reset_token,
    get_current_user,
    set_auth_cookie,
    verify_password,
    verify_password_reset_token,
)


router = APIRouter()

# Every rate limit in this router is enforced via guard_deco.rate_limit
# (fastapi-guard, IP-keyed - see utils/guard.py) - there is no per-email or
# per-user limiter anymore. fastapi-guard's rate limiter only knows how to
# key by client IP (confirmed from its own source: every check path in
# guard_core's RateLimitCheck resolves to extract_client_ip), so the
# previous per-email guard on login/forgot-password (credential stuffing
# against one account from many different IPs) and the per-user guard on
# change-password/delete-account are gone - a distributed attacker
# spreading requests across many IPs is no longer specifically caught by
# rate limiting alone. That's an accepted trade-off for having exactly one
# rate-limiting mechanism in the app instead of two.
FORGOT_PASSWORD_IP_LIMIT = 12
FORGOT_PASSWORD_WINDOW_SECONDS = 15 * 60

REGISTER_IP_LIMIT = 10
REGISTER_WINDOW_SECONDS = 15 * 60

LOGIN_IP_LIMIT = 30
LOGIN_WINDOW_SECONDS = 15 * 60

RESET_PASSWORD_IP_LIMIT = 20
RESET_PASSWORD_WINDOW_SECONDS = 15 * 60

# change-password/delete-account are authenticated + require the current
# password, so a per-IP limit here is mainly a blunt guard against a
# scripted sweep, not the primary defense (an attacker without the
# password can't get anywhere regardless of volume).
ACCOUNT_ACTION_IP_LIMIT = 10
ACCOUNT_ACTION_WINDOW_SECONDS = 15 * 60


def _password_changed_email(recipient: str) -> tuple[str, str]:
    """Shared by reset-password (forgot-password flow) and change-password
    (self-service) - same notification either way, so whichever path
    wasn't the real owner's doing still gets flagged to them."""
    subject = "Your flyt password was changed"
    body_text = (
        f"Hello {recipient},\n\nYour flyt password was just changed, and any "
        f"devices you were previously signed in on have been signed out. If this "
        f"wasn't you, contact support immediately."
    )
    return subject, body_text


@router.post(
    "/register/",
    response_model=UserRead,
)
@guard_deco.rate_limit(requests=REGISTER_IP_LIMIT, window=REGISTER_WINDOW_SECONDS)
async def register(
    user_in: UserCreate,
    session: Session = Depends(get_session),
):
    user = get_user_by_email(session, user_in.email)
    if user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )
    user = create_user(session, email=user_in.email, password=user_in.password)

    # Fire-and-forget: the welcome email is sent by a separate consumer
    # (backend/workers/kafka_consumer.py), out of the request path.
    kafka_producer.publish_event(
        KafkaTopics.USER_EVENTS,
        KafkaEventTypes.USER_REGISTERED,
        {"user_id": user.id, "email": user.email},
    )
    return user


@router.post("/token")
@guard_deco.rate_limit(requests=LOGIN_IP_LIMIT, window=LOGIN_WINDOW_SECONDS)
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
@guard_deco.rate_limit(
    requests=FORGOT_PASSWORD_IP_LIMIT, window=FORGOT_PASSWORD_WINDOW_SECONDS
)
async def forgot_password(
    background_tasks: BackgroundTasks,
    request: ForgotPasswordRequest,
    session: Session = Depends(get_session),
):
    """
    Always returns the same generic acknowledgement whether or not the
    email is registered - the response itself must not reveal which
    emails exist in the system (user enumeration).
    """
    user = get_user_by_email(session, request.email)
    if user:
        frontend_url = settings.FRONTEND_URL
        reset_token = create_password_reset_token(user.email)
        reset_link = f"{frontend_url}/reset-password?token={reset_token}"

        subject = "Reset your flyt password"
        body_text = (
            f"Hello {user.email},\n\nSomeone requested a password reset for this "
            f"account. Use the link below to choose a new password - it expires "
            f"in 30 minutes:\n\n{reset_link}\n\nIf you didn't request this, you "
            f"can safely ignore this email."
        )
        background_tasks.add_task(send_email_async, subject, [user.email], body_text)

    return {"message": "If that email is registered, a reset link has been sent."}


@router.post("/reset-password")
@guard_deco.rate_limit(
    requests=RESET_PASSWORD_IP_LIMIT, window=RESET_PASSWORD_WINDOW_SECONDS
)
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

    subject, body_text = _password_changed_email(user.email)
    background_tasks.add_task(send_email_async, subject, [user.email], body_text)

    return {"message": "Password updated - you can now sign in."}


@router.post("/change-password")
@guard_deco.rate_limit(
    requests=ACCOUNT_ACTION_IP_LIMIT, window=ACCOUNT_ACTION_WINDOW_SECONDS
)
async def change_password(
    response: Response,
    background_tasks: BackgroundTasks,
    request: ChangePasswordRequest,
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Self-service password change for a logged-in user - distinct from
    /reset-password, which proves identity via an emailed token instead.
    Requires the current password so a hijacked session can't change it
    without knowing it.
    """
    if not verify_password(request.current_password, current_user.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )

    update_user_password(session, current_user, request.new_password)

    # update_user_password bumps password_changed_at, which invalidates
    # every token issued before it - including the one this very request
    # authenticated with (its "iat" is from login time, necessarily
    # earlier). Without reissuing here, the browser's own current session
    # would 401 on its very next request, e.g. immediately re-opening
    # this same form or using any other authenticated feature.
    fresh_token = create_access_token(
        data={"sub": current_user.email, "purpose": "access"}
    )
    set_auth_cookie(response, fresh_token)

    subject, body_text = _password_changed_email(current_user.email)
    background_tasks.add_task(
        send_email_async, subject, [current_user.email], body_text
    )

    return {"message": "Password updated."}


@router.delete("/me")
@guard_deco.rate_limit(
    requests=ACCOUNT_ACTION_IP_LIMIT, window=ACCOUNT_ACTION_WINDOW_SECONDS
)
async def delete_account(
    response: Response,
    request: DeleteAccountRequest,
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Deletes (soft) the current user's own account - requires the current
    password, same reasoning as change-password. Booking/payment history
    is deliberately preserved; see crud/users.py's delete_user_account.
    """
    if not verify_password(request.password, current_user.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password is incorrect.",
        )

    delete_user_account(session, current_user)
    clear_auth_cookie(response)

    return {"message": "Account deleted."}
