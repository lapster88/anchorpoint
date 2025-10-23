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
    guides = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), many=True, required=False, allow_empty=True
    )

    class Meta(TripSerializer.Meta):
        fields = TripSerializer.Meta.fields + ["party", "guides"]

    def create(self, validated_data):
        party_data = validated_data.pop("party")
        guides = validated_data.pop("guides", [])
        trip = super().create(validated_data)
        self.context["party_data"] = party_data
        # Preserve unique guides in insertion order for the view to apply afterwards.
        seen = set()
        ordered_guides = []
        for guide in guides:
            if guide.id not in seen:
                ordered_guides.append(guide)
                seen.add(guide.id)
        self.context["guides"] = ordered_guides
        self.guides = ordered_guides
        return trip

    def validate(self, attrs):
        guides = attrs.get("guides") or []
        service = attrs.get("guide_service")

        seen_ids = set()
        for guide in guides:
            if guide.id in seen_ids:
                raise serializers.ValidationError({"guides": "Duplicate guides are not allowed."})
            seen_ids.add(guide.id)
            if service:
                is_active = ServiceMembership.objects.filter(
                    user=guide,
                    guide_service=service,
                    role=ServiceMembership.GUIDE,
                    is_active=True,
                ).exists()
                if not is_active:
                    raise serializers.ValidationError(
                        {"guides": f"{guide.display_name or guide.email} is not active for this service."}
                    )
        return super().validate(attrs)


class GuideSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "display_name", "first_name", "last_name", "email"]
