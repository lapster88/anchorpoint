from django.contrib import admin

from .models import GuideService, ServiceStripeAccount


@admin.register(GuideService)
class GuideServiceAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "contact_email")
    search_fields = ("name", "slug", "contact_email")


@admin.register(ServiceStripeAccount)
class ServiceStripeAccountAdmin(admin.ModelAdmin):
    list_display = (
        "guide_service",
        "account_id",
        "charges_enabled",
        "payouts_enabled",
        "updated_at",
    )
    readonly_fields = (
        "created_at",
        "updated_at",
        "last_webhook_received_at",
        "last_webhook_error_at",
        "last_webhook_error_message",
    )
    search_fields = ("account_id", "guide_service__name")
