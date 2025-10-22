from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

from bookings.models import GuestProfile


def _parse_date(value: str | None):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).date()
    except ValueError:
        return None


def upsert_guest_profile(data: Dict[str, Any]) -> GuestProfile:
    email = data.get("email", "").strip().lower()
    if not email:
        raise ValueError("Guest email is required")

    defaults = {
        "first_name": data.get("first_name", "").strip(),
        "last_name": data.get("last_name", "").strip(),
        "phone": data.get("phone", "").strip(),
        "date_of_birth": _parse_date(data.get("date_of_birth")),
        "emergency_contact_name": data.get("emergency_contact_name", "").strip(),
        "emergency_contact_phone": data.get("emergency_contact_phone", "").strip(),
        "medical_notes": data.get("medical_notes", ""),
        "dietary_notes": data.get("dietary_notes", ""),
    }
    guest, _ = GuestProfile.objects.update_or_create(email=email, defaults=defaults)
    return guest
