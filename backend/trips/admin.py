from django.contrib import admin
from .models import Trip, Assignment, Availability
admin.site.register((Trip, Assignment, Availability))
