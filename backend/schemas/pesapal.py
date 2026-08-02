"""Pesapal API v3.0 (JSON) request/response schemas. Field names follow
Pesapal's wire format exactly. See
https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json
for the source of truth.
"""

from pydantic import BaseModel, ConfigDict, Field


class PesapalBaseSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")


class PesapalAuthResponse(PesapalBaseSchema):
    """Response from POST /Auth/RequestToken. `token` is valid for 5
    minutes - see external_services/payment.py's token caching."""

    token: str
    expiryDate: str
    error: dict | None = None
    status: str
    message: str


class PesapalBillingAddress(PesapalBaseSchema):
    """At least one of email_address/phone_number is required by Pesapal;
    built from the primary (first) passenger on checkout."""

    email_address: str | None = None
    phone_number: str | None = None
    country_code: str | None = Field(default=None, description="2-letter ISO 3166-1")
    first_name: str | None = None
    last_name: str | None = None


class PesapalRegisterIpnResponse(PesapalBaseSchema):
    """Response from POST /URLSetup/RegisterIPN."""

    url: str
    created_date: str
    ipn_id: str
    ipn_notification_type_description: str | None = None
    ipn_status_description: str | None = None
    error: dict | None = None
    status: str


class PesapalRegisteredIpn(PesapalBaseSchema):
    """One entry from GET /URLSetup/GetIpnList - note this endpoint
    returns a bare array of these, not wrapped in an envelope."""

    url: str
    created_date: str
    ipn_id: str


class PesapalSubmitOrderRequest(PesapalBaseSchema):
    """Body for POST /Transactions/SubmitOrderRequest."""

    id: str = Field(max_length=50, description="Our merchant_reference")
    currency: str
    amount: float
    description: str = Field(max_length=100)
    callback_url: str
    cancellation_url: str | None = None
    notification_id: str = Field(description="Our registered IPN id")
    billing_address: PesapalBillingAddress


class PesapalSubmitOrderResponse(PesapalBaseSchema):
    order_tracking_id: str
    merchant_reference: str
    redirect_url: str
    error: dict | None = None
    status: str


class PesapalRefundResponse(PesapalBaseSchema):
    """Response from POST /Transactions/RefundRequest.

    `status` is a *string* here ("200" accepted, "500" rejected), not the
    HTTP status - Pesapal returns HTTP 200 either way, so the body is the
    only place a rejection shows up. And an accepted refund is only
    queued for Pesapal's finance team to approve; there's no callback or
    lookup endpoint to find out whether it was ultimately paid.
    """

    status: str | None = None
    message: str | None = None
    error: dict | None = None


class PesapalTransactionStatusResponse(PesapalBaseSchema):
    """Response from GET /Transactions/GetTransactionStatus."""

    payment_method: str | None = None
    amount: float | None = None
    created_date: str | None = None
    confirmation_code: str | None = None
    payment_status_description: str | None = Field(
        default=None, description="INVALID, FAILED, COMPLETED, or REVERSED"
    )
    description: str | None = None
    message: str | None = None
    payment_account: str | None = None
    merchant_reference: str | None = None
    currency: str | None = None
    status_code: int | None = Field(
        default=None, description="0 INVALID, 1 COMPLETED, 2 FAILED, 3 REVERSED"
    )
    payment_status_code: str | None = Field(
        default=None,
        description="A more specific reason than status_code, e.g. "
        "'request_terminated_by_user' - not a documented fixed enum, varies "
        "by processor/channel",
    )
    error: dict | None = None
