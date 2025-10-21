from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from bookings.models import Booking, BookingGuest, GuestProfile


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
        ]


class GuestProfileDetailSerializer(serializers.ModelSerializer):
    bookings = BookingSummarySerializer(source="bookings", many=True, read_only=True)

    class Meta:
        model = GuestProfile
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "phone",
            "date_of_birth",
            "emergency_contact_name",
            "emergency_contact_phone",
            "medical_notes",
            "dietary_notes",
            "bookings",
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
