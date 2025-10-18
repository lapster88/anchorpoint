from django.contrib import admin
from .models import Booking, GuestProfile
admin.site.register((Booking, GuestProfile))
