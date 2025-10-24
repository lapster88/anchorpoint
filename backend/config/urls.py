from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from accounts.api import (
    ChangePasswordView,
    InvitationAcceptView,
    InvitationStatusView,
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
    GuideServiceDetailView,
    GuideServiceLogoView,
    ServiceInvitationDetailView,
    ServiceInvitationResendView,
    ServiceMembershipDetailView,
    ServiceRosterView,
    StripeAccountStatusView,
    StripeDisconnectView,
    StripeOnboardingLinkView,
    StripeWebhookView,
)
from trips.api import TripViewSet, TripTemplateViewSet

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
router.register(r"trip-templates", TripTemplateViewSet, basename="trip-template")

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
    path(
        "api/auth/invitations/<str:token>/",
        InvitationStatusView.as_view(),
        name="auth-invitation-status",
    ),
    path(
        "api/auth/invitations/<str:token>/accept/",
        InvitationAcceptView.as_view(),
        name="auth-invitation-accept",
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
    path(
        "api/orgs/<int:service_id>/members/",
        ServiceRosterView.as_view(),
        name="guide-service-roster",
    ),
    path(
        "api/orgs/<int:service_id>/members/<int:membership_id>/",
        ServiceMembershipDetailView.as_view(),
        name="guide-service-member-detail",
    ),
    path(
        "api/orgs/<int:service_id>/invitations/<int:invitation_id>/",
        ServiceInvitationDetailView.as_view(),
        name="guide-service-invitation-detail",
    ),
    path(
        "api/orgs/<int:service_id>/invitations/<int:invitation_id>/resend/",
        ServiceInvitationResendView.as_view(),
        name="guide-service-invitation-resend",
    ),
    path(
        "api/orgs/<int:service_id>/logo/",
        GuideServiceLogoView.as_view(),
        name="guide-service-logo",
    ),
    path(
        "api/orgs/<int:service_id>/",
        GuideServiceDetailView.as_view(),
        name="guide-service-detail",
    ),
    path("api/webhooks/stripe/", StripeWebhookView.as_view(), name="stripe-webhook"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
