import uuid
from datetime import datetime

from sqlmodel import Session, select

from backend.models.pricing import DiscountCode, PricingSale


def list_pricing_sales(session: Session) -> list[PricingSale]:
    return list(
        session.exec(select(PricingSale).order_by(PricingSale.starts_at.desc())).all()
    )


def _overlapping_sale(
    session: Session, starts_at: datetime, ends_at: datetime
) -> PricingSale | None:
    """Two windows overlap unless one ends before the other starts -
    De Morgan's on that is the query below. Used by create_pricing_sale
    so at most one PricingSale is ever active at a given moment -
    get_active_markup_rate (utils/pricing.py) depends on that being true,
    it doesn't try to pick a "winner" among several."""
    return session.exec(
        select(PricingSale).where(
            PricingSale.starts_at < ends_at, PricingSale.ends_at > starts_at
        )
    ).first()


def create_pricing_sale(
    session: Session,
    *,
    name: str,
    markup_rate: float,
    starts_at: datetime,
    ends_at: datetime,
    created_by: uuid.UUID,
) -> PricingSale:
    if ends_at <= starts_at:
        raise ValueError("ends_at must be after starts_at.")
    overlap = _overlapping_sale(session, starts_at, ends_at)
    if overlap is not None:
        raise ValueError(
            f'Overlaps existing sale "{overlap.name}" '
            f"({overlap.starts_at} - {overlap.ends_at})."
        )
    sale = PricingSale(
        name=name,
        markup_rate=markup_rate,
        starts_at=starts_at,
        ends_at=ends_at,
        created_by_user_id=created_by,
    )
    session.add(sale)
    session.commit()
    session.refresh(sale)
    return sale


def delete_pricing_sale(session: Session, sale_id: uuid.UUID) -> None:
    sale = session.get(PricingSale, sale_id)
    if sale is not None:
        session.delete(sale)
        session.commit()


def list_discount_codes(session: Session) -> list[DiscountCode]:
    return list(
        session.exec(
            select(DiscountCode).order_by(DiscountCode.created_at.desc())
        ).all()
    )


def get_discount_code_by_code(session: Session, code: str) -> DiscountCode | None:
    return session.exec(
        select(DiscountCode).where(DiscountCode.code == code.strip().upper())
    ).first()


def create_discount_code(
    session: Session,
    *,
    code: str,
    discount_percentage: float,
    max_redemptions: int | None,
    expires_at: datetime | None,
    created_by: uuid.UUID,
) -> DiscountCode:
    normalized = code.strip().upper()
    if not normalized:
        raise ValueError("Code cannot be blank.")
    if not (0 < discount_percentage <= 100):
        raise ValueError("discount_percentage must be between 0 and 100.")
    if get_discount_code_by_code(session, normalized) is not None:
        raise ValueError(f'Code "{normalized}" already exists.')

    discount = DiscountCode(
        code=normalized,
        discount_percentage=discount_percentage,
        max_redemptions=max_redemptions,
        expires_at=expires_at,
        created_by_user_id=created_by,
    )
    session.add(discount)
    session.commit()
    session.refresh(discount)
    return discount


def set_discount_code_active(
    session: Session, discount: DiscountCode, is_active: bool
) -> DiscountCode:
    discount.is_active = is_active
    session.add(discount)
    session.commit()
    session.refresh(discount)
    return discount


def validate_discount_code(session: Session, code: str) -> DiscountCode:
    """Looks up and checks a code is currently usable - raises ValueError
    (never HTTPException, same contract as the rest of this app's crud
    layer) with a message safe to show the customer directly. Does NOT
    redeem it - see redeem_discount_code, called separately once a
    booking this code was applied to actually completes."""
    discount = get_discount_code_by_code(session, code)
    if discount is None:
        raise ValueError(f'"{code}" isn\'t a valid discount code.')
    if not discount.is_active:
        raise ValueError(f'"{discount.code}" is no longer active.')
    if discount.expires_at is not None and discount.expires_at < datetime.utcnow():
        raise ValueError(f'"{discount.code}" has expired.')
    if (
        discount.max_redemptions is not None
        and discount.times_redeemed >= discount.max_redemptions
    ):
        raise ValueError(f'"{discount.code}" has already been fully redeemed.')
    return discount


def redeem_discount_code(session: Session, code: str) -> None:
    """Increments times_redeemed - called only from crud/payments.py's
    _complete_booking once a booking actually completes, never at
    checkout-start, so an abandoned checkout never burns a limited code's
    redemption count. Row-locked (a no-op on the SQLite engine unit tests
    use, a real lock on Postgres) since this can race with another
    customer's checkout completing around the same time - a small amount
    of overshoot past max_redemptions under a genuine race is an accepted
    tradeoff here, not worth a distributed-locking scheme for a discount
    code's use-count. Silently does nothing if the code no longer exists
    (deleted between checkout and completion) - this must never fail an
    otherwise-successful booking."""
    discount = session.exec(
        select(DiscountCode).where(DiscountCode.code == code).with_for_update()
    ).first()
    if discount is None:
        return
    discount.times_redeemed += 1
    session.add(discount)
    session.commit()
