import types

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import ServiceMembership, User
from bookings.models import Booking, GuestProfile
from orgs.models import GuideService
from trips.models import Trip


@pytest.fixture
def service(db):
    return GuideService.objects.create(name="Alpine Guides", slug="alpine-guides", contact_email="hello@alpine.test")


@pytest.fixture
def owner(db, service):
    user = User.objects.create_user(
        username="owner@example.com",
        email="owner@example.com",
        password="password123",
        first_name="Olivia",
        last_name="Owner",
    )
    ServiceMembership.objects.create(user=user, guide_service=service, role=ServiceMembership.OWNER)
    return user


@pytest.fixture
def trip(db, service):
    return Trip.objects.create(
        guide_service=service,
        title="Summit Push",
        location="Rainier",
        start=timezone.now() + timezone.timedelta(days=10),
        end=timezone.now() + timezone.timedelta(days=12),
        capacity=6,
        price_cents=20000,
    )


@pytest.mark.django_db
def test_owner_creates_booking(monkeypatch, owner, trip):
    client = APIClient()
    client.force_authenticate(owner)

    fake_session = types.SimpleNamespace(
        payment_intent="pi_test",
        id="cs_test",
        payment_status="unpaid",
        url="https://stripe.test/checkout"
    )

    monkeypatch.setattr("trips.api.create_checkout_session", lambda **kwargs: fake_session)
    emails = []

    def fake_send_email(**kwargs):
        emails.append(kwargs)

    monkeypatch.setattr("trips.api.send_booking_confirmation_email", fake_send_email)

    payload = {
        "primary_guest": {
            "email": "guest@example.com",
            "first_name": "Greta",
            "last_name": "Guest",
            "phone": "555-0200",
        },
        "additional_guests": [
            {
                "email": "friend@example.com",
                "first_name": "Frank",
                "last_name": "Friend",
            }
        ],
    }

    response = client.post(f"/api/trips/{trip.id}/bookings/", payload, format="json")
    assert response.status_code == 201

    booking = Booking.objects.get()
    assert booking.party_size == 2
    payment = booking.payments.get()
    assert payment.stripe_checkout_session == "cs_test"
    assert payment.amount_cents == trip.price_cents * 2
    assert len(emails) == 1
    assert sorted(emails[0]["recipients"]) == ["friend@example.com", "guest@example.com"]

    # Guest profiles should be created
    assert GuestProfile.objects.filter(email="guest@example.com").exists()
    assert GuestProfile.objects.filter(email="friend@example.com").exists()


@pytest.mark.django_db
def test_booking_capacity_validation(monkeypatch, owner, trip):
    trip.capacity = 2
    trip.save()

    Booking.objects.create(
        trip=trip,
        primary_guest=GuestProfile.objects.create(email="existing@example.com"),
        party_size=2,
        payment_status=Booking.PAID,
        info_status=Booking.INFO_COMPLETE,
        waiver_status=Booking.WAIVER_SIGNED,
    )

    client = APIClient()
    client.force_authenticate(owner)

    payload = {
        "primary_guest": {
            "email": "new@example.com",
        }
    }

    response = client.post(f"/api/trips/{trip.id}/bookings/", payload, format="json")
    assert response.status_code == 400
    assert "capacity" in response.data["detail"].lower()
