from django.contrib import admin

from .models import Hall


@admin.register(Hall)
class HallAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "campus_zone",
        "capacity",
        "is_featured",
        "is_active",
    )
    list_filter = ("campus_zone", "is_featured", "is_active")
    search_fields = ("name", "address", "description", "amenities")
    prepopulated_fields = {"slug": ("name",)}
    ordering = ("name",)
