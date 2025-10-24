import pytest
from rest_framework.test import APIClient

from accounts.models import ServiceMembership, User
from orgs.models import GuideService
from trips.models import PricingModel, PricingTier


@pytest.fixture
def owner(db):
    return User.objects.create_user(
        username="owner@example.com",
        email="owner@example.com",
        password="password123",
        first_name="Olivia",
        last_name="Owner",
    )


@pytest.fixture
def guide(db):
    return User.objects.create_user(
        username="guide@example.com",
        email="guide@example.com",
        password="password123",
        first_name="Gabe",
        last_name="Guide",
    )


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
        contact_email="admin@alpine.test",
    )


@pytest.fixture
def api_client(owner):
    client = APIClient()
    client.force_authenticate(owner)
    return client


def _pricing_payload(service_id: int):
    return {
        "service": service_id,
        "name": "Standard",
        "description": "Default pricing",
        "default_location": "Mount Baker",
        "currency": "usd",
        "is_deposit_required": True,
        "deposit_percent": "25.00",
        "tiers": [
            {"min_guests": 1, "max_guests": 2, "price_per_guest": "150.00"},
            {"min_guests": 3, "max_guests": None, "price_per_guest": "130.00"},
        ],
    }


@pytest.mark.django_db
def test_owner_creates_pricing_model(api_client, owner, service):
    ServiceMembership.objects.create(
        user=owner,
        guide_service=service,
        role=ServiceMembership.OWNER,
    )

    response = api_client.post("/api/pricing-models/", _pricing_payload(service.id), format="json")
    assert response.status_code == 201
    model = PricingModel.objects.get()
    assert model.name == "Standard"
    assert model.tiers.count() == 2


@pytest.mark.django_db
def test_validation_rejects_gaps(api_client, owner, service):
    ServiceMembership.objects.create(
        user=owner,
        guide_service=service,
        role=ServiceMembership.OWNER,
    )

    payload = _pricing_payload(service.id)
    payload["tiers"][1]["min_guests"] = 5

    response = api_client.post("/api/pricing-models/", payload, format="json")
    assert response.status_code == 400
    assert "contiguous" in str(response.data)


@pytest.mark.django_db
def test_validation_requires_open_ended_final_tier(api_client, owner, service):
    ServiceMembership.objects.create(
        user=owner,
        guide_service=service,
        role=ServiceMembership.OWNER,
    )

    payload = _pricing_payload(service.id)
    payload["tiers"][-1]["max_guests"] = 5

    response = api_client.post("/api/pricing-models/", payload, format="json")
    assert response.status_code == 400
    assert "open-ended" in str(response.data)


@pytest.mark.django_db
def test_disallows_non_manager_create(owner, guide, service):
    ServiceMembership.objects.create(
        user=guide,
        guide_service=service,
        role=ServiceMembership.GUIDE,
    )

    client = APIClient()
    client.force_authenticate(guide)

    response = client.post("/api/pricing-models/", _pricing_payload(service.id), format="json")
    assert response.status_code == 403


@pytest.mark.django_db
def test_list_filters_by_membership(api_client, owner, service, other_service):
    ServiceMembership.objects.create(
        user=owner,
        guide_service=service,
        role=ServiceMembership.OWNER,
    )
    service_model = PricingModel.objects.create(service=service, name="Standard")
    PricingTier.objects.create(model=service_model, min_guests=1, max_guests=None, price_per_guest=100)
    other = PricingModel.objects.create(service=other_service, name="Other")
    PricingTier.objects.create(model=other, min_guests=1, max_guests=None, price_per_guest=120)

    response = api_client.get("/api/pricing-models/?service=%d" % service.id)
    assert response.status_code == 200
    assert len(response.data) == 1
    assert response.data[0]["name"] == "Standard"


@pytest.mark.django_db
def test_update_replaces_tiers(api_client, owner, service):
    ServiceMembership.objects.create(
        user=owner,
        guide_service=service,
        role=ServiceMembership.OWNER,
    )
    model = PricingModel.objects.create(service=service, name="Standard", is_deposit_required=False)
    tier1 = PricingTier.objects.create(model=model, min_guests=1, max_guests=2, price_per_guest=100)
    PricingTier.objects.create(model=model, min_guests=3, max_guests=None, price_per_guest=90)

    payload = {
        "service": service.id,
        "name": "Standard",
        "description": "Updated",
        "default_location": "El Chalten",
        "currency": "usd",
        "is_deposit_required": True,
        "deposit_percent": "10",
        "tiers": [
            {"id": tier1.id, "min_guests": 1, "max_guests": 3, "price_per_guest": "120"},
            {"min_guests": 4, "max_guests": None, "price_per_guest": "110"},
        ],
    }

    response = api_client.put(f"/api/pricing-models/{model.id}/", payload, format="json")
    assert response.status_code == 200
    model.refresh_from_db()
    assert model.description == "Updated"
    tiers = list(model.tiers.order_by('min_guests'))
    assert len(tiers) == 2
    assert tiers[0].max_guests == 3
    assert tiers[1].min_guests == 4


@pytest.mark.django_db
def test_delete_pricing_model(api_client, owner, service):
    ServiceMembership.objects.create(
        user=owner,
        guide_service=service,
        role=ServiceMembership.OWNER,
    )
    model = PricingModel.objects.create(service=service, name="Standard")
    PricingTier.objects.create(model=model, min_guests=1, max_guests=None, price_per_guest=100)

    response = api_client.delete(f"/api/pricing-models/{model.id}/")
    assert response.status_code == 204
    assert not PricingModel.objects.filter(id=model.id).exists()
