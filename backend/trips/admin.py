from django.contrib import admin
from .models import Trip, Assignment

admin.site.register((Trip, Assignment))
