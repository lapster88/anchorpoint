import hashlib
import secrets
from datetime import timedelta

from django.utils import timezone

from bookings.models import Booking, GuestAccessToken, GuestProfile


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_guest_access_token(
    *,
    guest: GuestProfile,
    booking: Booking | None = None,
    expires_at=None,
    lifetime: timedelta | None = timedelta(days=7),
    single_use: bool = True,
    purpose: str = GuestAccessToken.PURPOSE_LINK,
) -> tuple[GuestAccessToken, str]:
    """Create a new access token for a guest and return the instance plus plaintext."""

    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_token(raw_token)

    if expires_at is None:
        if lifetime is None:
            raise ValueError("Must provide expires_at or lifetime")
        expires_at = timezone.now() + lifetime

    token = GuestAccessToken.objects.create(
        guest_profile=guest,
        booking=booking,
        token_hash=token_hash,
        expires_at=expires_at,
        single_use=single_use,
        purpose=purpose,
    )
    return token, raw_token


def validate_guest_access_token(raw_token: str) -> GuestAccessToken | None:
    """Return the token if still valid; otherwise None."""
    token_hash = _hash_token(raw_token)
    try:
        token = GuestAccessToken.objects.select_related("guest_profile", "booking").get(token_hash=token_hash)
    except GuestAccessToken.DoesNotExist:
        return None

    if token.is_expired:
        return None

    return token
