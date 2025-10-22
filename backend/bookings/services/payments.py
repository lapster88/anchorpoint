from __future__ import annotations

import stripe
from django.conf import settings

from bookings.models import Booking


def _get_stripe_api_key() -> str:
    if not settings.STRIPE_SECRET_KEY:
        raise RuntimeError("Stripe secret key is not configured.")
    return settings.STRIPE_SECRET_KEY


def create_checkout_session(*, booking: Booking, amount_cents: int) -> stripe.checkout.Session:
    stripe.api_key = _get_stripe_api_key()
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
