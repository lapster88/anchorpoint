from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
from uuid import uuid4

from django.conf import settings

from bookings.models import Booking
from payments.models import Payment


@dataclass
class CheckoutSessionStub:
    """
    Lightweight stand-in for stripe.checkout.Session when running in stub mode.

    Tests and local development do not hit Stripe; instead, we return predictable
    identifiers so the rest of the booking flow (emails, payment records, links)
    behaves as if Stripe responded.
    """

    id: str
    payment_intent: str
    payment_status: str
    url: str


def build_checkout_preview_url(*, booking: Booking, amount_cents: int, session_id: str) -> str:
    return (
        f"{settings.FRONTEND_URL.rstrip('/')}/payments/preview?"
        f"booking={booking.id}&amount={amount_cents}&session={session_id}"
    )


def _stub_checkout_session(*, booking: Booking, amount_cents: int) -> CheckoutSessionStub:
    session_id = f"cs_test_{uuid4().hex}"
    payment_intent = f"pi_test_{uuid4().hex}"
    preview_url = build_checkout_preview_url(
        booking=booking,
        amount_cents=amount_cents,
        session_id=session_id,
    )
    return CheckoutSessionStub(
        id=session_id,
        payment_intent=payment_intent,
        payment_status="unpaid",
        url=preview_url,
    )


def _get_stripe_api_key() -> Optional[str]:
    key = getattr(settings, "STRIPE_SECRET_KEY", "")
    return key or None


def _should_use_stub() -> bool:
    if getattr(settings, "STRIPE_USE_STUB", False):
        return True
    return _get_stripe_api_key() is None


def create_checkout_session(*, booking: Booking, amount_cents: int):
    """
    Create a Stripe Checkout session (or stub equivalent) for a booking.

    Returns an object with the subset of attributes (`id`, `payment_intent`,
    `payment_status`, `url`) consumed by the booking workflow.
    """

    if _should_use_stub():
        return _stub_checkout_session(booking=booking, amount_cents=amount_cents)

    import stripe

    api_key = _get_stripe_api_key()
    if not api_key:
        raise RuntimeError("Stripe secret key is not configured.")

    stripe.api_key = api_key
    service = booking.trip.guide_service
    stripe_kwargs = {}
    if getattr(service, "billing_stripe_account", ""):
        stripe_kwargs["stripe_account"] = service.billing_stripe_account

    session = stripe.checkout.Session.create(
        mode="payment",
        payment_method_types=["card"],
        line_items=[
            {
                "quantity": 1,
                "price_data": {
                    "currency": "usd",
                    "unit_amount": amount_cents,
                    "product_data": {
                        "name": booking.trip.title,
                    },
                },
            }
        ],
        success_url=f"{settings.FRONTEND_URL}/payment/success?booking={booking.id}",
        cancel_url=f"{settings.FRONTEND_URL}/payment/cancel?booking={booking.id}",
        metadata={
            "booking_id": booking.id,
            "trip_id": booking.trip_id,
            "guide_service_id": booking.trip.guide_service_id,
        },
        **stripe_kwargs,
    )
    return session


def get_latest_payment_preview_url(booking: Booking) -> str | None:
    """
    Recreate the stub preview link from the most recent payment record when Stripe is stubbed.
    """

    if not _should_use_stub():
        return None

    payment: Payment | None = booking.payments.order_by("-created_at").first()
    if not payment or not payment.stripe_checkout_session:
        return None

    return build_checkout_preview_url(
        booking=booking,
        amount_cents=payment.amount_cents,
        session_id=payment.stripe_checkout_session,
    )
