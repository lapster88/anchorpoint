import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import ServiceMembership, User
from orgs.models import GuideService
from trips.models import Assignment, Trip
from trips.pricing import build_single_tier_snapshot


@pytest.fixture
def guide_service_a(db):
    return GuideService.objects.create(
        name="Alpine Guides",
        slug="alpine-guides",
        contact_email="alpine@example.com",
    )


@pytest.fixture
def guide_service_b(db):
    return GuideService.objects.create(
        name="Desert Guides",
        slug="desert-guides",
        contact_email="desert@example.com",
    )


def _create_trip(service, title, start_offset_days=0):
    start = (timezone.now() + timezone.timedelta(days=start_offset_days)).replace(
        hour=9, minute=0, second=0, microsecond=0
    )
    end = start + timezone.timedelta(hours=8)
    return Trip.objects.create(
        guide_service=service,
        title=title,
        location="Somewhere",
        start=start,
        end=end,
        timing_mode=Trip.SINGLE_DAY,
        duration_hours=8,
        pricing_snapshot=build_single_tier_snapshot(50000),
    )


@pytest.mark.django_db
def test_manager_sees_trips_for_their_services(guide_service_a, guide_service_b):
    user = User.objects.create_user(
        username="manager@example.com",
        email="manager@example.com",
        password="password123",
        first_name="Morgan",
        last_name="Manager",
    )
    ServiceMembership.objects.create(
        user=user,
        guide_service=guide_service_a,
        role=ServiceMembership.MANAGER,
    )

    trip_a1 = _create_trip(guide_service_a, "Trip A1")
    _create_trip(guide_service_b, "Trip B1")

    client = APIClient()
    client.force_authenticate(user=user)

    response = client.get("/api/trips/")
    assert response.status_code == 200
    ids = {trip["id"] for trip in response.data}
    assert ids == {trip_a1.id}


@pytest.mark.django_db
def test_guide_only_sees_assigned_trips(guide_service_a, guide_service_b):
    guide = User.objects.create_user(
        username="guide@example.com",
        email="guide@example.com",
        password="password123",
        first_name="Gabe",
        last_name="Guide",
    )
    ServiceMembership.objects.create(
        user=guide,
        guide_service=guide_service_a,
        role=ServiceMembership.GUIDE,
    )

    assigned_trip = _create_trip(guide_service_a, "Assigned trip")
    other_trip_same_service = _create_trip(guide_service_a, "Other trip")
    other_service_trip = _create_trip(guide_service_b, "Foreign trip")

    Assignment.objects.create(trip=assigned_trip, guide=guide)

    client = APIClient()
    client.force_authenticate(user=guide)
    response = client.get("/api/trips/")
    assert response.status_code == 200
    ids = {trip["id"] for trip in response.data}
    assert ids == {assigned_trip.id}
    assert other_trip_same_service.id not in ids
    assert other_service_trip.id not in ids


@pytest.mark.django_db
def test_user_without_memberships_sees_no_trips(guide_service_a):
    user = User.objects.create_user(
        username="guest@example.com",
        email="guest@example.com",
        password="password123",
        first_name="Greta",
        last_name="Guest",
    )
    _create_trip(guide_service_a, "Trip 1")

    client = APIClient()
    client.force_authenticate(user=user)
    response = client.get("/api/trips/")
    assert response.status_code == 200
    assert response.data == []
