from datetime import timedelta

from django.conf import settings
from django.db.models import Sum
from rest_framework import permissions, status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import ServiceMembership, User
from bookings.models import Booking, BookingGuest
from bookings.serializers import (
    BookingCreateSerializer,
    BookingResponseSerializer,
    TripPartySerializer,
)
from bookings.services.emails import send_booking_confirmation_email
from bookings.services.guest_tokens import issue_guest_access_token
from bookings.services.guests import upsert_guest_profile
from bookings.services.payments import create_checkout_session
from payments.models import Payment
from .models import Trip, Assignment, TripTemplate
from .serializers import (
    TripSerializer,
    TripCreateSerializer,
    GuideSummarySerializer,
    TripTemplateSerializer,
)


def _price_per_guest_cents(trip: Trip, party_size: int) -> int:
    snapshot = trip.pricing_snapshot or {}
    tiers = snapshot.get("tiers") or []
    if tiers:
        for tier in tiers:
            max_guests = tier.get("max_guests")
            if max_guests is None or party_size <= max_guests:
                return tier.get("price_per_guest_cents") or trip.price_cents
        # Fallback to last tier if none matched due to data issues
        return tiers[-1].get("price_per_guest_cents") or trip.price_cents
    return trip.price_cents


def _calculate_amount_cents(trip: Trip, party_size: int) -> int:
    per_guest = _price_per_guest_cents(trip, party_size)
    return per_guest * party_size


class TripViewSet(viewsets.ModelViewSet):
    serializer_class = TripSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ["guide_service", "start", "end"]
    search_fields = ["title", "location", "description"]
    ordering_fields = ["start", "end", "price_cents"]

    def get_queryset(self):
        user = self.request.user
        base_queryset = Trip.objects.all().order_by("start").prefetch_related(
            "bookings__primary_guest",
            "bookings__booking_guests__guest",
            "bookings__payments",
            "assignments__guide",
        )

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

    def get_serializer_class(self):
        if self.action == "create":
            return TripCreateSerializer
        return super().get_serializer_class()

    def _create_party_instance(self, *, trip, party_data):
        payload = party_data

        primary_guest = upsert_guest_profile(payload["primary_guest"])
        additional_guests_data = payload.get("additional_guests", [])
        additional_guests = [upsert_guest_profile(guest_data) for guest_data in additional_guests_data]
        guests = [primary_guest] + additional_guests

        requested_party_size = payload.get("party_size") or len(guests)
        party_size = max(requested_party_size, len(guests))

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

        amount_cents = _calculate_amount_cents(trip, party_size)
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
        payment_url = getattr(checkout_session, "url", None)

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
        return booking

    @action(detail=True, methods=["post", "get"], url_path="parties")
    def parties(self, request, pk=None):
        trip = self.get_object()
        if not self._user_can_manage_trip(request.user, trip):
            return Response({"detail": "Not permitted."}, status=status.HTTP_403_FORBIDDEN)

        if request.method.lower() == "get":
            bookings = (
                trip.bookings.select_related("primary_guest")
                .prefetch_related("booking_guests__guest", "payments")
                .order_by("created_at")
            )
            serializer = TripPartySerializer(bookings, many=True)
            return Response({"parties": serializer.data})

        serializer = BookingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        booking = self._create_party_instance(trip=trip, party_data=serializer.validated_data)

        response_serializer = BookingResponseSerializer(booking)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="service/(?P<service_id>[^/.]+)/guides")
    def service_guides(self, request, service_id=None):
        if not request.user.is_authenticated:
            return Response({"detail": "Authentication credentials were not provided."}, status=status.HTTP_401_UNAUTHORIZED)

        permitted = request.user.is_superuser or ServiceMembership.objects.filter(
            user=request.user,
            guide_service_id=service_id,
            role__in=[ServiceMembership.OWNER, ServiceMembership.MANAGER],
            is_active=True,
        ).exists()

        if not permitted:
            return Response({"detail": "Not permitted."}, status=status.HTTP_403_FORBIDDEN)

        guides = User.objects.filter(
            servicemembership__guide_service_id=service_id,
            servicemembership__role=ServiceMembership.GUIDE,
            servicemembership__is_active=True,
        ).distinct()

        serializer = GuideSummarySerializer(guides, many=True)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        trip = serializer.save()
        party_data = serializer.context.get("party_data")
        guide = serializer.context.get("guide")

        if party_data is None:
            trip.delete()
            return Response({"detail": "A party is required when creating a trip."}, status=status.HTTP_400_BAD_REQUEST)

        party_serializer = BookingCreateSerializer(data=party_data)
        party_serializer.is_valid(raise_exception=True)

        booking = self._create_party_instance(trip=trip, party_data=party_serializer.validated_data)

        guides = serializer.context.get("guides", [])
        self._replace_assignments(trip, guides)

        if not trip.title.strip():
            primary_guest = booking.primary_guest
            fallback_title = primary_guest.full_name or primary_guest.email or "Private Trip"
            Trip.objects.filter(pk=trip.pk).update(title=fallback_title)

        trip.refresh_from_db()
        output = TripSerializer(trip, context=self.get_serializer_context())
        headers = self.get_success_headers(output.data)
        return Response(output.data, status=status.HTTP_201_CREATED, headers=headers)

    def _replace_assignments(self, trip: Trip, guides):
        guide_ids = []
        seen = set()
        for guide in guides:
            guide_id = guide.id if hasattr(guide, "id") else int(guide)
            if guide_id not in seen:
                seen.add(guide_id)
                guide_ids.append(guide_id)

        existing_assignments = Assignment.objects.filter(trip=trip)
        existing_ids = set(existing_assignments.values_list("guide_id", flat=True))
        to_delete = existing_ids - set(guide_ids)
        if to_delete:
            Assignment.objects.filter(trip=trip, guide_id__in=to_delete).delete()

        to_create = [gid for gid in guide_ids if gid not in existing_ids]
        Assignment.objects.bulk_create(
            [Assignment(trip=trip, guide_id=gid) for gid in to_create]
        )

    @action(detail=True, methods=["post"], url_path="assign-guides")
    def assign_guides(self, request, pk=None):
        trip = self.get_object()
        if not self._user_can_manage_trip(request.user, trip):
            return Response({"detail": "Not permitted."}, status=status.HTTP_403_FORBIDDEN)

        guide_ids = request.data.get("guide_ids")
        if guide_ids is None:
            return Response({"detail": "guide_ids is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(guide_ids, list):
            return Response({"detail": "guide_ids must be a list."}, status=status.HTTP_400_BAD_REQUEST)

        if len(set(guide_ids)) != len(guide_ids):
            return Response({"detail": "Duplicate guides are not allowed."}, status=status.HTTP_400_BAD_REQUEST)

        guides = list(User.objects.filter(id__in=guide_ids))
        if len(guides) != len(guide_ids):
            return Response({"detail": "One or more guides not found."}, status=status.HTTP_404_NOT_FOUND)

        inactive = [
            guide
            for guide in guides
            if not ServiceMembership.objects.filter(
                user=guide,
                guide_service=trip.guide_service,
                role=ServiceMembership.GUIDE,
                is_active=True,
            ).exists()
        ]
        if inactive:
            names = ", ".join(guide.display_name or guide.email for guide in inactive)
            return Response(
                {"detail": f"The following guides are not active for this service: {names}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        self._replace_assignments(trip, guides)
        trip.refresh_from_db()
        serializer = TripSerializer(trip, context=self.get_serializer_context())
        return Response(serializer.data, status=status.HTTP_200_OK)


class TripTemplateViewSet(viewsets.ModelViewSet):
    serializer_class = TripTemplateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = TripTemplate.objects.select_related('service').order_by('title')
        user = self.request.user
        service_id = self.request.query_params.get('service')

        if user.is_superuser:
            if service_id:
                return queryset.filter(service_id=service_id)
            return queryset

        memberships = ServiceMembership.objects.filter(user=user, is_active=True)
        if not memberships.exists():
            return queryset.none()

        manageable_services = memberships.filter(
            role__in=[ServiceMembership.OWNER, ServiceMembership.MANAGER]
        ).values_list('guide_service_id', flat=True)

        if not manageable_services:
            return queryset.none()

        queryset = queryset.filter(service_id__in=manageable_services)
        if service_id:
            queryset = queryset.filter(service_id=service_id)
        return queryset

    def _ensure_can_manage(self, service_id: int):
        user = self.request.user
        if user.is_superuser:
            return
        allowed = ServiceMembership.objects.filter(
            user=user,
            guide_service_id=service_id,
            role__in=[ServiceMembership.OWNER, ServiceMembership.MANAGER],
            is_active=True,
        ).exists()
        if not allowed:
            raise PermissionDenied("Not permitted to manage templates for this service.")

    def perform_create(self, serializer):
        service = serializer.validated_data['service']
        self._ensure_can_manage(service.id)
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        instance = serializer.instance
        new_service = serializer.validated_data.get('service', instance.service)
        if new_service != instance.service:
            raise PermissionDenied("Cannot move templates between services.")
        self._ensure_can_manage(instance.service_id)
        serializer.save()

    def perform_destroy(self, instance):
        self._ensure_can_manage(instance.service_id)
        instance.delete()

    @action(detail=True, methods=["post"], url_path="duplicate")
    def duplicate(self, request, pk=None):
        template = self.get_object()
        self._ensure_can_manage(template.service_id)

        new_title = self._generate_copy_title(template)
        duplicate = TripTemplate.objects.create(
            service=template.service,
            title=new_title,
            duration_hours=template.duration_hours,
            location=template.location,
            pricing_currency=template.pricing_currency,
            is_deposit_required=template.is_deposit_required,
            deposit_percent=template.deposit_percent,
            pricing_tiers=template.pricing_tiers,
            target_client_count=template.target_client_count,
            target_guide_count=template.target_guide_count,
            notes=template.notes,
            is_active=False,
            created_by=request.user,
        )

        serializer = self.get_serializer(duplicate)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def _generate_copy_title(self, template: TripTemplate) -> str:
        base = template.title
        suffix = " (Copy)"
        new_title = f"{base}{suffix}"
        existing = TripTemplate.objects.filter(service=template.service, title=new_title)
        counter = 2
        while existing.exists():
            new_title = f"{base} (Copy {counter})"
            existing = TripTemplate.objects.filter(service=template.service, title=new_title)
            counter += 1
        return new_title
