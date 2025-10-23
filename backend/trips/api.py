from datetime import timedelta

from django.conf import settings
from django.db.models import Sum
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import ServiceMembership
from bookings.models import Booking, BookingGuest
from bookings.serializers import BookingCreateSerializer, BookingResponseSerializer
from bookings.services.emails import send_booking_confirmation_email
from bookings.services.guest_tokens import issue_guest_access_token
from bookings.services.guests import upsert_guest_profile
from bookings.services.payments import create_checkout_session
from payments.models import Payment
from .models import Trip
from .serializers import TripSerializer


class TripViewSet(viewsets.ModelViewSet):
    serializer_class = TripSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ["guide_service", "start", "end"]
    search_fields = ["title", "location", "description"]
    ordering_fields = ["start", "end", "price_cents"]

    def get_queryset(self):
        user = self.request.user
        base_queryset = Trip.objects.all().order_by("start")

        if user.is_superuser:
            return base_queryset

        memberships = ServiceMembership.objects.filter(user=user, is_active=True)
        if not memberships.exists():
            return base_queryset.none()

        privileged_roles = {ServiceMembership.OWNER, ServiceMembership.MANAGER}
        if memberships.filter(role__in=privileged_roles).exists():
            service_ids = memberships.values_list("guide_service_id", flat=True)
            return base_queryset.filter(guide_service_id__in=service_ids)

        if memberships.filter(role=ServiceMembership.GUIDE).exists():
            return base_queryset.filter(assignments__guide=user).distinct()

        # Other roles do not see trips by default.
        return base_queryset.none()

    def _user_can_manage_trip(self, user, trip: Trip) -> bool:
        if user.is_superuser:
            return True
        return ServiceMembership.objects.filter(
            user=user,
            guide_service=trip.guide_service,
            role__in=[ServiceMembership.OWNER, ServiceMembership.MANAGER],
            is_active=True,
        ).exists()

    @action(detail=True, methods=["post"], url_path="bookings")
    def create_booking(self, request, pk=None):
        trip = self.get_object()
        if not self._user_can_manage_trip(request.user, trip):
            return Response({"detail": "Not permitted."}, status=status.HTTP_403_FORBIDDEN)

        serializer = BookingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        primary_guest = upsert_guest_profile(payload["primary_guest"])
        additional_guests_data = payload.get("additional_guests", [])
        additional_guests = [upsert_guest_profile(guest_data) for guest_data in additional_guests_data]
        guests = [primary_guest] + additional_guests

        requested_party_size = payload.get("party_size") or len(guests)
        party_size = max(requested_party_size, len(guests))

        total_reserved = (
            Booking.objects.filter(trip=trip)
            .aggregate(total=Sum("party_size"))
            .get("total")
            or 0
        )
        if total_reserved + party_size > trip.capacity:
            return Response({"detail": "Trip capacity would be exceeded."}, status=status.HTTP_400_BAD_REQUEST)

        booking = Booking.objects.create(
            trip=trip,
            primary_guest=primary_guest,
            party_size=party_size,
            payment_status=Booking.PENDING,
            info_status=Booking.INFO_PENDING,
            waiver_status=Booking.WAIVER_PENDING,
        )
        BookingGuest.objects.create(booking=booking, guest=primary_guest, is_primary=True)
        for guest in additional_guests:
            BookingGuest.objects.get_or_create(booking=booking, guest=guest, defaults={"is_primary": False})

        amount_cents = trip.price_cents * party_size
        checkout_session = create_checkout_session(booking=booking, amount_cents=amount_cents)

        Payment.objects.create(
            booking=booking,
            amount_cents=amount_cents,
            currency="usd",
            stripe_payment_intent=checkout_session.payment_intent,
            stripe_checkout_session=checkout_session.id,
            status=checkout_session.payment_status,
        )

        expires_at = trip.end + timedelta(days=1)
        _, raw_token = issue_guest_access_token(
            guest=primary_guest,
            booking=booking,
            expires_at=expires_at,
            single_use=False,
        )
        guest_portal_url = f"{settings.FRONTEND_URL}/guest?token={raw_token}"
        payment_url = checkout_session.url

        recipient_emails = [guest.email for guest in guests if guest.email]
        if recipient_emails:
            send_booking_confirmation_email(
                booking=booking,
                payment_url=payment_url,
                guest_portal_url=guest_portal_url,
                recipients=recipient_emails,
            )

        booking._payment_url = payment_url
        booking._guest_portal_url = guest_portal_url
        response_serializer = BookingResponseSerializer(booking)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)
