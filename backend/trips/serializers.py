from datetime import timedelta

from rest_framework import serializers

from accounts.models import ServiceMembership, User
from bookings.serializers import TripPartyCreateSerializer, TripPartySerializer
from .models import Trip, Assignment, TripTemplate
from .pricing import build_single_tier_snapshot


class TripSerializer(serializers.ModelSerializer):
    parties = TripPartySerializer(many=True, read_only=True)
    guide_service_name = serializers.CharField(source="guide_service.name", read_only=True)
    assignments = serializers.SerializerMethodField()
    requires_assignment = serializers.SerializerMethodField()
    template_id = serializers.IntegerField(source="template_used_id", read_only=True)
    price_cents = serializers.IntegerField(min_value=1, required=False)

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
            "price_cents",
            "difficulty",
            "description",
            "duration_hours",
            "duration_days",
            "timing_mode",
            "target_clients_per_guide",
            "notes",
            "pricing_snapshot",
            "template_id",
            "template_snapshot",
            "parties",
            "assignments",
            "requires_assignment",
        ]
        read_only_fields = [
            "pricing_snapshot",
            "template_snapshot",
            "template_id",
        ]
        extra_kwargs = {
            "title": {"required": False},
            "location": {"required": False},
            "end": {"required": False},
        }

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
    party = TripPartyCreateSerializer(write_only=True)
    guides = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), many=True, required=False, allow_empty=True
    )
    template = serializers.PrimaryKeyRelatedField(
        queryset=TripTemplate.objects.filter(is_active=True),
        required=False,
        allow_null=True,
        write_only=True,
    )

    class Meta(TripSerializer.Meta):
        fields = TripSerializer.Meta.fields + ["party", "guides", "template"]
        read_only_fields = TripSerializer.Meta.read_only_fields + ["pricing_snapshot", "template_snapshot"]

    def create(self, validated_data):
        party_data = validated_data.pop("party")
        guides = validated_data.pop("guides", [])
        template = validated_data.pop("template", None)
        price_cents = validated_data.pop("price_cents", None)

        if template is not None:
            validated_data["template_used"] = template
            validated_data["template_snapshot"] = template.to_snapshot()
            if not validated_data.get("title"):
                validated_data["title"] = template.title
            if not validated_data.get("location"):
                validated_data["location"] = template.location
            validated_data.setdefault("timing_mode", template.timing_mode)
            validated_data.setdefault("target_clients_per_guide", template.target_clients_per_guide)
            if not validated_data.get("notes"):
                validated_data["notes"] = template.notes
            snapshot = template.to_snapshot()
            pricing_snapshot = snapshot.get("pricing")
            validated_data["pricing_snapshot"] = pricing_snapshot
        else:
            if price_cents is None:
                raise serializers.ValidationError({"price_cents": "Price per guest is required."})
            validated_data["pricing_snapshot"] = build_single_tier_snapshot(price_cents)

        trip = super().create(validated_data)
        self.context["party_data"] = party_data
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
        template = attrs.get("template")
        price_cents = attrs.get("price_cents")

        if template and service and template.service_id != service.id:
            raise serializers.ValidationError({"template": "Template must belong to the same guide service."})
        if template and not template.is_active:
            raise serializers.ValidationError({"template": "Template is no longer active."})
        if template is None and price_cents in (None, "", 0):
            raise serializers.ValidationError({"price_cents": "Price per guest is required when no template pricing is selected."})
        timing_mode = attrs.get("timing_mode") or (template.timing_mode if template else Trip.MULTI_DAY)
        attrs["timing_mode"] = timing_mode

        if template is not None:
            if timing_mode == Trip.SINGLE_DAY:
                attrs.setdefault("duration_hours", template.duration_hours)
                attrs["duration_days"] = None
            else:
                attrs.setdefault("duration_days", template.duration_days or 1)
                attrs["duration_hours"] = None

        ratio = attrs.get("target_clients_per_guide")
        if ratio is not None and ratio <= 0:
            raise serializers.ValidationError({"target_clients_per_guide": "Enter a value greater than zero."})

        start = attrs.get("start")
        if not start:
            raise serializers.ValidationError({"start": "Start time is required."})

        if timing_mode == Trip.SINGLE_DAY:
            duration_hours = attrs.get("duration_hours")
            if duration_hours in (None, "", 0):
                raise serializers.ValidationError({"duration_hours": "Duration in hours is required for single-day trips."})
            try:
                duration_hours = int(duration_hours)
            except (TypeError, ValueError):
                raise serializers.ValidationError({"duration_hours": "Duration must be a positive integer."})
            if duration_hours <= 0:
                raise serializers.ValidationError({"duration_hours": "Duration must be greater than zero."})
            attrs["duration_hours"] = duration_hours
            attrs["duration_days"] = None
            attrs["end"] = start + timedelta(hours=duration_hours)
        else:
            duration_days = attrs.get("duration_days")
            if duration_days in (None, "", 0):
                raise serializers.ValidationError({"duration_days": "Duration in days is required for multi-day trips."})
            try:
                duration_days = int(duration_days)
            except (TypeError, ValueError):
                raise serializers.ValidationError({"duration_days": "Duration must be a positive integer."})
            if duration_days <= 0:
                raise serializers.ValidationError({"duration_days": "Duration must be at least one day."})
            attrs["duration_days"] = duration_days
            attrs["duration_hours"] = None
            attrs["end"] = start + timedelta(days=duration_days)

        if not template:
            if not attrs.get("title"):
                raise serializers.ValidationError({"title": "This field is required."})
            if not attrs.get("location"):
                raise serializers.ValidationError({"location": "This field is required."})

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


class TripUpdateSerializer(TripSerializer):
    price_cents = serializers.IntegerField(min_value=1, required=False)

    class Meta(TripSerializer.Meta):
        read_only_fields = TripSerializer.Meta.read_only_fields

    def validate(self, attrs):
        instance: Trip = self.instance
        if instance is None:
            return super().validate(attrs)

        start = attrs.get("start", instance.start)
        timing_mode = attrs.get("timing_mode", instance.timing_mode)

        if timing_mode == Trip.SINGLE_DAY:
            duration_hours = attrs.get("duration_hours", instance.duration_hours)
            if duration_hours in (None, "", 0):
                raise serializers.ValidationError({"duration_hours": "Duration in hours is required for single-day trips."})
            try:
                duration_hours = int(duration_hours)
            except (TypeError, ValueError):
                raise serializers.ValidationError({"duration_hours": "Duration must be a positive integer."})
            if duration_hours <= 0:
                raise serializers.ValidationError({"duration_hours": "Duration must be greater than zero."})
            attrs["timing_mode"] = Trip.SINGLE_DAY
            attrs["duration_hours"] = duration_hours
            attrs["duration_days"] = None
            attrs["end"] = start + timedelta(hours=duration_hours)
        else:
            duration_days = attrs.get("duration_days", instance.duration_days)
            if duration_days in (None, "", 0):
                raise serializers.ValidationError({"duration_days": "Duration in days is required for multi-day trips."})
            try:
                duration_days = int(duration_days)
            except (TypeError, ValueError):
                raise serializers.ValidationError({"duration_days": "Duration must be a positive integer."})
            if duration_days <= 0:
                raise serializers.ValidationError({"duration_days": "Duration must be at least one day."})
            attrs["timing_mode"] = Trip.MULTI_DAY
            attrs["duration_days"] = duration_days
            attrs["duration_hours"] = None
            attrs["end"] = start + timedelta(days=duration_days)

        return super().validate(attrs)

    def update(self, instance, validated_data):
        price_cents = validated_data.pop("price_cents", None)
        instance = super().update(instance, validated_data)

        if price_cents is not None:
            instance.update_single_tier_pricing(price_cents)
            instance.save(update_fields=["pricing_snapshot"])

        return instance


class TripTemplateSerializer(serializers.ModelSerializer):
    pricing_tiers = serializers.ListField(child=serializers.DictField(), allow_empty=False)
    deposit_percent = serializers.DecimalField(max_digits=5, decimal_places=2, default=0)

    class Meta:
        model = TripTemplate
        fields = [
            "id",
            "service",
            "title",
            "duration_hours",
            "duration_days",
            "location",
            "timing_mode",
            "pricing_currency",
            "is_deposit_required",
            "deposit_percent",
            "pricing_tiers",
            "target_clients_per_guide",
            "notes",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        tiers = attrs.get("pricing_tiers") or getattr(self.instance, "pricing_tiers", [])
        if not tiers:
            raise serializers.ValidationError({"pricing_tiers": "At least one tier is required."})

        ratio = attrs.get("target_clients_per_guide")
        if ratio is None:
            ratio = getattr(self.instance, "target_clients_per_guide", None)
        if ratio is not None and ratio <= 0:
            raise serializers.ValidationError({"target_clients_per_guide": "Enter a value greater than zero."})

        timing_mode = attrs.get("timing_mode") or getattr(self.instance, "timing_mode", Trip.MULTI_DAY)
        attrs["timing_mode"] = timing_mode
        if timing_mode == Trip.SINGLE_DAY:
            duration_hours = attrs.get("duration_hours")
            if duration_hours is None:
                duration_hours = getattr(self.instance, "duration_hours", None)
            if duration_hours in (None, "", 0):
                raise serializers.ValidationError({"duration_hours": "Duration in hours is required for single-day templates."})
            try:
                duration_hours = int(duration_hours)
            except (TypeError, ValueError):
                raise serializers.ValidationError({"duration_hours": "Duration must be a positive integer."})
            if duration_hours <= 0:
                raise serializers.ValidationError({"duration_hours": "Duration must be greater than zero."})
            attrs["duration_hours"] = duration_hours
            attrs["duration_days"] = None
        else:
            duration_days = attrs.get("duration_days")
            if duration_days is None:
                duration_days = getattr(self.instance, "duration_days", None)
            if duration_days in (None, "", 0):
                raise serializers.ValidationError({"duration_days": "Duration in days is required for multi-day templates."})
            try:
                duration_days = int(duration_days)
            except (TypeError, ValueError):
                raise serializers.ValidationError({"duration_days": "Duration must be a positive integer."})
            if duration_days <= 0:
                raise serializers.ValidationError({"duration_days": "Duration must be at least one day."})
            attrs["duration_days"] = duration_days
            attrs["duration_hours"] = None

        sorted_tiers = sorted(tiers, key=lambda t: t.get("min_guests") or 0)
        last_max = 0
        for index, tier in enumerate(sorted_tiers):
            min_guests = tier.get("min_guests")
            max_guests = tier.get("max_guests")
            price = tier.get("price_per_guest")
            if min_guests is None or min_guests < 1:
                raise serializers.ValidationError({"pricing_tiers": f"Tier {index + 1}: min_guests must be at least 1."})
            if max_guests is not None and max_guests < min_guests:
                raise serializers.ValidationError({"pricing_tiers": f"Tier {index + 1}: max_guests must be >= min_guests."})
            if last_max == 0 and min_guests != 1:
                raise serializers.ValidationError({"pricing_tiers": "Tiers must start at 1 guest."})
            if last_max and min_guests != last_max + 1:
                raise serializers.ValidationError({"pricing_tiers": "Tiers must be contiguous without gaps."})
            try:
                float(price)
            except (TypeError, ValueError):
                raise serializers.ValidationError({"pricing_tiers": f"Tier {index + 1}: price_per_guest must be numeric."})
            last_max = max_guests if max_guests is not None else min_guests

        if sorted_tiers[-1].get("max_guests") is not None:
            raise serializers.ValidationError({"pricing_tiers": "Final tier must leave max_guests blank for open-ended ranges."})

        deposit = attrs.get("deposit_percent")
        if deposit is not None:
            if deposit < 0 or deposit > 100:
                raise serializers.ValidationError({"deposit_percent": "Deposit percent must be between 0 and 100."})
            if attrs.get("is_deposit_required") and deposit == 0:
                raise serializers.ValidationError({"deposit_percent": "Deposit percent must be greater than 0 when a deposit is required."})
        return attrs
