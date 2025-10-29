from django.db.models import Q
from django.utils import timezone
from rest_framework import generics, permissions, serializers, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import ServiceMembership
from bookings.models import TripParty, GuestProfile
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
                "parties",
                "parties__trip",
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
        party = serializer.validated_data.get("party")
        if party is None:
            raise serializers.ValidationError({"party_id": "Party is required."})
        expires_at = party.trip.end + serializer.validated_data["ttl"]
        issue_guest_access_token(
            guest=guest,
            party=party,
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

        party = access_token.party
        if party:
            party.last_guest_activity_at = timezone.now()
            party.info_status = TripParty.INFO_COMPLETE
            party.save(update_fields=["last_guest_activity_at", "info_status"])

        if access_token.single_use:
            access_token.mark_used()

        return Response(serializer.data)
