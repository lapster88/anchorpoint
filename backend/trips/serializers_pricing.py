from rest_framework import serializers

from accounts.models import ServiceMembership
from .models import PricingModel, PricingTier


class PricingTierSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    class Meta:
        model = PricingTier
        fields = ["id", "min_guests", "max_guests", "price_per_guest"]
        read_only_fields = []

    def validate_price_per_guest(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError("Price per guest must be greater than zero.")
        return value


class PricingModelSerializer(serializers.ModelSerializer):
    tiers = PricingTierSerializer(many=True)

    class Meta:
        model = PricingModel
        fields = [
            "id",
            "service",
            "name",
            "description",
            "default_location",
            "currency",
            "is_deposit_required",
            "deposit_percent",
            "tiers",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        deposit = attrs.get("deposit_percent", 0)
        try:
            deposit_value = float(deposit)
        except (TypeError, ValueError):
            raise serializers.ValidationError({"deposit_percent": "Deposit percent must be a number."})
        if deposit_value < 0 or deposit_value > 100:
            raise serializers.ValidationError({"deposit_percent": "Deposit percent must be between 0 and 100."})
        if attrs.get("is_deposit_required") and deposit_value == 0:
            raise serializers.ValidationError({"deposit_percent": "Deposit percent must be greater than 0 when a deposit is required."})
        attrs["deposit_percent"] = deposit_value

        tiers_data = self.initial_data.get("tiers", [])
        if not tiers_data:
            raise serializers.ValidationError({"tiers": "At least one pricing tier is required."})

        seen_ranges = []
        last_max = 0
        for idx, tier in enumerate(sorted(tiers_data, key=lambda t: t.get("min_guests") or 0)):
            min_guests = tier.get("min_guests")
            max_guests = tier.get("max_guests")

            if min_guests is None or min_guests < 1:
                raise serializers.ValidationError({"tiers": f"Tier {idx + 1}: min_guests must be at least 1."})
            if max_guests is not None and max_guests < min_guests:
                raise serializers.ValidationError({"tiers": f"Tier {idx + 1}: max_guests must be >= min_guests."})

            if last_max and min_guests != last_max + 1:
                raise serializers.ValidationError({"tiers": "Tiers must be contiguous without gaps."})
            if last_max == 0 and min_guests != 1:
                raise serializers.ValidationError({"tiers": "Tiers must start at 1 guest."})

            seen_ranges.append((min_guests, max_guests))
            last_max = max_guests if max_guests is not None else min_guests

        if seen_ranges[-1][1] is not None:
            raise serializers.ValidationError({"tiers": "Final tier must allow open-ended guests (max_guests=null)."})

        return attrs

    def create(self, validated_data):
        tiers_data = validated_data.pop("tiers")
        model = PricingModel.objects.create(**validated_data)
        self._upsert_tiers(model, tiers_data)
        return model

    def update(self, instance, validated_data):
        tiers_data = validated_data.pop("tiers")
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save(update_fields=list(validated_data.keys()))
        self._upsert_tiers(instance, tiers_data)
        return instance

    def _upsert_tiers(self, model: PricingModel, tiers_data):
        existing = {tier.id: tier for tier in model.tiers.all()}
        seen_ids = set()
        for tier_payload in tiers_data:
            tier_id = tier_payload.get("id")
            if tier_id and tier_id in existing:
                tier = existing[tier_id]
                tier.min_guests = tier_payload["min_guests"]
                tier.max_guests = tier_payload.get("max_guests")
                tier.price_per_guest = tier_payload["price_per_guest"]
                tier.save(update_fields=["min_guests", "max_guests", "price_per_guest"])
                seen_ids.add(tier_id)
            else:
                PricingTier.objects.create(
                    model=model,
                    min_guests=tier_payload["min_guests"],
                    max_guests=tier_payload.get("max_guests"),
                    price_per_guest=tier_payload["price_per_guest"],
                )
        to_delete = [tier_id for tier_id in existing if tier_id not in seen_ids]
        if to_delete:
            model.tiers.filter(id__in=to_delete).delete()
