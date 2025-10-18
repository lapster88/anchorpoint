from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from trips.api import TripViewSet

router = DefaultRouter()
router.register(r'trips', TripViewSet, basename='trip')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(router.urls)),
]
