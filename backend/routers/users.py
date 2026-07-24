from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session

from backend.crud.db import get_session
from backend.crud.users import create_user, get_user_by_email
from backend.models.users import UserInDB
from backend.schemas.auth import Token
from backend.schemas.users import UserCreate, UserRead
from backend.utils.email import send_email_async
from backend.utils.security import (
    authenticate_user,
    clear_auth_cookie,
    create_access_token,
    get_current_user,
    set_auth_cookie,
)


router = APIRouter(prefix="/api")


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

    access_token = create_access_token(data={"sub": user.email})
    set_auth_cookie(response, access_token)
    return Token(access_token=access_token, token_type="bearer")


@router.post("/logout")
async def logout(response: Response):
    clear_auth_cookie(response)
    return {"message": "Logged out"}


@router.get("/me", response_model=UserRead)
async def read_current_user(current_user: UserInDB = Depends(get_current_user)):
    return current_user
