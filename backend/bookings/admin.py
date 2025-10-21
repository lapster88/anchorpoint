from django.contrib import admin

from .models import Booking, BookingGuest, GuestAccessToken, GuestProfile


@admin.register(GuestProfile)
class GuestProfileAdmin(admin.ModelAdmin):
    list_display = ("email", "first_name", "last_name", "phone", "updated_at")
    search_fields = ("email", "first_name", "last_name")
    ordering = ("last_name", "first_name")


class BookingGuestInline(admin.TabularInline):
    model = BookingGuest
    extra = 0


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ("trip", "primary_guest", "party_size", "payment_status", "waiver_status", "info_status")
    list_filter = ("payment_status", "waiver_status", "info_status")
    search_fields = ("trip__title", "primary_guest__email")
    inlines = [BookingGuestInline]


@admin.register(GuestAccessToken)
class GuestAccessTokenAdmin(admin.ModelAdmin):
    list_display = ("guest_profile", "booking", "purpose", "expires_at", "used_at")
    list_filter = ("purpose", "single_use")
    search_fields = ("guest_profile__email", "booking__trip__title")
    readonly_fields = ("token_hash",)
