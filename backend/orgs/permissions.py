from rest_framework.permissions import BasePermission

from accounts.models import ServiceMembership


class IsServiceOwnerOrManager(BasePermission):
    """
    Allow access only to active owners or managers of the requested guide service.
    Superusers automatically pass.
    """

    allowed_roles = {ServiceMembership.OWNER, ServiceMembership.MANAGER}

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True

        guide_service = getattr(view, "guide_service", None)
        if guide_service is None:
            return False

        return ServiceMembership.objects.filter(
            user=request.user,
            guide_service=guide_service,
            role__in=self.allowed_roles,
            is_active=True,
        ).exists()
