from __future__ import annotations

from typing import Iterable

from django.conf import settings
from django.core.mail import send_mail

from bookings.models import Booking


def _format_from_email(service_name: str) -> str:
    default_from = settings.DEFAULT_FROM_EMAIL
    email_addr = default_from
    if '<' in default_from and default_from.endswith('>'):
        email_addr = default_from.split('<', 1)[1].rstrip('>')
    return f"{service_name} via Anchorpoint <{email_addr}>"


def send_booking_confirmation_email(
    *,
    booking: Booking,
    payment_url: str,
    guest_portal_url: str,
    recipients: Iterable[str],
):
    subject = f"{booking.trip.title} booking confirmed"
    service_name = booking.trip.guide_service.name
    from_email = _format_from_email(service_name)

    body_lines = [
        f"Hi {booking.primary_guest.full_name or booking.primary_guest.email},",
        "",
        f"You're booked on {booking.trip.title} with {service_name}.",
        f"Trip dates: {booking.trip.start:%B %d, %Y} to {booking.trip.end:%B %d, %Y}.",
        "",
        "Next steps:",
        f" • Complete payment: {payment_url}",
        f" • Update guest details or view waivers: {guest_portal_url}",
        "",
        "If you have any questions, reply to this email and the guide service will assist you.",
        "",
        "— The Anchorpoint Team",
    ]
    send_mail(
        subject,
        "\n".join(body_lines),
        from_email,
        list(recipients),
        fail_silently=False,
    )
