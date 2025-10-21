import pytest
from django.utils import timezone

from bookings.models import GuestProfile
from bookings.services.guest_tokens import issue_guest_access_token, validate_guest_access_token


@pytest.mark.django_db
def test_issue_and_validate_guest_token():
    guest = GuestProfile.objects.create(email="guest@example.test", first_name="Guest", last_name="Example")
    token_obj, raw = issue_guest_access_token(guest=guest, lifetime=None, expires_at=timezone.now() + timezone.timedelta(hours=1))

    assert token_obj.guest_profile == guest
    assert validate_guest_access_token(raw) is not None

    token_obj.mark_used()
    assert validate_guest_access_token(raw) is None
