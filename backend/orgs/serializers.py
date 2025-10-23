from rest_framework import serializers

from .models import GuideService, ServiceStripeAccount


class StripeOnboardingLinkSerializer(serializers.Serializer):
    url = serializers.URLField()
    expires_at = serializers.DateTimeField()


class StripeAccountStatusSerializer(serializers.Serializer):
    connected = serializers.BooleanField()
    account_id = serializers.CharField(allow_null=True, required=False)
    charges_enabled = serializers.BooleanField(required=False)
    payouts_enabled = serializers.BooleanField(required=False)
    details_submitted = serializers.BooleanField(required=False)
    default_currency = serializers.CharField(allow_null=True, required=False)
    account_email = serializers.EmailField(allow_null=True, required=False)
    express_dashboard_url = serializers.CharField(allow_blank=True, required=False)
    onboarding_link_url = serializers.CharField(allow_blank=True, required=False)
    onboarding_expires_at = serializers.DateTimeField(required=False)
    last_webhook_received_at = serializers.DateTimeField(required=False, allow_null=True)
    last_webhook_error_at = serializers.DateTimeField(required=False, allow_null=True)
    last_webhook_error_message = serializers.CharField(
        allow_blank=True, required=False
    )

    @staticmethod
    def from_account(account: ServiceStripeAccount | None) -> dict:
        if account is None:
            return {"connected": False}

        return {
            "connected": True,
            "account_id": account.account_id,
            "charges_enabled": account.charges_enabled,
            "payouts_enabled": account.payouts_enabled,
            "details_submitted": account.details_submitted,
            "default_currency": account.default_currency or None,
            "account_email": account.account_email or None,
            "express_dashboard_url": account.express_dashboard_url or "",
            "onboarding_link_url": account.onboarding_link_url or "",
            "onboarding_expires_at": account.onboarding_expires_at,
            "last_webhook_received_at": account.last_webhook_received_at,
            "last_webhook_error_at": account.last_webhook_error_at,
            "last_webhook_error_message": account.last_webhook_error_message or "",
        }
