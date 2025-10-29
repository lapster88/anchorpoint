import pytest
from django.core.exceptions import ValidationError
from django.utils import timezone

from orgs.models import GuideService
from trips.models import Trip
from trips.pricing import build_single_tier_snapshot


@pytest.fixture
def guide_service(db):
    return GuideService.objects.create(
        name="Summit Guides",
        slug="summit-guides",
        contact_email="owner@example.com",
    )


@pytest.mark.django_db
def test_trip_end_must_be_after_start(guide_service):
    start = timezone.now()
    with pytest.raises(ValidationError) as exc:
        Trip.objects.create(
            guide_service=guide_service,
            title="Misty Mountain Hike",
            location="Misty Mountains",
            start=start,
            end=start - timezone.timedelta(hours=1),
            pricing_snapshot=build_single_tier_snapshot(15000),
        )

    assert "End time must be after the start time." in str(exc.value)
