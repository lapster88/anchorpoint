from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from bookings.models import TripParty, TripPartyGuest, GuestProfile
from bookings.services.payments import get_latest_payment_preview_url
from trips.pricing import select_price_per_guest_cents, snapshot_base_price_cents


class TripPartySummarySerializer(serializers.ModelSerializer):
    trip_title = serializers.CharField(source="trip.title", read_only=True)
    trip_start = serializers.DateTimeField(source="trip.start", read_only=True)
    trip_end = serializers.DateTimeField(source="trip.end", read_only=True)

    class Meta:
        model = TripParty
        fields = [
            "id",
            "trip_title",
            "trip_start",
            "trip_end",
            "party_size",
            "payment_status",
            "info_status",
            "waiver_status",
            "last_guest_activity_at",
        ]


class GuestProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    parties = TripPartySummarySerializer(many=True, read_only=True)

    class Meta:
        model = GuestProfile
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "phone",
            "updated_at",
            "parties",
        ]


class GuestProfileDetailSerializer(serializers.ModelSerializer):
    parties = TripPartySummarySerializer(many=True, read_only=True)
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = GuestProfile
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "phone",
            "date_of_birth",
            "emergency_contact_name",
            "emergency_contact_phone",
            "medical_notes",
            "dietary_notes",
            "parties",
            "created_at",
            "updated_at",
        ]


class GuestProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = GuestProfile
        fields = [
            "first_name",
            "last_name",
            "phone",
            "date_of_birth",
            "emergency_contact_name",
            "emergency_contact_phone",
            "medical_notes",
            "dietary_notes",
        ]


class GuestLinkRequestSerializer(serializers.Serializer):
    guest_id = serializers.PrimaryKeyRelatedField(queryset=GuestProfile.objects.all(), source="guest")
    party_id = serializers.PrimaryKeyRelatedField(
        queryset=TripParty.objects.all(),
        source="party",
    )
    ttl_hours = serializers.IntegerField(min_value=1, required=False, default=24)

    def validate(self, attrs):
        party = attrs.get("party")
        guest = attrs["guest"]
        if party.primary_guest_id != guest.id:
            raise serializers.ValidationError("Guest is not associated with the specified party.")
        return attrs

    def create(self, validated_data):
        return validated_data

    @property
    def data(self):
        return {"detail": "Guest link created."}

    def to_internal_value(self, data):
        ret = super().to_internal_value(data)
        ttl_hours = ret.pop("ttl_hours", 24)
        ret["ttl"] = timedelta(hours=ttl_hours)
        return ret


class GuestInputSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)
    date_of_birth = serializers.CharField(required=False, allow_blank=True)
    emergency_contact_name = serializers.CharField(required=False, allow_blank=True)
    emergency_contact_phone = serializers.CharField(required=False, allow_blank=True)
    medical_notes = serializers.CharField(required=False, allow_blank=True)
    dietary_notes = serializers.CharField(required=False, allow_blank=True)


class TripPartyCreateSerializer(serializers.Serializer):
    primary_guest = GuestInputSerializer()
    additional_guests = GuestInputSerializer(many=True, required=False)
    party_size = serializers.IntegerField(min_value=1, required=False)


class TripPartyUpdateSerializer(serializers.Serializer):
    party_size = serializers.IntegerField(min_value=1, required=False)


class TripPartyResponseSerializer(serializers.ModelSerializer):
    payment_url = serializers.SerializerMethodField()
    guest_portal_url = serializers.SerializerMethodField()
    trip = serializers.IntegerField(source="trip_id", read_only=True)

    class Meta:
        model = TripParty
        fields = [
            "id",
            "trip",
            "party_size",
            "payment_status",
            "info_status",
            "waiver_status",
            "payment_url",
            "guest_portal_url",
        ]

    def get_payment_url(self, obj: TripParty):
        return getattr(obj, "_payment_url", None)

    def get_guest_portal_url(self, obj: TripParty):
        return getattr(obj, "_guest_portal_url", None)


class TripPartySerializer(serializers.ModelSerializer):
    primary_guest_name = serializers.CharField(source="primary_guest.full_name", read_only=True)
    primary_guest_email = serializers.EmailField(source="primary_guest.email", read_only=True)
    payment_preview_url = serializers.SerializerMethodField()
    guests = serializers.SerializerMethodField()
    price_per_guest_cents = serializers.SerializerMethodField()
    price_per_guest = serializers.SerializerMethodField()
    total_amount_cents = serializers.SerializerMethodField()
    total_amount = serializers.SerializerMethodField()

    class Meta:
        model = TripParty
        fields = [
            "id",
            "trip_id",
            "primary_guest_name",
            "primary_guest_email",
            "party_size",
            "payment_status",
            "info_status",
            "waiver_status",
            "created_at",
            "payment_preview_url",
            "guests",
            "price_per_guest_cents",
            "price_per_guest",
            "total_amount_cents",
            "total_amount",
        ]
        read_only_fields = fields

    def get_payment_preview_url(self, obj: TripParty):
        return get_latest_payment_preview_url(obj)

    def get_guests(self, obj: TripParty):
        guests = obj.party_guests.select_related("guest")
        return [
            {
                "id": guest.guest_id,
                "full_name": guest.guest.full_name,
                "email": guest.guest.email,
                "is_primary": guest.is_primary,
            }
            for guest in guests
        ]

    def get_price_per_guest_cents(self, obj: TripParty) -> int:
        trip = obj.trip
        party_size = obj.party_size or 1
        cents = select_price_per_guest_cents(
            trip.pricing_snapshot,
            party_size,
            default=snapshot_base_price_cents(trip.pricing_snapshot),
        )
        return cents or trip.price_cents

    def get_price_per_guest(self, obj: TripParty) -> str:
        cents = self.get_price_per_guest_cents(obj)
        return f"{cents / 100:.2f}"

    def get_total_amount_cents(self, obj: TripParty) -> int:
        return self.get_price_per_guest_cents(obj) * (obj.party_size or 1)

    def get_total_amount(self, obj: TripParty) -> str:
        return f"{self.get_total_amount_cents(obj) / 100:.2f}"
