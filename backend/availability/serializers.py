from rest_framework import serializers

from .models import (
    GuideAvailability,
    GuideAvailabilityShare,
    GuideCalendarIntegration,
)


class GuideAvailabilitySerializer(serializers.ModelSerializer):
    """Expose guide availability slots to the current user."""

    guide_service_name = serializers.CharField(
        source="guide_service.name", read_only=True
    )
    trip_title = serializers.CharField(source="trip.title", read_only=True)
    source_display = serializers.CharField(
        source="get_source_display", read_only=True
    )
    note = serializers.CharField(allow_blank=True, allow_null=True, required=False)

    class Meta:
        model = GuideAvailability
        fields = [
            "id",
            "guide_service",
            "guide_service_name",
            "trip",
            "trip_title",
            "start",
            "end",
            "is_available",
            "source",
            "source_display",
            "visibility",
            "note",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "guide",
            "trip",
            "source",
            "source_display",
            "created_at",
            "updated_at",
            "guide_service_name",
            "trip_title",
        ]

    def validate(self, attrs):
        start = attrs.get("start", getattr(self.instance, "start", None))
        end = attrs.get("end", getattr(self.instance, "end", None))
        if start and end and end <= start:
            raise serializers.ValidationError("End time must be after start time.")
        return attrs

    def create(self, validated_data):
        validated_data.setdefault("source", GuideAvailability.SOURCE_MANUAL)
        validated_data.setdefault("is_available", False)
        guide_service = validated_data.get("guide_service")
        if guide_service in ("", None):
            validated_data["guide_service"] = None
        note = validated_data.get("note", "")
        if note is None:
            validated_data["note"] = ""
        if "guide" not in validated_data:
            request = self.context.get("request")
            if request:
                validated_data["guide"] = request.user
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop("guide", None)
        validated_data.pop("source", None)
        validated_data.pop("trip", None)
        guide_service = validated_data.get("guide_service", object())
        if guide_service == "":
            validated_data["guide_service"] = None
        if validated_data.get("note", object()) is None:
            validated_data["note"] = ""
        return super().update(instance, validated_data)


class GuideAvailabilityShareSerializer(serializers.ModelSerializer):
    """Control visibility overrides for a specific service."""

    guide_service_name = serializers.CharField(
        source="guide_service.name", read_only=True
    )

    class Meta:
        model = GuideAvailabilityShare
        fields = ["id", "guide_service", "guide_service_name", "visibility"]
        read_only_fields = ["id", "guide_service_name"]

    def validate(self, attrs):
        availability = self.context.get("availability") or getattr(
            self.instance, "availability", None
        )
        if availability is None:
            raise serializers.ValidationError("Availability context is required.")
        request = self.context.get("request")
        if request and availability.guide_id != request.user.id:
            raise serializers.ValidationError(
                "Cannot modify visibility for another guide."
            )
        guide_service = attrs.get("guide_service") or getattr(
            self.instance, "guide_service", None
        )
        if guide_service is None:
            raise serializers.ValidationError({"guide_service": "This field is required."})
        if (
            self.instance is None
            and GuideAvailabilityShare.objects.filter(
                availability=availability, guide_service=guide_service
            ).exists()
        ):
            raise serializers.ValidationError(
                "Visibility override already exists for this service."
            )
        attrs["availability"] = availability
        return attrs

    def create(self, validated_data):
        return GuideAvailabilityShare.objects.create(**validated_data)


class GuideCalendarIntegrationSerializer(serializers.ModelSerializer):
    """Manage external calendar integration metadata."""

    provider_display = serializers.CharField(
        source="get_provider_display", read_only=True
    )

    class Meta:
        model = GuideCalendarIntegration
        fields = [
            "id",
            "provider",
            "provider_display",
            "external_id",
            "is_active",
            "sync_config",
            "last_synced_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["last_synced_at", "created_at", "updated_at"]
