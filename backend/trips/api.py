from rest_framework import permissions, viewsets

from accounts.models import ServiceMembership
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

        # Guests or other roles do not see trips by default.
        return base_queryset.none()
