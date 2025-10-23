from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from bookings.models import Booking, BookingGuest, GuestProfile
from bookings.services.payments import get_latest_payment_preview_url


class BookingSummarySerializer(serializers.ModelSerializer):
    trip_title = serializers.CharField(source="trip.title", read_only=True)
    trip_start = serializers.DateTimeField(source="trip.start", read_only=True)
    trip_end = serializers.DateTimeField(source="trip.end", read_only=True)

    class Meta:
        model = Booking
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
    parties = BookingSummarySerializer(many=True, read_only=True, source="bookings")

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
    parties = BookingSummarySerializer(many=True, read_only=True, source="bookings")
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
    booking_id = serializers.PrimaryKeyRelatedField(
        queryset=Booking.objects.all(),
        source="booking",
        allow_null=True,
        required=False,
    )
    ttl_hours = serializers.IntegerField(min_value=1, required=False, default=24)

    def validate(self, attrs):
        booking = attrs.get("booking")
        guest = attrs["guest"]
        if booking and booking.primary_guest_id != guest.id:
            raise serializers.ValidationError("Guest is not associated with the specified booking.")
        return attrs

    def create(self, validated_data):
        # handled in view
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


class BookingCreateSerializer(serializers.Serializer):
    primary_guest = GuestInputSerializer()
    additional_guests = GuestInputSerializer(many=True, required=False)
    party_size = serializers.IntegerField(min_value=1, required=False)


class BookingResponseSerializer(serializers.ModelSerializer):
    payment_url = serializers.SerializerMethodField()
    guest_portal_url = serializers.SerializerMethodField()
    trip = serializers.IntegerField(source="trip_id", read_only=True)

    class Meta:
        model = Booking
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

    def get_payment_url(self, obj):
        return getattr(obj, "_payment_url", None)

    def get_guest_portal_url(self, obj):
        return getattr(obj, "_guest_portal_url", None)


class TripPartySerializer(serializers.ModelSerializer):
    primary_guest_name = serializers.CharField(source="primary_guest.full_name", read_only=True)
    primary_guest_email = serializers.EmailField(source="primary_guest.email", read_only=True)
    payment_preview_url = serializers.SerializerMethodField()
    guests = serializers.SerializerMethodField()

    class Meta:
        model = Booking
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
        ]
        read_only_fields = fields

    def get_payment_preview_url(self, obj: Booking):
        return get_latest_payment_preview_url(obj)

    def get_guests(self, obj: Booking):
        guests = (
            obj.booking_guests.select_related("guest")
            .all()
        )
        return [
            {
                "id": guest.guest_id,
                "full_name": guest.guest.full_name,
                "email": guest.guest.email,
                "is_primary": guest.is_primary,
            }
            for guest in guests
        ]
