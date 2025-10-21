from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import ServiceMembership
from .serializers import (
    EmailTokenObtainPairSerializer,
    PasswordChangeSerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    ServiceMembershipSerializer,
    UserSerializer,
)


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
