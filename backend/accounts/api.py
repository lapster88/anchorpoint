from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django.utils import timezone as django_timezone
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import ServiceInvitation, ServiceMembership
from .serializers import (
    EmailTokenObtainPairSerializer,
    PasswordChangeSerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    ServiceMembershipSerializer,
    ServiceInvitationPublicSerializer,
    ServiceInvitationSerializer,
    ServiceMembershipDetailSerializer,
    UserSerializer,
)

User = get_user_model()


class RegisterView(APIView):
    """Create a new user account and issue an initial JWT pair."""

    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "user": UserSerializer(user).data,
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(TokenObtainPairView):
    """Authenticate an existing user via email + password."""

    serializer_class = EmailTokenObtainPairSerializer


class MeView(APIView):
    """Return the serialized profile for the current authenticated user."""

    def get(self, request, *args, **kwargs):
        return Response(UserSerializer(request.user).data)

    def patch(self, request, *args, **kwargs):
        """Update the current user's profile."""
        serializer = ProfileUpdateSerializer(
            instance=request.user, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data)


class ChangePasswordView(APIView):
    """Allow the current user to rotate their password after verifying the old one."""

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = PasswordChangeSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ServiceMembershipListView(generics.ListAPIView):
    """Expose the current user's active service memberships."""

    serializer_class = ServiceMembershipSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ServiceMembership.objects.filter(
            user=self.request.user, is_active=True
        ).select_related("guide_service")


class InvitationStatusView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token, *args, **kwargs):
        invitation = get_object_or_404(
            ServiceInvitation.objects.select_related("guide_service"), token=token
        )
        if invitation.status == ServiceInvitation.STATUS_PENDING and invitation.expires_at < django_timezone.now():
            invitation.status = ServiceInvitation.STATUS_EXPIRED
            invitation.save(update_fields=["status"])

        if invitation.status == ServiceInvitation.STATUS_EXPIRED:
            return Response(
                {"detail": "This invitation has expired."},
                status=status.HTTP_410_GONE,
            )

        serializer = ServiceInvitationPublicSerializer(invitation)
        return Response(serializer.data)


class InvitationAcceptView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, token, *args, **kwargs):
        invitation = get_object_or_404(
            ServiceInvitation.objects.select_related("guide_service", "membership"),
            token=token,
        )

        if invitation.status == ServiceInvitation.STATUS_PENDING and invitation.expires_at < django_timezone.now():
            invitation.status = ServiceInvitation.STATUS_EXPIRED
            invitation.save(update_fields=["status"])

        if invitation.status != ServiceInvitation.STATUS_PENDING:
            return Response(
                {"detail": "This invitation is no longer available."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        expected_email = invitation.email.lower()
        tokens: dict | None = None

        if request.user.is_authenticated:
            if request.user.email.lower() != expected_email:
                return Response(
                    {"detail": "Signed-in user does not match the invitation email."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user = request.user
        else:
            existing_user = User.objects.filter(email__iexact=expected_email).first()
            if existing_user:
                return Response(
                    {
                        "detail": "An account with this email already exists. Please sign in and accept the invitation again.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            payload = request.data.copy()
            payload["email"] = invitation.email
            register_serializer = RegisterSerializer(data=payload)
            register_serializer.is_valid(raise_exception=True)
            user = register_serializer.save()
            refresh = RefreshToken.for_user(user)
            tokens = {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            }

        now = django_timezone.now()
        invited_by_user = invitation.invited_by or (request.user if request.user.is_authenticated else None)

        membership, created = ServiceMembership.objects.get_or_create(
            user=user,
            guide_service=invitation.guide_service,
            defaults={
                "role": invitation.role,
                "is_active": True,
                "invited_by": invited_by_user,
                "invited_at": invitation.invited_at or now,
                "accepted_at": now,
            },
        )
        if not created:
            membership.role = invitation.role
            membership.is_active = True
            membership.invited_by = membership.invited_by or invited_by_user
            membership.invited_at = membership.invited_at or invitation.invited_at or now
            membership.accepted_at = membership.accepted_at or now
            membership.save(update_fields=[
                "role",
                "is_active",
                "invited_by",
                "invited_at",
                "accepted_at",
                "updated_at",
            ])

        invitation.status = ServiceInvitation.STATUS_ACCEPTED
        invitation.accepted_at = now
        invitation.membership = membership
        invitation.save(update_fields=["status", "accepted_at", "membership"])

        member_payload = ServiceMembershipDetailSerializer(membership).data
        response_data = {
            "membership": member_payload,
            "user": UserSerializer(user).data,
        }
        if tokens:
            response_data.update(tokens)
        return Response(response_data, status=status.HTTP_200_OK)
