from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    display_name = models.CharField(max_length=120, blank=True)

class ServiceMembership(models.Model):
    OWNER='OWNER'; MANAGER='OFFICE_MANAGER'; GUIDE='GUIDE'; GUEST='GUEST'
    ROLES = [(OWNER, 'Owner'), (MANAGER, 'Office Manager'), (GUIDE, 'Guide'), (GUEST, 'Guest')]

    user = models.ForeignKey('User', on_delete=models.CASCADE)
    guide_service = models.ForeignKey('orgs.GuideService', on_delete=models.CASCADE, related_name='memberships')
    role = models.CharField(max_length=20, choices=ROLES)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ('user', 'guide_service', 'role')
