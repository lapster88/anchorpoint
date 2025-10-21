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
    path("api/", include(router.urls)),
]
