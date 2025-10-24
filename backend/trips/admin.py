from django.contrib import admin
from .models import Trip, Assignment, TripTemplate

admin.site.register((Trip, Assignment, TripTemplate))
