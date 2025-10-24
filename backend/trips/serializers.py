from rest_framework import serializers

from accounts.models import ServiceMembership, User
from bookings.serializers import BookingCreateSerializer, TripPartySerializer
from .models import Trip, Assignment, TripTemplate


class TripSerializer(serializers.ModelSerializer):
    parties = TripPartySerializer(many=True, read_only=True, source="bookings")
    guide_service_name = serializers.CharField(source="guide_service.name", read_only=True)
    assignments = serializers.SerializerMethodField()
    requires_assignment = serializers.SerializerMethodField()
    template_id = serializers.IntegerField(source="template_used_id", read_only=True)

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
             "target_client_count",
             "target_guide_count",
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
            "price_cents": {"required": False},
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
    party = BookingCreateSerializer(write_only=True)
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

        if template is not None:
            validated_data["template_used"] = template
            validated_data["template_snapshot"] = template.to_snapshot()
            if not validated_data.get("title"):
                validated_data["title"] = template.title
            if not validated_data.get("location"):
                validated_data["location"] = template.location
            validated_data.setdefault("duration_hours", template.duration_hours)
            validated_data.setdefault("target_client_count", template.target_client_count)
            validated_data.setdefault("target_guide_count", template.target_guide_count)
            if not validated_data.get("notes"):
                validated_data["notes"] = template.notes
            snapshot = template.to_snapshot()
            pricing_snapshot = snapshot.get("pricing")
            validated_data["pricing_snapshot"] = pricing_snapshot
            base_price = _snapshot_base_price_cents(pricing_snapshot)
            if base_price is not None:
                validated_data["price_cents"] = base_price

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
        template = attrs.get("template")

        if template and service and template.service_id != service.id:
            raise serializers.ValidationError({"template": "Template must belong to the same guide service."})
        if template and not template.is_active:
            raise serializers.ValidationError({"template": "Template is no longer active."})
        price_cents = attrs.get("price_cents")
        if template is None and price_cents in (None, "", 0):
            raise serializers.ValidationError({"price_cents": "Price per guest is required when no template pricing is selected."})
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
            "location",
            "pricing_currency",
            "is_deposit_required",
            "deposit_percent",
            "pricing_tiers",
            "target_client_count",
            "target_guide_count",
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

        # Ensure tiers are contiguous, start at 1, and final tier open-ended
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


def _snapshot_base_price_cents(snapshot: dict) -> int | None:
    if not snapshot:
        return None
    tiers = snapshot.get("tiers")
    if not tiers:
        return None
    first = tiers[0]
    cents = first.get("price_per_guest_cents")
    if cents is not None:
        return cents
    price = first.get("price_per_guest")
    if price is None:
        return None
    try:
        return int(round(float(price) * 100))
    except (TypeError, ValueError):
        return None
