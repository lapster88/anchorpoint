import types
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import ServiceMembership, User
from bookings.models import Booking
from orgs.models import GuideService
from trips.models import PricingModel, PricingTier, TripTemplate, Trip


@pytest.fixture
def service(db):
    return GuideService.objects.create(
        name="Summit Guides",
        slug="summit-guides",
        contact_email="hello@summit.test",
    )


@pytest.fixture
def other_service(db):
    return GuideService.objects.create(
        name="Alpine Works",
        slug="alpine-works",
        contact_email="team@alpine.test",
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


@pytest.fixture
def pricing_model(db, service, owner):
    model = PricingModel.objects.create(
        service=service,
        name="Standard",
        description="Default pricing block",
        currency="usd",
        is_deposit_required=True,
        deposit_percent=Decimal("20.00"),
        created_by=owner,
    )
    PricingTier.objects.create(
        model=model,
        min_guests=1,
        max_guests=2,
        price_per_guest=Decimal("150.00"),
    )
    PricingTier.objects.create(
        model=model,
        min_guests=3,
        max_guests=None,
        price_per_guest=Decimal("130.00"),
    )
    return model


@pytest.fixture
def template(db, service, pricing_model, owner):
    return TripTemplate.objects.create(
        service=service,
        title="Glacier Skills",
        duration_hours=8,
        location="Coleman Glacier",
        pricing_model=pricing_model,
        target_client_count=6,
        target_guide_count=2,
        notes="Bring glacier kits.",
        created_by=owner,
    )


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.mark.django_db
def test_owner_creates_trip_template_via_api(owner, service, pricing_model):
    client = auth_client(owner)

    payload = {
        "service": service.id,
        "title": "Crevasse Rescue",
        "duration_hours": 6,
        "location": "Paradise",
        "pricing_model": pricing_model.id,
        "target_client_count": 6,
        "target_guide_count": 2,
        "notes": "Anchors practice",
        "is_active": True,
    }

    response = client.post("/api/trip-templates/", payload, format="json")
    assert response.status_code == 201
    data = response.json()
    assert data["pricing_model"] == pricing_model.id
    assert data["pricing_model_name"] == "Standard"

    template = TripTemplate.objects.get(id=data["id"])
    assert template.target_client_count == 6
    assert template.pricing_model == pricing_model


@pytest.mark.django_db
def test_template_requires_matching_pricing_model(owner, service, other_service, pricing_model):
    other_model = PricingModel.objects.create(service=other_service, name="Other")
    PricingTier.objects.create(model=other_model, min_guests=1, max_guests=None, price_per_guest=Decimal("200.00"))

    client = auth_client(owner)

    payload = {
        "service": service.id,
        "title": "Mismatch",
        "duration_hours": 4,
        "location": "Basecamp",
        "pricing_model": other_model.id,
        "target_client_count": 4,
        "target_guide_count": 1,
        "notes": "",
        "is_active": True,
    }

    response = client.post("/api/trip-templates/", payload, format="json")
    assert response.status_code == 400
    assert "pricing_model" in response.json()


@pytest.mark.django_db
def test_guides_cannot_manage_templates(db, service, owner, pricing_model):
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
    payload = {
        "service": service.id,
        "title": "Guide Attempt",
        "duration_hours": 4,
        "location": "Camp Muir",
        "pricing_model": pricing_model.id,
        "target_client_count": 3,
        "target_guide_count": 1,
        "notes": "",
        "is_active": True,
    }

    response = client.post("/api/trip-templates/", payload, format="json")
    assert response.status_code == 403


@pytest.mark.django_db
def test_template_list_filters_by_service(owner, service, other_service, pricing_model):
    other_owner = User.objects.create_user(
        username="other@example.com",
        email="other@example.com",
        password="password123",
    )
    ServiceMembership.objects.create(
        user=other_owner,
        guide_service=other_service,
        role=ServiceMembership.OWNER,
    )
    other_model = PricingModel.objects.create(service=other_service, name="Other Pricing")
    PricingTier.objects.create(model=other_model, min_guests=1, max_guests=None, price_per_guest=Decimal("175.00"))

    TripTemplate.objects.create(
        service=service,
        title="Managed",
        duration_hours=8,
        location="Summit",
        pricing_model=pricing_model,
    )
    TripTemplate.objects.create(
        service=other_service,
        title="External",
        duration_hours=5,
        location="Camp",
        pricing_model=other_model,
    )

    client = auth_client(owner)
    response = client.get(f"/api/trip-templates/?service={service.id}")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["service"] == service.id


@pytest.mark.django_db
def test_create_trip_from_template_sets_snapshot(monkeypatch, owner, service, pricing_model, template):
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
    assert data["pricing_model"] == pricing_model.id
    assert data["pricing_snapshot"]["tiers"][0]["price_per_guest_cents"] == 15000

    trip = Trip.objects.get(id=data["id"])
    assert trip.template_used == template
    assert trip.pricing_model == pricing_model
    assert trip.price_cents == 15000
    assert trip.template_snapshot["title"] == template.title

    booking = Booking.objects.get(trip=trip)
    payment = booking.payments.get()
    # Party size is 3, so snapshot tier 2 should apply (130 per guest).
    assert booking.party_size == 3
    assert payment.amount_cents == 13000 * 3
