from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from availability.models import (
    GuideAvailability,
    GuideAvailabilityShare,
    GuideCalendarIntegration,
)
from availability.serializers import (
    GuideAvailabilitySerializer,
    GuideAvailabilityShareSerializer,
    GuideCalendarIntegrationSerializer,
)


class GuideAvailabilityViewSet(viewsets.ModelViewSet):
    """CRUD viewset for a guide to manage their availability slots."""

    serializer_class = GuideAvailabilitySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return GuideAvailability.objects.filter(guide=self.request.user).order_by("start")

    def perform_create(self, serializer):
        serializer.save(guide=self.request.user)

    def perform_update(self, serializer):
        serializer.save(guide=self.request.user)

    @action(
        detail=True,
        methods=["get", "post", "delete"],
        serializer_class=GuideAvailabilityShareSerializer,
    )
    def shares(self, request, pk=None):
        """Manage per-service visibility overrides for a specific availability row."""
        availability = self.get_object()
        if request.method == "GET":
            queryset = availability.shares.select_related("guide_service")
            serializer = GuideAvailabilityShareSerializer(
                queryset, many=True, context={"request": request}
            )
            return Response(serializer.data)
        if request.method == "POST":
            serializer = GuideAvailabilityShareSerializer(
                data=request.data,
                context={"availability": availability, "request": request},
            )
            serializer.is_valid(raise_exception=True)
            share = serializer.save()
            return Response(
                GuideAvailabilityShareSerializer(
                    share, context={"request": request}
                ).data,
                status=status.HTTP_201_CREATED,
            )
        service_id = request.query_params.get("guide_service")
        if not service_id:
            return Response(
                {"detail": "guide_service query param required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        availability.shares.filter(guide_service_id=service_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GuideCalendarIntegrationViewSet(viewsets.ModelViewSet):
    """Manage external calendar integrations for the current guide."""

    serializer_class = GuideCalendarIntegrationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return GuideCalendarIntegration.objects.filter(guide=self.request.user)

    def perform_create(self, serializer):
        serializer.save(guide=self.request.user)

    def perform_update(self, serializer):
        serializer.save(guide=self.request.user)
