from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import ServiceMembership

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


class ServiceMembershipSerializer(serializers.ModelSerializer):
    """Expose the current user's service memberships."""

    guide_service_name = serializers.CharField(source="guide_service.name", read_only=True)
    guide_service_logo_url = serializers.SerializerMethodField()

    class Meta:
        model = ServiceMembership
        fields = ["id", "guide_service", "guide_service_name", "guide_service_logo_url", "role", "is_active"]
        read_only_fields = ["id", "guide_service_name", "guide_service_logo_url", "role"]

    def get_guide_service_logo_url(self, obj) -> str | None:
        logo = getattr(obj.guide_service, "logo", None)
        if not logo:
            return None
        request = self.context.get("request")
        url = logo.url
        if request is not None:
            return request.build_absolute_uri(url)
        return url
