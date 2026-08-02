from pydantic import BaseModel, EmailStr, Field


class Token(BaseModel):
    access_token: str
    token_type: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


class ChangePasswordRequest(BaseModel):
    """Self-service change while logged in - distinct from
    ResetPasswordRequest's forgot-password flow, which proves identity via
    a emailed token instead of the current password."""

    current_password: str
    new_password: str = Field(min_length=8)


class DeleteAccountRequest(BaseModel):
    """Requires the current password so a hijacked session (cookie/token
    without the password) can't destroy the account outright."""

    password: str
