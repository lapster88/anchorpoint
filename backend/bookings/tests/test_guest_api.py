import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import ServiceMembership, User
from bookings.models import Booking, BookingGuest, GuestProfile
from bookings.services.guest_tokens import issue_guest_access_token
from orgs.models import GuideService
from trips.models import Trip


@pytest.fixture
def service(db):
    return GuideService.objects.create(name="Summit Guides", slug="summit-guides", contact_email="team@example.com")


@pytest.fixture
def staff_user(db, service):
    user = User.objects.create_user(
        username="manager@example.com",
        email="manager@example.com",
        password="password123",
        first_name="Morgan",
        last_name="Manager",
    )
    ServiceMembership.objects.create(user=user, guide_service=service, role=ServiceMembership.MANAGER)
    return user


@pytest.fixture
def booking(db, service):
    guest = GuestProfile.objects.create(email="guest@example.test", first_name="Greta", last_name="Guest")
    trip = Trip.objects.create(
        guide_service=service,
        title="Alpine Ascent",
        location="Alps",
        start=timezone.now() + timezone.timedelta(days=5),
        end=timezone.now() + timezone.timedelta(days=6),
        price_cents=50000,
    )
    booking = Booking.objects.create(trip=trip, primary_guest=guest, party_size=2)
    BookingGuest.objects.create(booking=booking, guest=guest, is_primary=True)
    return booking


@pytest.mark.django_db
def test_staff_can_list_guests(staff_user, booking):
    client = APIClient()
    client.force_authenticate(staff_user)

    response = client.get("/api/guests/")
    assert response.status_code == 200
    assert len(response.data) == 1
    assert response.data[0]["email"] == "guest@example.test"


@pytest.mark.django_db
def test_staff_can_request_guest_link(staff_user, booking):
    client = APIClient()
    client.force_authenticate(staff_user)

    response = client.post(
        "/api/guest-links/",
        {"guest_id": booking.primary_guest_id, "booking_id": booking.id, "ttl_hours": 48},
        format="json",
    )
    assert response.status_code == 201


@pytest.mark.django_db
def test_guest_can_update_profile_via_token(booking):
    token_obj, raw = issue_guest_access_token(
        guest=booking.primary_guest,
        booking=booking,
        expires_at=booking.trip.end + timezone.timedelta(days=1),
        single_use=True,
    )

    client = APIClient()
    url = f"/api/guest-access/{raw}/profile/"
    response = client.patch(
        url,
        {"phone": "555-1010", "medical_notes": "None"},
        format="json",
    )
    assert response.status_code == 200
    booking.refresh_from_db()
    booking.primary_guest.refresh_from_db()
    assert booking.primary_guest.phone == "555-1010"
    assert booking.info_status == Booking.INFO_COMPLETE
    token_obj.refresh_from_db()
    assert token_obj.used_at is not None
