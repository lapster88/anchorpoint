import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from availability.models import (
    GuideAvailability,
    GuideAvailabilityShare,
    GuideCalendarIntegration,
)
from availability.services.calendar_sync import ExternalEvent, ingest_events
from accounts.models import ServiceMembership, User
from orgs.models import GuideService


@pytest.fixture
def guide(db):
    return User.objects.create_user(
        username="guide@example.com",
        email="guide@example.com",
        password="examplepass",
        first_name="Guide",
        last_name="Person",
    )


@pytest.fixture
def guide_service_a(db):
    return GuideService.objects.create(name="Service A", slug="service-a", contact_email="a@example.com")


@pytest.fixture
def guide_service_b(db):
    return GuideService.objects.create(name="Service B", slug="service-b", contact_email="b@example.com")


@pytest.fixture
def api_client(guide):
    client = APIClient()
    client.force_authenticate(user=guide)
    return client


@pytest.mark.django_db
def test_effective_visibility_with_overrides(guide, guide_service_a, guide_service_b):
    availability = GuideAvailability.objects.create(
        guide=guide,
        start=timezone.now(),
        end=timezone.now() + timezone.timedelta(hours=4),
        is_available=False,
        visibility=GuideAvailability.VISIBILITY_PRIVATE,
        source=GuideAvailability.SOURCE_MANUAL,
    )
    GuideAvailabilityShare.objects.create(
        availability=availability,
        guide_service=guide_service_a,
        visibility=GuideAvailability.VISIBILITY_DETAIL,
    )

    assert availability.effective_visibility() == GuideAvailability.VISIBILITY_PRIVATE
    assert availability.effective_visibility(guide_service_a) == GuideAvailability.VISIBILITY_DETAIL
    assert availability.effective_visibility(guide_service_b) == GuideAvailability.VISIBILITY_PRIVATE


@pytest.mark.django_db
def test_calendar_ingest_creates_availability(guide):
    integration = GuideCalendarIntegration.objects.create(
        guide=guide,
        provider=GuideCalendarIntegration.PROVIDER_GOOGLE,
        external_id="calendar-123",
    )
    start = timezone.now() + timezone.timedelta(days=1)
    end = start + timezone.timedelta(hours=2)
    events = [
        ExternalEvent(uid="event-1", start=start, end=end, summary="Climbing"),
    ]

    ingest_events(integration, events)

    availability = GuideAvailability.objects.get(guide=guide, source=GuideAvailability.SOURCE_SYNC)
    assert availability.is_available is False
    assert availability.start == start
    assert availability.end == end
    assert availability.note == "Climbing"
    integration.refresh_from_db()
    assert integration.last_synced_at is not None


@pytest.mark.django_db
def test_availability_api_crud(api_client, guide, guide_service_a):
    ServiceMembership.objects.create(
        user=guide,
        guide_service=guide_service_a,
        role=ServiceMembership.GUIDE,
    )
    start = timezone.now() + timezone.timedelta(days=2)
    end = start + timezone.timedelta(hours=4)
    response = api_client.post(
        "/api/auth/availabilities/",
        {
            "guide_service": guide_service_a.id,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "is_available": False,
            "visibility": GuideAvailability.VISIBILITY_BUSY,
            "note": "Prep time",
        },
        format="json",
    )
    assert response.status_code == 201
    availability_id = response.data["id"]

    update_response = api_client.patch(
        f"/api/auth/availabilities/{availability_id}/",
        {"visibility": GuideAvailability.VISIBILITY_DETAIL, "note": "Team climb"},
        format="json",
    )
    assert update_response.status_code == 200
    assert update_response.data["visibility"] == GuideAvailability.VISIBILITY_DETAIL

    list_response = api_client.get("/api/auth/availabilities/")
    assert list_response.status_code == 200
    assert isinstance(list_response.data, list)
    assert any(item["id"] == availability_id for item in list_response.data)

    delete_response = api_client.delete(f"/api/auth/availabilities/{availability_id}/")
    assert delete_response.status_code == 204


@pytest.mark.django_db
def test_manual_availability_accepts_null_note(api_client, guide, guide_service_a):
    ServiceMembership.objects.create(
        user=guide,
        guide_service=guide_service_a,
        role=ServiceMembership.GUIDE,
    )
    start = timezone.now() + timezone.timedelta(days=1)
    end = start + timezone.timedelta(hours=2)
    response = api_client.post(
        "/api/auth/availabilities/",
        {
            "guide_service": guide_service_a.id,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "is_available": False,
            "visibility": GuideAvailability.VISIBILITY_BUSY,
            "note": None,
        },
        format="json",
    )
    assert response.status_code == 201
    assert response.data["note"] == ""


@pytest.mark.django_db
def test_availability_share_api(api_client, guide, guide_service_a, guide_service_b):
    ServiceMembership.objects.create(
        user=guide,
        guide_service=guide_service_a,
        role=ServiceMembership.GUIDE,
    )
    ServiceMembership.objects.create(
        user=guide,
        guide_service=guide_service_b,
        role=ServiceMembership.GUIDE,
    )
    availability = GuideAvailability.objects.create(
        guide=guide,
        start=timezone.now(),
        end=timezone.now() + timezone.timedelta(hours=3),
        is_available=False,
        visibility=GuideAvailability.VISIBILITY_BUSY,
        source=GuideAvailability.SOURCE_MANUAL,
    )

    create_response = api_client.post(
        f"/api/auth/availabilities/{availability.id}/shares/",
        {"guide_service": guide_service_a.id, "visibility": GuideAvailability.VISIBILITY_DETAIL},
        format="json",
    )
    assert create_response.status_code == 201
    assert create_response.data["guide_service"] == guide_service_a.id

    shares_response = api_client.get(f"/api/auth/availabilities/{availability.id}/shares/")
    assert shares_response.status_code == 200
    assert len(shares_response.data) == 1

    delete_response = api_client.delete(
        f"/api/auth/availabilities/{availability.id}/shares/?guide_service={guide_service_a.id}"
    )
    assert delete_response.status_code == 204


@pytest.mark.django_db
def test_availability_list_scoped_and_ordered(api_client, guide):
    other = User.objects.create_user(
        username="other@example.com",
        email="other@example.com",
        password="examplepass",
        first_name="Other",
        last_name="Guide",
    )

    first_start = timezone.now() + timezone.timedelta(days=1)
    first_end = first_start + timezone.timedelta(hours=2)
    second_start = first_start + timezone.timedelta(days=1)
    second_end = second_start + timezone.timedelta(hours=3)

    first = GuideAvailability.objects.create(
        guide=guide,
        start=first_start,
        end=first_end,
        is_available=True,
        visibility=GuideAvailability.VISIBILITY_DETAIL,
        source=GuideAvailability.SOURCE_MANUAL,
        note="Morning window",
    )
    second = GuideAvailability.objects.create(
        guide=guide,
        start=second_start,
        end=second_end,
        is_available=False,
        visibility=GuideAvailability.VISIBILITY_BUSY,
        source=GuideAvailability.SOURCE_MANUAL,
        note="Out guiding",
    )
    GuideAvailability.objects.create(
        guide=other,
        start=timezone.now() + timezone.timedelta(days=2),
        end=timezone.now() + timezone.timedelta(days=2, hours=3),
        is_available=True,
        visibility=GuideAvailability.VISIBILITY_DETAIL,
        source=GuideAvailability.SOURCE_MANUAL,
    )

    response = api_client.get("/api/auth/availabilities/")
    assert response.status_code == 200

    payload = response.data
    if isinstance(payload, dict):
        items = payload.get("results", [])
    else:
        items = payload

    returned_ids = [item["id"] for item in items]
    assert returned_ids == [first.id, second.id]


@pytest.mark.django_db
def test_calendar_integration_api(api_client, guide):
    create_response = api_client.post(
        "/api/auth/calendar-integrations/",
        {"provider": GuideCalendarIntegration.PROVIDER_GOOGLE, "external_id": "cal-1", "is_active": True},
        format="json",
    )
    assert create_response.status_code == 201
    integration_id = create_response.data["id"]

    list_response = api_client.get("/api/auth/calendar-integrations/")
    assert list_response.status_code == 200
    assert len(list_response.data) == 1

    patch_response = api_client.patch(
        f"/api/auth/calendar-integrations/{integration_id}/",
        {"is_active": False},
        format="json",
    )
    assert patch_response.status_code == 200
    assert patch_response.data["is_active"] is False

    delete_response = api_client.delete(f"/api/auth/calendar-integrations/{integration_id}/")
    assert delete_response.status_code == 204


@pytest.mark.django_db
def test_memberships_endpoint(api_client, guide, guide_service_a):
    ServiceMembership.objects.create(
        user=guide,
        guide_service=guide_service_a,
        role=ServiceMembership.GUIDE,
    )
    response = api_client.get("/api/auth/memberships/")
    assert response.status_code == 200
    assert response.data[0]["guide_service"] == guide_service_a.id
    assert response.data[0]["guide_service_logo_url"] is None
