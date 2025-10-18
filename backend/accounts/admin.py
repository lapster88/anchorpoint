from django.contrib import admin
from .models import User, ServiceMembership
admin.site.register((User, ServiceMembership))
