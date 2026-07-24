from passlib.context import CryptContext
from fastapi.security import OAuth2PasswordBearer
from datetime import datetime, timedelta, timezone
import jwt
import os
from sqlmodel import Session, select
from backend.models.users import UserInDB
from fastapi import Depends, HTTPException, Request, Response, status
from jwt.exceptions import InvalidTokenError
from backend.crud.db import get_session

# auto_error=False so requests authenticated purely via cookie don't get
# rejected by this dependency before get_token() has a chance to fall back
# to the cookie - see get_token() below.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = os.getenv("ALGORITHM")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES"))
SECRET_KEY = os.getenv("SECRET_KEY")

COOKIE_NAME = "flyt_token"
# Unset (None) locally, since a host-only cookie already spans ports on
# localhost. In production this must be the shared parent domain (e.g.
# "flyt.io") so the cookie is visible to both the frontend and API
# subdomains.
COOKIE_DOMAIN = os.getenv("COOKIE_DOMAIN") or None
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "true").lower() == "true"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    data_to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=int(ACCESS_TOKEN_EXPIRE_MINUTES)
        )
    data_to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(data_to_encode, SECRET_KEY, algorithm=ALGORITHM)

    return encoded_jwt


def authenticate_user(session: Session, email: str, password: str):
    user = session.exec(select(UserInDB).where(UserInDB.email == email)).first()
    if not user:
        return False
    if not verify_password(password, user.password):
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
        if email is None:
            raise credentials_exception

        user = session.exec(select(UserInDB).where(UserInDB.email == email)).first()
        if user is None:
            raise credentials_exception
    except InvalidTokenError:
        raise credentials_exception

    return user
