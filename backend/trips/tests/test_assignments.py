import pytest
from django.utils import timezone

from availability.models import GuideAvailability
from accounts.models import User
from orgs.models import GuideService
from trips.models import Assignment, Trip


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
def guide_service(db):
    return GuideService.objects.create(name="Summit Guides", slug="summit-guides", contact_email="owner@example.com")


@pytest.fixture
def trip(db, guide_service):
    now = timezone.now()
    return Trip.objects.create(
        guide_service=guide_service,
        title="Alpine Ascent",
        location="Alps",
        start=now + timezone.timedelta(days=5),
        end=now + timezone.timedelta(days=6),
        capacity=4,
        price_cents=50000,
    )


def test_assignment_creates_unavailable_block(db, guide, trip):
    Assignment.objects.create(trip=trip, guide=guide, role=Assignment.LEAD)

    availability = GuideAvailability.objects.get(guide=guide, trip=trip, source=GuideAvailability.SOURCE_ASSIGNMENT)
    assert availability.is_available is False
    assert availability.start == trip.start
    assert availability.end == trip.end
    assert availability.guide_service == trip.guide_service
    assert availability.visibility == GuideAvailability.VISIBILITY_DETAIL
    assert "Trip assignment" in availability.note


def test_assignment_update_refreshes_block(db, guide, trip):
    assignment = Assignment.objects.create(trip=trip, guide=guide, role=Assignment.LEAD)
    new_start = trip.start + timezone.timedelta(hours=2)
    new_end = trip.end + timezone.timedelta(hours=2)
    trip.start = new_start
    trip.end = new_end
    trip.save()

    availability = GuideAvailability.objects.get(guide=guide, trip=trip, source=GuideAvailability.SOURCE_ASSIGNMENT)
    assert availability.start == new_start
    assert availability.end == new_end
    assert availability.note.endswith(trip.title)


def test_assignment_delete_removes_block(db, guide, trip):
    assignment = Assignment.objects.create(trip=trip, guide=guide, role=Assignment.LEAD)
    assignment.delete()

    assert not GuideAvailability.objects.filter(guide=guide, trip=trip, source=GuideAvailability.SOURCE_ASSIGNMENT).exists()
