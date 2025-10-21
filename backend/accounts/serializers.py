from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import (
    GuideAvailability,
    GuideAvailabilityShare,
    GuideCalendarIntegration,
    ServiceMembership,
)

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """Expose the public fields for the custom user model."""

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "display_name",
        ]
        read_only_fields = ["id", "username"]


class RegisterSerializer(serializers.ModelSerializer):
    """Validate and create a user during registration."""

    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = [
            "email",
            "password",
            "first_name",
            "last_name",
            "display_name",
        ]

    def validate_email(self, value: str) -> str:
        email = value.lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return email

    def create(self, validated_data):
        """Persist the user record with a normalized email and display name."""
        email = validated_data.pop("email").lower()
        user = User.objects.create_user(
            username=email,
            email=email,
            password=validated_data.pop("password"),
            **validated_data,
        )
        if not user.display_name:
            user.display_name = f"{user.first_name} {user.last_name}".strip() or email
            user.save(update_fields=["display_name"])
        return user


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Allow SimpleJWT to accept an email field for authentication."""

    username_field = User.USERNAME_FIELD

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["email"] = serializers.EmailField(required=False)
        self.fields[self.username_field].required = False

    def validate(self, attrs):
        """Proxy email through to SimpleJWT while returning user details."""
        email = attrs.get("email")
        if email and not attrs.get("username"):
            attrs["username"] = email.lower()
        attrs.pop("email", None)
        if not attrs.get("username"):
            raise serializers.ValidationError({"email": "This field is required."})
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data


class ProfileUpdateSerializer(serializers.ModelSerializer):
    """Update the mutable fields on the authenticated user's profile."""

    class Meta:
        model = User
        fields = ["email", "first_name", "last_name", "display_name"]

    def validate_email(self, value: str) -> str:
        email = value.lower()
        if (
            User.objects.filter(email__iexact=email)
            .exclude(pk=self.instance.pk)
            .exists()
        ):
            raise serializers.ValidationError("A user with this email already exists.")
        return email

    def update(self, instance, validated_data):
        """Normalize email and keep username in sync with email changes."""
        normalized_email = None
        email = validated_data.get("email")
        if email:
            normalized_email = email.lower()
            validated_data["email"] = normalized_email

        display_name = validated_data.get("display_name")
        if display_name == "":
            validated_data["display_name"] = None

        user = super().update(instance, validated_data)
        if normalized_email:
            user.username = normalized_email
            user.save(update_fields=["username"])
        if not user.display_name:
            user.display_name = (
                f"{user.first_name} {user.last_name}".strip() or user.email
            )
            user.save(update_fields=["display_name"])
        return user


class PasswordChangeSerializer(serializers.Serializer):
    """Validate and update the authenticated user's password."""

    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate(self, attrs):
        user = self.context["request"].user
        new_password = attrs["new_password"]
        if user.check_password(new_password):
            raise serializers.ValidationError(
                {"new_password": "New password must differ from the current password."}
            )
        return attrs

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        return user


class GuideAvailabilitySerializer(serializers.ModelSerializer):
    """Expose guide availability slots to the current user."""

    guide_service_name = serializers.CharField(source="guide_service.name", read_only=True)
    trip_title = serializers.CharField(source="trip.title", read_only=True)
    source_display = serializers.CharField(source="get_source_display", read_only=True)

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
        if "guide" not in validated_data:
            request = self.context.get("request")
            if request:
                validated_data["guide"] = request.user
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop("guide", None)
        validated_data.pop("source", None)
        validated_data.pop("trip", None)
        return super().update(instance, validated_data)


class GuideAvailabilityShareSerializer(serializers.ModelSerializer):
    """Control visibility overrides for a specific service."""

    guide_service_name = serializers.CharField(source="guide_service.name", read_only=True)

    class Meta:
        model = GuideAvailabilityShare
        fields = ["id", "guide_service", "guide_service_name", "visibility"]
        read_only_fields = ["id", "guide_service_name"]

    def validate(self, attrs):
        availability = self.context.get("availability") or getattr(self.instance, "availability", None)
        if availability is None:
            raise serializers.ValidationError("Availability context is required.")
        request = self.context.get("request")
        if request and availability.guide_id != request.user.id:
            raise serializers.ValidationError("Cannot modify visibility for another guide.")
        guide_service = attrs.get("guide_service") or getattr(self.instance, "guide_service", None)
        if guide_service is None:
            raise serializers.ValidationError({"guide_service": "This field is required."})
        if (
            self.instance is None
            and GuideAvailabilityShare.objects.filter(availability=availability, guide_service=guide_service).exists()
        ):
            raise serializers.ValidationError("Visibility override already exists for this service.")
        attrs["availability"] = availability
        return attrs

    def create(self, validated_data):
        return GuideAvailabilityShare.objects.create(**validated_data)


class GuideCalendarIntegrationSerializer(serializers.ModelSerializer):
    """Manage external calendar integration metadata."""

    provider_display = serializers.CharField(source="get_provider_display", read_only=True)

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


class ServiceMembershipSerializer(serializers.ModelSerializer):
    """Expose the current user's service memberships."""

    guide_service_name = serializers.CharField(source="guide_service.name", read_only=True)

    class Meta:
        model = ServiceMembership
        fields = ["id", "guide_service", "guide_service_name", "role", "is_active"]
        read_only_fields = ["id", "guide_service_name", "role"]
