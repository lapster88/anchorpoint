import types

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import ServiceMembership, User
from bookings.models import TripParty, GuestProfile
from orgs.models import GuideService
from trips.models import Trip, Assignment
from trips.pricing import build_single_tier_snapshot


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
        pricing_snapshot=build_single_tier_snapshot(20000),
    )


@pytest.fixture
def guide_user(db, service):
    user = User.objects.create_user(
        username="guide@example.com",
        email="guide@example.com",
        password="password123",
        first_name="Gina",
        last_name="Guide",
    )
    ServiceMembership.objects.create(user=user, guide_service=service, role=ServiceMembership.GUIDE)
    return user


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

    response = client.post(f"/api/trips/{trip.id}/parties/", payload, format="json")
    assert response.status_code == 201

    booking = TripParty.objects.get()
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
def test_list_trip_bookings(monkeypatch, owner, trip):
    client = APIClient()
    client.force_authenticate(owner)

    fake_session = types.SimpleNamespace(
        payment_intent="pi_test",
        id="cs_test",
        payment_status="unpaid",
        url="https://stripe.test/checkout"
    )

    monkeypatch.setattr("trips.api.create_checkout_session", lambda **kwargs: fake_session)
    monkeypatch.setattr("trips.api.send_booking_confirmation_email", lambda **kwargs: None)

    payload = {
        "primary_guest": {
            "email": "guest@example.com",
            "first_name": "Greta",
            "last_name": "Guest",
        },
    }

    response = client.post(f"/api/trips/{trip.id}/parties/", payload, format="json")
    assert response.status_code == 201

    list_response = client.get(f"/api/trips/{trip.id}/parties/")
    assert list_response.status_code == 200
    data = list_response.json()["parties"]
    assert len(data) == 1
    booking = data[0]
    assert booking["primary_guest_email"] == "guest@example.com"
    assert booking["party_size"] == 1


@pytest.mark.django_db
def test_create_trip_with_party(monkeypatch, owner, service):
    client = APIClient()
    client.force_authenticate(owner)

    fake_session = types.SimpleNamespace(
        payment_intent="pi_test",
        id="cs_test",
        payment_status="unpaid",
        url="https://stripe.test/checkout"
    )

    monkeypatch.setattr("trips.api.create_checkout_session", lambda **kwargs: fake_session)
    monkeypatch.setattr("trips.api.send_booking_confirmation_email", lambda **kwargs: None)

    start = timezone.now() + timezone.timedelta(days=30)
    end = start + timezone.timedelta(days=1)

    payload = {
        "guide_service": service.id,
        "title": "Private Glacier Day",
        "location": "Mt. Baker",
        "start": start.isoformat().replace("+00:00", "Z"),
        "end": end.isoformat().replace("+00:00", "Z"),
        "price_cents": 25000,
        "description": "Technical glacier travel",
        "party": {
            "primary_guest": {
                "email": "guest@example.com",
                "first_name": "Greta",
                "last_name": "Guest",
                "phone": "555-0100",
            }
        },
    }

    response = client.post("/api/trips/", payload, format="json")
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Private Glacier Day"
    assert len(data["parties"]) == 1
    assert data["parties"][0]["primary_guest_email"] == "guest@example.com"


@pytest.mark.django_db
def test_create_trip_without_party_rejected(owner, service):
    client = APIClient()
    client.force_authenticate(owner)

    start = timezone.now() + timezone.timedelta(days=10)
    end = start + timezone.timedelta(days=1)

    payload = {
        "guide_service": service.id,
        "title": "Ski Day",
        "location": "Alpental",
        "start": start.isoformat().replace("+00:00", "Z"),
        "end": end.isoformat().replace("+00:00", "Z"),
        "price_cents": 18000,
    }

    response = client.post("/api/trips/", payload, format="json")
    assert response.status_code == 400


@pytest.mark.django_db
def test_create_trip_with_party_and_guide(monkeypatch, owner, service, guide_user):
    client = APIClient()
    client.force_authenticate(owner)

    fake_session = types.SimpleNamespace(
        payment_intent="pi_test",
        id="cs_test",
        payment_status="unpaid",
        url="https://stripe.test/checkout",
    )

    monkeypatch.setattr("trips.api.create_checkout_session", lambda **kwargs: fake_session)
    monkeypatch.setattr("trips.api.send_booking_confirmation_email", lambda **kwargs: None)

    start = timezone.now() + timezone.timedelta(days=5)
    end = start + timezone.timedelta(days=1)

    payload = {
        "guide_service": service.id,
        "title": "Private Trip",
        "location": "Mt. Hood",
        "start": start.isoformat().replace("+00:00", "Z"),
        "end": end.isoformat().replace("+00:00", "Z"),
        "price_cents": 15000,
        "description": "",
        "guides": [guide_user.id],
        "party": {
            "primary_guest": {
                "email": "guest@example.com",
                "first_name": "Greta",
                "last_name": "Guest",
            }
        },
    }

    response = client.post("/api/trips/", payload, format="json")
    assert response.status_code == 201
    data = response.json()
    assert data["location"] == "Mt. Hood"
    assert len(data["parties"]) == 1

    assignments = Assignment.objects.filter(trip_id=data["id"])
    assert assignments.count() == 1
    assert assignments.first().guide == guide_user


@pytest.mark.django_db
def test_create_trip_with_multiple_guides(monkeypatch, owner, service, guide_user):
    additional_guide = User.objects.create_user(
        username="assistant@example.com",
        email="assistant@example.com",
        password="password123",
        first_name="Alex",
        last_name="Assistant",
    )
    ServiceMembership.objects.create(
        user=additional_guide,
        guide_service=service,
        role=ServiceMembership.GUIDE,
    )

    client = APIClient()
    client.force_authenticate(owner)

    fake_session = types.SimpleNamespace(
        payment_intent="pi_test",
        id="cs_test",
        payment_status="unpaid",
        url="https://stripe.test/checkout",
    )

    monkeypatch.setattr("trips.api.create_checkout_session", lambda **kwargs: fake_session)
    monkeypatch.setattr("trips.api.send_booking_confirmation_email", lambda **kwargs: None)

    start = timezone.now() + timezone.timedelta(days=5)
    end = start + timezone.timedelta(days=1)

    payload = {
        "guide_service": service.id,
        "title": "Team Trip",
        "location": "Mt. Hood",
        "start": start.isoformat().replace("+00:00", "Z"),
        "end": end.isoformat().replace("+00:00", "Z"),
        "price_cents": 22000,
        "description": "",
        "guides": [guide_user.id, additional_guide.id],
        "party": {
            "primary_guest": {
                "email": "guest@example.com",
                "first_name": "Greta",
                "last_name": "Guest",
            }
        },
    }

    response = client.post("/api/trips/", payload, format="json")
    assert response.status_code == 201
    data = response.json()
    assignments = Assignment.objects.filter(trip_id=data["id"]).order_by("guide_id")
    assert list(assignments.values_list("guide_id", flat=True)) == sorted([guide_user.id, additional_guide.id])


@pytest.mark.django_db
def test_service_guides_endpoint(owner, service, guide_user):
    client = APIClient()
    client.force_authenticate(owner)

    response = client.get(f"/api/trips/service/{service.id}/guides/")
    assert response.status_code == 200
    data = response.json()
    assert any(item["id"] == guide_user.id for item in data)


@pytest.mark.django_db
def test_assign_guides_endpoint(owner, service, guide_user, trip):
    client = APIClient()
    client.force_authenticate(owner)

    assign_response = client.post(
        f"/api/trips/{trip.id}/assign-guides/",
        {"guide_ids": [guide_user.id]},
        format="json",
    )
    assert assign_response.status_code == 200
    payload = assign_response.json()
    assert payload["requires_assignment"] is False
    assert payload["assignments"][0]["guide_id"] == guide_user.id

    unassign_response = client.post(
        f"/api/trips/{trip.id}/assign-guides/",
        {"guide_ids": []},
        format="json",
    )
    assert unassign_response.status_code == 200
    payload = unassign_response.json()
    assert payload["requires_assignment"] is True
    assert payload["assignments"] == []


@pytest.mark.django_db
def test_assign_guides_endpoint_rejects_duplicates(owner, service, guide_user, trip):
    client = APIClient()
    client.force_authenticate(owner)

    response = client.post(
        f"/api/trips/{trip.id}/assign-guides/",
        {"guide_ids": [guide_user.id, guide_user.id]},
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_owner_updates_party_size(monkeypatch, owner, trip):
    client = APIClient()
    client.force_authenticate(owner)

    fake_session = types.SimpleNamespace(
        payment_intent="pi_test",
        id="cs_test",
        payment_status="unpaid",
        url="https://stripe.test/checkout",
    )

    monkeypatch.setattr("trips.api.create_checkout_session", lambda **kwargs: fake_session)
    monkeypatch.setattr("trips.api.send_booking_confirmation_email", lambda **kwargs: None)

    payload = {
        "primary_guest": {
            "email": "guest@example.com",
            "first_name": "Greta",
            "last_name": "Guest",
        },
    }

    create_response = client.post(f"/api/trips/{trip.id}/parties/", payload, format="json")
    assert create_response.status_code == 201
    party = TripParty.objects.get(trip=trip)
    payment = party.payments.get()
    assert payment.amount_cents == trip.price_cents

    update_response = client.patch(
        f"/api/trips/{trip.id}/parties/{party.id}/",
        {"party_size": 3},
        format="json",
    )
    assert update_response.status_code == 200
    party.refresh_from_db()
    assert party.party_size == 3
    updated_payment = party.payments.get(id=payment.id)
    assert updated_payment.amount_cents == trip.price_cents * 3
    data = update_response.json()
    assert data["party_size"] == 3
    assert data["total_amount_cents"] == trip.price_cents * 3


@pytest.mark.django_db
def test_party_size_update_uses_tier_pricing(monkeypatch, owner, service):
    client = APIClient()
    client.force_authenticate(owner)

    pricing_snapshot = {
        "currency": "usd",
        "is_deposit_required": False,
        "deposit_percent": "0",
        "tiers": [
            {
                "min_guests": 1,
                "max_guests": 4,
                "price_per_guest": "150.00",
                "price_per_guest_cents": 15000,
            },
            {
                "min_guests": 5,
                "max_guests": None,
                "price_per_guest": "130.00",
                "price_per_guest_cents": 13000,
            },
        ],
    }

    tiered_trip = Trip.objects.create(
        guide_service=service,
        title="Tiered Template Trip",
        location="Desert",
        start=timezone.now() + timezone.timedelta(days=7),
        end=timezone.now() + timezone.timedelta(days=8),
        pricing_snapshot=pricing_snapshot,
        template_snapshot={"pricing": pricing_snapshot},
        template_used=None,
    )

    fake_session = types.SimpleNamespace(
        payment_intent="pi_test",
        id="cs_test",
        payment_status="unpaid",
        url="https://stripe.test/checkout",
    )

    monkeypatch.setattr("trips.api.create_checkout_session", lambda **kwargs: fake_session)
    monkeypatch.setattr("trips.api.send_booking_confirmation_email", lambda **kwargs: None)

    payload = {
        "primary_guest": {
            "email": "guest@example.com",
            "first_name": "Greta",
            "last_name": "Guest",
        },
    }

    create_response = client.post(f"/api/trips/{tiered_trip.id}/parties/", payload, format="json")
    assert create_response.status_code == 201
    party = TripParty.objects.get(trip=tiered_trip)
    initial_payment = party.payments.get()
    assert initial_payment.amount_cents == 15000

    update_response = client.patch(
        f"/api/trips/{tiered_trip.id}/parties/{party.id}/",
        {"party_size": 5},
        format="json",
    )
    assert update_response.status_code == 200

    party.refresh_from_db()
    updated_payment = party.payments.get(id=initial_payment.id)
    assert updated_payment.amount_cents == 13000 * 5
    response_data = update_response.json()
    assert response_data["party_size"] == 5
    assert response_data["price_per_guest_cents"] == 13000
    assert response_data["total_amount_cents"] == 13000 * 5
