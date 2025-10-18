from rest_framework import viewsets, permissions
from .models import Trip
from .serializers import TripSerializer

class IsServiceMember(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return True  # TODO: implement membership check

class TripViewSet(viewsets.ModelViewSet):
    queryset = Trip.objects.all().order_by('start')
    serializer_class = TripSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ['guide_service','start','end']
    search_fields = ['title','location','description']
    ordering_fields = ['start','end','price_cents']
