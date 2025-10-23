from rest_framework import serializers

from accounts.models import ServiceMembership, User
from bookings.serializers import BookingCreateSerializer, TripPartySerializer
from .models import Trip, Assignment


class TripSerializer(serializers.ModelSerializer):
    parties = TripPartySerializer(many=True, read_only=True, source="bookings")
    guide_service_name = serializers.CharField(source="guide_service.name", read_only=True)
    assignments = serializers.SerializerMethodField()
    requires_assignment = serializers.SerializerMethodField()

    class Meta:
        model = Trip
        fields = [
            "id",
            "guide_service",
            "guide_service_name",
            "title",
            "location",
            "start",
            "end",
            "capacity",
            "price_cents",
            "difficulty",
            "description",
            "parties",
            "assignments",
            "requires_assignment",
        ]

    def get_assignments(self, obj: Trip):
        assignments = obj.assignments.select_related("guide")
        return [
            {
                "id": assignment.id,
                "guide_id": assignment.guide_id,
                "role": assignment.role,
                "guide_name": assignment.guide.display_name
                or f"{assignment.guide.first_name} {assignment.guide.last_name}".strip()
                or assignment.guide.email,
            }
            for assignment in assignments
        ]

    def get_requires_assignment(self, obj: Trip) -> bool:
        return not obj.assignments.exists()


class TripCreateSerializer(TripSerializer):
    party = BookingCreateSerializer(write_only=True)
    guide = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False, allow_null=True)

    class Meta(TripSerializer.Meta):
        fields = TripSerializer.Meta.fields + ["party", "guide"]

    def create(self, validated_data):
        party_data = validated_data.pop("party")
        guide = validated_data.pop("guide", None)
        trip = super().create(validated_data)
        self.context["party_data"] = party_data
        self.context["guide"] = guide
        return trip

    def validate(self, attrs):
        guide = attrs.get("guide")
        service = attrs.get("guide_service")
        if guide and service:
            is_active = ServiceMembership.objects.filter(
                user=guide,
                guide_service=service,
                role=ServiceMembership.GUIDE,
                is_active=True,
            ).exists()
            if not is_active:
                raise serializers.ValidationError({"guide": "Selected guide is not active for this service."})
        return super().validate(attrs)


class GuideSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "display_name", "first_name", "last_name", "email"]
