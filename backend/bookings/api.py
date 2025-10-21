from django.db.models import Q
from django.utils import timezone
from rest_framework import generics, permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import ServiceMembership
from bookings.models import Booking, GuestProfile
from bookings.serializers import (
    GuestProfileSerializer,
    GuestProfileDetailSerializer,
    GuestLinkRequestSerializer,
    GuestProfileUpdateSerializer,
)
from bookings.services.guest_tokens import issue_guest_access_token, validate_guest_access_token


class IsServiceStaff(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.user.is_superuser:
            return True
        return ServiceMembership.objects.filter(
            user=request.user,
            is_active=True,
            role__in=[
                ServiceMembership.OWNER,
                ServiceMembership.MANAGER,
                ServiceMembership.GUIDE,
            ],
        ).exists()


class GuestProfileViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = GuestProfileSerializer
    permission_classes = [permissions.IsAuthenticated, IsServiceStaff]

    def get_queryset(self):
        queryset = (
            GuestProfile.objects.all()
            .prefetch_related(
                "bookings",
                "bookings__trip",
            )
            .order_by("last_name", "first_name")
        )
        query = self.request.query_params.get("q", "").strip()
        if query:
            queryset = queryset.filter(
                Q(email__icontains=query)
                | Q(first_name__icontains=query)
                | Q(last_name__icontains=query)
            )
        return queryset

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = GuestProfileDetailSerializer(instance)
        return Response(serializer.data)


class GuestLinkRequestView(generics.CreateAPIView):
    serializer_class = GuestLinkRequestSerializer
    permission_classes = [permissions.IsAuthenticated, IsServiceStaff]

    def perform_create(self, serializer):
        guest = serializer.validated_data["guest"]
        booking = serializer.validated_data.get("booking")
        expires_at = booking.trip.end + serializer.validated_data["ttl"]
        issue_guest_access_token(
            guest=guest,
            booking=booking,
            expires_at=expires_at,
            single_use=False,
        )


class GuestProfileUpdateView(APIView):
    permission_classes = []  # token-based access

    def patch(self, request, token):
        access_token = validate_guest_access_token(token)
        if access_token is None:
            return Response({"detail": "Invalid or expired token."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = GuestProfileUpdateSerializer(
            access_token.guest_profile,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        booking = access_token.booking
        if booking:
            booking.last_guest_activity_at = timezone.now()
            booking.info_status = Booking.INFO_COMPLETE
            booking.save(update_fields=["last_guest_activity_at", "info_status"])

        if access_token.single_use:
            access_token.mark_used()

        return Response(serializer.data)
