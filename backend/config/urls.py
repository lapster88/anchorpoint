from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from accounts.api import (
    ChangePasswordView,
    LoginView,
    MeView,
    RegisterView,
    ServiceMembershipListView,
)
from availability.api import (
    GuideAvailabilityViewSet,
    GuideCalendarIntegrationViewSet,
)
from bookings.api import GuestLinkRequestView, GuestProfileUpdateView, GuestProfileViewSet
from orgs.api import (
    StripeAccountStatusView,
    StripeDisconnectView,
    StripeOnboardingLinkView,
    StripeWebhookView,
)
from trips.api import TripViewSet

router = DefaultRouter()
router.register(r"trips", TripViewSet, basename="trip")
router.register(
    r"auth/availabilities",
    GuideAvailabilityViewSet,
    basename="auth-availabilities",
)
router.register(
    r"auth/calendar-integrations",
    GuideCalendarIntegrationViewSet,
    basename="auth-calendar-integrations",
)
router.register(r"guests", GuestProfileViewSet, basename="guest")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/register/", RegisterView.as_view(), name="auth-register"),
    path("api/auth/login/", LoginView.as_view(), name="auth-login"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="auth-refresh"),
    path(
        "api/auth/change-password/",
        ChangePasswordView.as_view(),
        name="auth-change-password",
    ),
    path(
        "api/auth/memberships/",
        ServiceMembershipListView.as_view(),
        name="auth-memberships",
    ),
    path("api/auth/me/", MeView.as_view(), name="auth-me"),
    path("api/guest-links/", GuestLinkRequestView.as_view(), name="guest-link"),
    path(
        "api/guest-access/<str:token>/profile/",
        GuestProfileUpdateView.as_view(),
        name="guest-access-profile",
    ),
    path("api/", include(router.urls)),
    path(
        "api/orgs/<int:service_id>/stripe/link/",
        StripeOnboardingLinkView.as_view(),
        name="guide-service-stripe-link",
    ),
    path(
        "api/orgs/<int:service_id>/stripe/status/",
        StripeAccountStatusView.as_view(),
        name="guide-service-stripe-status",
    ),
    path(
        "api/orgs/<int:service_id>/stripe/disconnect/",
        StripeDisconnectView.as_view(),
        name="guide-service-stripe-disconnect",
    ),
    path("api/webhooks/stripe/", StripeWebhookView.as_view(), name="stripe-webhook"),
]
