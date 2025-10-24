from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone

from orgs.models import GuideService


class User(AbstractUser):
    display_name = models.CharField(max_length=120, blank=True)


class ServiceMembership(models.Model):
    OWNER = "OWNER"
    MANAGER = "OFFICE_MANAGER"
    GUIDE = "GUIDE"
    ROLES = [
        (OWNER, "Owner"),
        (MANAGER, "Office Manager"),
        (GUIDE, "Guide"),
    ]

    user = models.ForeignKey("User", on_delete=models.CASCADE)
    guide_service = models.ForeignKey(
        "orgs.GuideService",
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    role = models.CharField(max_length=20, choices=ROLES)
    is_active = models.BooleanField(default=True)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="service_memberships_invited",
    )
    invited_at = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "guide_service", "role")

    def mark_inactive(self):
        if self.is_active:
            self.is_active = False
            self.save(update_fields=["is_active", "updated_at"])

    def mark_active(self):
        if not self.is_active:
            self.is_active = True
            self.accepted_at = self.accepted_at or timezone.now()
            self.save(update_fields=["is_active", "accepted_at", "updated_at"])


class ServiceInvitation(models.Model):
    STATUS_PENDING = "PENDING"
    STATUS_ACCEPTED = "ACCEPTED"
    STATUS_CANCELLED = "CANCELLED"
    STATUS_EXPIRED = "EXPIRED"
    STATUSES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_ACCEPTED, "Accepted"),
        (STATUS_CANCELLED, "Cancelled"),
        (STATUS_EXPIRED, "Expired"),
    ]

    guide_service = models.ForeignKey(
        GuideService,
        on_delete=models.CASCADE,
        related_name="invitations",
    )
    email = models.EmailField()
    role = models.CharField(max_length=20, choices=ServiceMembership.ROLES)
    status = models.CharField(max_length=20, choices=STATUSES, default=STATUS_PENDING)
    token = models.CharField(max_length=128, unique=True)
    expires_at = models.DateTimeField()
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="service_invitations_sent",
    )
    invited_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    membership = models.OneToOneField(
        ServiceMembership,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invitation",
    )

    class Meta:
        unique_together = ("guide_service", "email", "status")

    def __str__(self):
        return f"Invitation {self.email} -> {self.guide_service.name}"

    @property
    def is_pending(self) -> bool:
        if self.status != self.STATUS_PENDING:
            return False
        return self.expires_at >= timezone.now()

    def mark_expired(self):
        if self.status == self.STATUS_PENDING:
            self.status = self.STATUS_EXPIRED
            self.save(update_fields=["status"])
