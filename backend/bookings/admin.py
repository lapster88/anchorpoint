from django.contrib import admin

from .models import TripParty, TripPartyGuest, GuestAccessToken, GuestProfile


@admin.register(GuestProfile)
class GuestProfileAdmin(admin.ModelAdmin):
    list_display = ("email", "first_name", "last_name", "phone", "updated_at")
    search_fields = ("email", "first_name", "last_name")
    ordering = ("last_name", "first_name")


class TripPartyGuestInline(admin.TabularInline):
    model = TripPartyGuest
    extra = 0


@admin.register(TripParty)
class TripPartyAdmin(admin.ModelAdmin):
    list_display = ("trip", "primary_guest", "party_size", "payment_status", "waiver_status", "info_status")
    list_filter = ("payment_status", "waiver_status", "info_status")
    search_fields = ("trip__title", "primary_guest__email")
    inlines = [TripPartyGuestInline]


@admin.register(GuestAccessToken)
class GuestAccessTokenAdmin(admin.ModelAdmin):
    list_display = ("guest_profile", "party", "purpose", "expires_at", "used_at")
    list_filter = ("purpose", "single_use")
    search_fields = ("guest_profile__email", "party__trip__title")
    readonly_fields = ("token_hash",)
