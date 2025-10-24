import types

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import ServiceMembership, User
from bookings.models import Booking
from orgs.models import GuideService
from trips.models import TripTemplate, Trip

TIERS = [
    {"min_guests": 1, "max_guests": 2, "price_per_guest": "150.00"},
    {"min_guests": 3, "max_guests": None, "price_per_guest": "130.00"},
]


def _template_payload(service_id):
    return {
        "service": service_id,
        "title": "Glacier Skills",
        "duration_hours": 8,
        "location": "Coleman Glacier",
        "pricing_currency": "usd",
        "is_deposit_required": True,
        "deposit_percent": "25.00",
        "pricing_tiers": TIERS,
        "target_client_count": 6,
        "target_guide_count": 2,
        "notes": "Bring glacier kits.",
        "is_active": True,
    }


@pytest.fixture
def service(db):
    return GuideService.objects.create(
        name="Summit Guides",
        slug="summit-guides",
        contact_email="hello@summit.test",
    )


@pytest.fixture
def owner(db, service):
    user = User.objects.create_user(
        username="owner@example.com",
        email="owner@example.com",
        password="password123",
        first_name="Olivia",
        last_name="Owner",
    )
    ServiceMembership.objects.create(
        user=user,
        guide_service=service,
        role=ServiceMembership.OWNER,
    )
    return user


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.mark.django_db
def test_owner_creates_trip_template_via_api(owner, service):
    client = auth_client(owner)
    payload = _template_payload(service.id)

    response = client.post("/api/trip-templates/", payload, format="json")
    assert response.status_code == 201
    data = response.json()
    assert data["pricing_currency"] == "usd"
    assert len(data["pricing_tiers"]) == 2

    template = TripTemplate.objects.get(id=data["id"])
    assert template.is_deposit_required is True
    assert template.deposit_percent == 25
    assert template.pricing_tiers[0]["min_guests"] == 1


@pytest.mark.django_db
def test_template_requires_contiguous_tiers(owner, service):
    client = auth_client(owner)
    payload = _template_payload(service.id)
    payload["pricing_tiers"] = [
        {"min_guests": 1, "max_guests": 2, "price_per_guest": "150"},
        {"min_guests": 4, "max_guests": None, "price_per_guest": "130"},
    ]

    response = client.post("/api/trip-templates/", payload, format="json")
    assert response.status_code == 400


@pytest.mark.django_db
def test_guides_cannot_manage_templates(db, service, owner):
    guide = User.objects.create_user(
        username="guide@example.com",
        email="guide@example.com",
        password="password123",
    )
    ServiceMembership.objects.create(
        user=guide,
        guide_service=service,
        role=ServiceMembership.GUIDE,
    )

    client = auth_client(guide)
    response = client.post("/api/trip-templates/", _template_payload(service.id), format="json")
    assert response.status_code == 403


@pytest.mark.django_db
def test_duplicate_template(owner, service):
    template = TripTemplate.objects.create(
        service=service,
        title="Glacier Skills",
        duration_hours=8,
        location="Coleman Glacier",
        pricing_currency="usd",
        is_deposit_required=True,
        deposit_percent=25,
        pricing_tiers=TIERS,
        target_client_count=6,
        target_guide_count=2,
        notes="Bring glacier kits.",
        created_by=owner,
    )

    client = auth_client(owner)
    response = client.post(f"/api/trip-templates/{template.id}/duplicate/")
    assert response.status_code == 201
    data = response.json()
    assert data["title"].startswith("Glacier Skills (Copy")
    assert data["is_active"] is False
    assert data["pricing_tiers"][0]["price_per_guest"] == "150.00"


@pytest.fixture
def template(owner, service):
    return TripTemplate.objects.create(
        service=service,
        title="Glacier Skills",
        duration_hours=8,
        location="Coleman Glacier",
        pricing_currency="usd",
        is_deposit_required=True,
        deposit_percent=25,
        pricing_tiers=TIERS,
        target_client_count=6,
        target_guide_count=2,
        notes="Bring glacier kits.",
        created_by=owner,
    )


@pytest.fixture
def api_client(owner):
    client = APIClient()
    client.force_authenticate(owner)
    return client


@pytest.mark.django_db
def test_create_trip_from_template_sets_snapshot(monkeypatch, owner, service, template):
    client = auth_client(owner)

    fake_session = types.SimpleNamespace(
        payment_intent="pi_test",
        id="cs_test",
        payment_status="unpaid",
        url="https://stripe.test/checkout",
    )
    monkeypatch.setattr("trips.api.create_checkout_session", lambda **kwargs: fake_session)
    monkeypatch.setattr("trips.api.send_booking_confirmation_email", lambda **kwargs: None)

    start = timezone.now() + timezone.timedelta(days=14)
    end = start + timezone.timedelta(hours=template.duration_hours or 8)

    payload = {
        "guide_service": service.id,
        "template": template.id,
        "start": start.isoformat().replace("+00:00", "Z"),
        "end": end.isoformat().replace("+00:00", "Z"),
        "description": "Full glacier curricula",
        "party": {
            "primary_guest": {
                "email": "guest@example.com",
                "first_name": "Gloria",
                "last_name": "Guest",
            },
            "additional_guests": [
                {"email": "friend1@example.com"},
                {"email": "friend2@example.com"},
            ],
        },
    }

    response = client.post("/api/trips/", payload, format="json")
    assert response.status_code == 201
    data = response.json()
    assert data["template_id"] == template.id
    assert data["pricing_snapshot"]["tiers"][0]["price_per_guest_cents"] == 15000

    trip = Trip.objects.get(id=data["id"])
    assert trip.price_cents == 15000
