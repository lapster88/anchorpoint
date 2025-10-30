import types
from datetime import timedelta

import pytest
import stripe
from django.utils import timezone

from bookings.models import TripParty, GuestProfile
from bookings.services import payments
from orgs.models import GuideService
from trips.models import Trip
from trips.pricing import build_single_tier_snapshot


@pytest.fixture
def trip(db):
    service = GuideService.objects.create(
        name="Summit Guides",
        slug="summit-guides",
        contact_email="hello@summit.test",
    )
    start = (timezone.now() + timedelta(days=7)).replace(hour=9, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return Trip.objects.create(
        guide_service=service,
        title="Glacier Intro",
        location="Mt. Baker",
        start=start,
        end=end,
        timing_mode=Trip.MULTI_DAY,
        duration_days=1,
        pricing_snapshot=build_single_tier_snapshot(18000),
    )


@pytest.fixture
def booking(trip):
    guest = GuestProfile.objects.create(email="guest@example.com")
    return TripParty.objects.create(
        trip=trip,
        primary_guest=guest,
        party_size=1,
        payment_status=TripParty.PENDING,
        info_status=TripParty.INFO_PENDING,
        waiver_status=TripParty.WAIVER_PENDING,
    )


@pytest.mark.django_db
def test_checkout_stub_returns_preview_url(settings, booking):
    settings.STRIPE_USE_STUB = True
    settings.STRIPE_SECRET_KEY = ""
    settings.FRONTEND_URL = "https://app.test"

    session = payments.create_checkout_session(party=booking, amount_cents=5000)

    assert isinstance(session, payments.CheckoutSessionStub)
    assert session.payment_status == "unpaid"
    assert session.id.startswith("cs_test_")
    assert session.payment_intent.startswith("pi_test_")
    assert session.url.startswith("https://app.test/payments/preview?")
    # preview link should include booking id for staff reference
    assert f"booking={booking.id}" in session.url


@pytest.mark.django_db
def test_checkout_uses_stripe_when_configured(monkeypatch, settings, booking):
    settings.STRIPE_USE_STUB = False
    settings.STRIPE_SECRET_KEY = "sk_test_123"
    settings.FRONTEND_URL = "https://app.test"

    captured = {}
    original_api_key = stripe.api_key

    def fake_create(**kwargs):
        captured["kwargs"] = kwargs
        return types.SimpleNamespace(
            id="cs_real_123",
            payment_intent="pi_real_123",
            payment_status="unpaid",
            url="https://stripe.test/checkout/cs_real_123",
        )

    monkeypatch.setattr(stripe.checkout.Session, "create", staticmethod(fake_create))

    try:
        session = payments.create_checkout_session(party=booking, amount_cents=booking.trip.price_cents)
        assert session.id == "cs_real_123"
        assert stripe.api_key == "sk_test_123"
        kwargs = captured["kwargs"]
        assert kwargs["metadata"]["booking_id"] == booking.id
        assert kwargs["line_items"][0]["price_data"]["unit_amount"] == booking.trip.price_cents
        assert kwargs["success_url"].endswith(f"?booking={booking.id}")
    finally:
        stripe.api_key = original_api_key
