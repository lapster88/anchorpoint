from decimal import Decimal

from rest_framework import serializers

from accounts.models import ServiceMembership, User
from bookings.serializers import BookingCreateSerializer, TripPartySerializer
from .models import Trip, Assignment, TripTemplate, PricingModel


class TripSerializer(serializers.ModelSerializer):
    parties = TripPartySerializer(many=True, read_only=True, source="bookings")
    guide_service_name = serializers.CharField(source="guide_service.name", read_only=True)
    assignments = serializers.SerializerMethodField()
    requires_assignment = serializers.SerializerMethodField()
    pricing_model_name = serializers.CharField(source="pricing_model.name", read_only=True)
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
             "pricing_model",
             "pricing_model_name",
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
            "pricing_model_name",
            "template_id",
        ]
        extra_kwargs = {
            "title": {"required": False},
            "location": {"required": False},
            "price_cents": {"required": False},
            "pricing_model": {"required": False, "allow_null": True},
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
    pricing_model = serializers.PrimaryKeyRelatedField(
        queryset=PricingModel.objects.all(),
        required=False,
        allow_null=True,
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
            if not validated_data.get("pricing_model"):
                validated_data["pricing_model"] = template.pricing_model

        pricing_model = validated_data.get("pricing_model")
        if pricing_model is not None:
            snapshot = pricing_model.to_snapshot()
            validated_data["pricing_snapshot"] = snapshot
            base_price = _snapshot_base_price_cents(snapshot)
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
        pricing_model = attrs.get("pricing_model")

        if template and service and template.service_id != service.id:
            raise serializers.ValidationError({"template": "Template must belong to the same guide service."})
        if template and not template.is_active:
            raise serializers.ValidationError({"template": "Template is no longer active."})
        resolved_pricing_model = pricing_model or (template.pricing_model if template else None)
        if resolved_pricing_model and service and resolved_pricing_model.service_id != service.id:
            raise serializers.ValidationError({"pricing_model": "Pricing model must belong to the same guide service."})
        price_cents = attrs.get("price_cents")
        if resolved_pricing_model is None and price_cents in (None, "", 0):
            raise serializers.ValidationError({"price_cents": "Price per guest is required when no pricing model is selected."})
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
    pricing_model_name = serializers.CharField(source="pricing_model.name", read_only=True)

    class Meta:
        model = TripTemplate
        fields = [
            "id",
            "service",
            "title",
            "duration_hours",
            "location",
            "pricing_model",
            "pricing_model_name",
            "target_client_count",
            "target_guide_count",
            "notes",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "pricing_model_name"]

    def validate(self, attrs):
        service = attrs.get("service") or getattr(self.instance, "service", None)
        pricing_model = attrs.get("pricing_model") or getattr(self.instance, "pricing_model", None)
        if service and pricing_model and pricing_model.service_id != service.id:
            raise serializers.ValidationError({"pricing_model": "Pricing model must belong to the same guide service."})
        return attrs


def _snapshot_base_price_cents(snapshot: dict) -> int | None:
    tiers = snapshot.get("tiers") if snapshot else None
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
        amount = Decimal(str(price))
    except Exception:  # pragma: no cover - defensive
        return None
    return int((amount * 100).quantize(Decimal("1")))
