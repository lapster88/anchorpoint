from django.conf import settings
from django.db import models


class GuideService(models.Model):
    name = models.CharField(max_length=200)
    slug = models.SlugField(unique=True)
    contact_email = models.EmailField()
    phone = models.CharField(max_length=30, blank=True)
    billing_stripe_account = models.CharField(max_length=200, blank=True)
    logo = models.ImageField(upload_to="guide-logos/", blank=True, null=True)

    def __str__(self):
        return self.name


class ServiceStripeAccount(models.Model):
    guide_service = models.OneToOneField(
        GuideService,
        on_delete=models.CASCADE,
        related_name="stripe_account",
    )
    account_id = models.CharField(max_length=255, unique=True)
    access_token = models.CharField(max_length=255, blank=True)
    refresh_token = models.CharField(max_length=255, blank=True)
    publishable_key = models.CharField(max_length=255, blank=True)
    scope = models.CharField(max_length=80, blank=True)
    token_type = models.CharField(max_length=50, blank=True)
    livemode = models.BooleanField(default=False)
    charges_enabled = models.BooleanField(default=False)
    payouts_enabled = models.BooleanField(default=False)
    details_submitted = models.BooleanField(default=False)
    default_currency = models.CharField(max_length=10, blank=True)
    account_email = models.EmailField(blank=True)
    express_dashboard_url = models.URLField(blank=True)
    onboarding_link_url = models.URLField(blank=True)
    onboarding_expires_at = models.DateTimeField(null=True, blank=True)
    last_webhook_received_at = models.DateTimeField(null=True, blank=True)
    last_webhook_error_at = models.DateTimeField(null=True, blank=True)
    last_webhook_error_message = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_stripe_accounts",
    )

    def __str__(self):
        return f"{self.guide_service.name} Stripe Account"
