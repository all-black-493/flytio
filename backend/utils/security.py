from passlib.context import CryptContext
from fastapi.security import OAuth2PasswordBearer
from datetime import datetime, timedelta, timezone
import jwt
from sqlmodel import Session, select
from backend.config import settings
from backend.models.users import UserInDB
from fastapi import Depends, HTTPException, Request, Response, status
from jwt.exceptions import InvalidTokenError
from backend.crud.db import get_session

# auto_error=False so requests authenticated purely via cookie don't get
# rejected by this dependency before get_token() has a chance to fall back
# to the cookie - see get_token() below.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES
SECRET_KEY = settings.SECRET_KEY

COOKIE_NAME = "flyt_token"
# Unset (None) locally, since a host-only cookie already spans ports on
# localhost. In production this must be the shared parent domain (e.g.
# "flyt.io") so the cookie is visible to both the frontend and API
# subdomains.
COOKIE_DOMAIN = settings.COOKIE_DOMAIN
COOKIE_SECURE = settings.COOKIE_SECURE

PASSWORD_RESET_TOKEN_EXPIRE_MINUTES = 30


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str | None) -> bool:
    # A Google-only account (models/users.py's UserInDB.password) has no
    # password hash to check against - passlib's verify() raises on None
    # rather than just returning False, so this must be checked first
    # rather than letting every one of this function's callers do it.
    if hashed_password is None:
        return False
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    data_to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=int(ACCESS_TOKEN_EXPIRE_MINUTES))
    # "iat" lets get_current_user reject tokens issued before a password
    # reset (see UserInDB.password_changed_at) even though they're still
    # validly-signed and unexpired.
    data_to_encode.update({"exp": expire, "iat": now})
    encoded_jwt = jwt.encode(data_to_encode, SECRET_KEY, algorithm=ALGORITHM)

    return encoded_jwt


def create_password_reset_token(email: str) -> str:
    """Short-lived, single-purpose JWT for the forgot-password flow.
    Deliberately NOT a normal access token - see get_current_user's
    `purpose` check, which is what stops this from being usable as a
    login credential if it leaks (e.g. via an email client's link
    prefetching, or a forwarded email)."""
    return create_access_token(
        data={"sub": email, "purpose": "password_reset"},
        expires_delta=timedelta(minutes=PASSWORD_RESET_TOKEN_EXPIRE_MINUTES),
    )


def verify_password_reset_token(token: str) -> str | None:
    """Returns the email the token was issued for, or None if the token
    is invalid, expired, or isn't actually a password-reset token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except InvalidTokenError:
        return None
    if payload.get("purpose") != "password_reset":
        return None
    return payload.get("sub")


def authenticate_user(session: Session, email: str, password: str):
    user = session.exec(select(UserInDB).where(UserInDB.email == email)).first()
    if not user:
        return False
    if not verify_password(password, user.password):
        return False
    # Belt-and-suspenders: a deleted account's email is already scrubbed
    # (crud/users.py's delete_user_account), so this lookup should already
    # miss - this guards the same outcome if that ever isn't true.
    if user.deleted_at is not None:
        return False
    # Unlike deleted_at, a ban never scrubs the email, so this lookup
    # would otherwise succeed normally - this is the only thing actually
    # blocking a banned user's login.
    if user.banned_at is not None:
        return False
    return user


def set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        domain=COOKIE_DOMAIN,
        path="/",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, domain=COOKIE_DOMAIN, path="/", samesite="lax")


def get_token(
    request: Request, header_token: str | None = Depends(oauth2_scheme)
) -> str:
    """Accepts either the httpOnly cookie (browser requests) or an
    Authorization bearer header (Swagger UI's Authorize flow, server-to-server
    calls from the Next.js frontend during SSR). Cookie takes priority since
    it's what real browser traffic uses."""
    token = request.cookies.get(COOKIE_NAME) or header_token
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token


def get_current_user(token: str = Depends(get_token), session=Depends(get_session)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        # Rejects any token that isn't a normal login token - e.g. a
        # password-reset token - even though both are otherwise valid,
        # correctly-signed JWTs. Without this check a leaked reset token
        # would work as a full login credential.
        if email is None or payload.get("purpose") != "access":
            raise credentials_exception

        user = session.exec(select(UserInDB).where(UserInDB.email == email)).first()
        if user is None:
            raise credentials_exception
        if user.deleted_at is not None:
            raise credentials_exception
        if user.banned_at is not None:
            raise credentials_exception

        # A password reset invalidates any access token issued before it -
        # even a still-unexpired one - so a stolen session can't outlive a
        # reset the user made specifically to lock it out.
        issued_at = payload.get("iat")
        if user.password_changed_at is not None and issued_at is not None:
            token_issued_at = datetime.fromtimestamp(
                issued_at, tz=timezone.utc
            ).replace(tzinfo=None)
            # JWT "iat" only has whole-second resolution (PyJWT truncates),
            # while password_changed_at keeps microseconds - truncate it the
            # same way before comparing, otherwise a token minted in the
            # same second as the reset can look "earlier" than the reset
            # purely from rounding, and get wrongly rejected.
            password_changed_at = user.password_changed_at.replace(microsecond=0)
            if token_issued_at < password_changed_at:
                raise credentials_exception
    except InvalidTokenError:
        raise credentials_exception

    return user
