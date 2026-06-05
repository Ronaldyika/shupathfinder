from django import forms
from django.core.exceptions import ValidationError

from .models import Hall

# Approximate bounding box for University of Bamenda campuses (Bambili, Nkwen, etc.)
CAMPUS_LAT_MIN, CAMPUS_LAT_MAX = 5.85, 6.15
CAMPUS_LNG_MIN, CAMPUS_LNG_MAX = 9.95, 10.35


class HallForm(forms.ModelForm):
    class Meta:
        model = Hall
        fields = [
            "name",
            "slug",
            "latitude",
            "longitude",
            "address",
            "campus_zone",
            "description",
            "capacity",
            "phone",
            "amenities",
            "is_featured",
            "is_active",
            "image",
        ]
        widgets = {
            "name": forms.TextInput(
                attrs={"class": "form-control", "autocomplete": "off"}
            ),
            "slug": forms.TextInput(
                attrs={
                    "class": "form-control",
                    "placeholder": "Leave blank to auto-generate from name",
                }
            ),
            "latitude": forms.NumberInput(
                attrs={"class": "form-control", "step": "any"}
            ),
            "longitude": forms.NumberInput(
                attrs={"class": "form-control", "step": "any"}
            ),
            "address": forms.TextInput(attrs={"class": "form-control"}),
            "campus_zone": forms.TextInput(attrs={"class": "form-control"}),
            "description": forms.Textarea(
                attrs={"class": "form-control", "rows": 4}
            ),
            "capacity": forms.NumberInput(attrs={"class": "form-control", "min": 0}),
            "phone": forms.TextInput(attrs={"class": "form-control"}),
            "amenities": forms.TextInput(attrs={"class": "form-control"}),
            "is_featured": forms.CheckboxInput(attrs={"class": "form-check-input"}),
            "is_active": forms.CheckboxInput(attrs={"class": "form-check-input"}),
            "image": forms.ClearableFileInput(
                attrs={"class": "form-control", "accept": "image/*"}
            ),
        }
        help_texts = {
            "slug": "Optional. Leave empty to generate automatically from the hall name.",
            "latitude": "Decimal degrees, e.g. 5.9597 (about −90 to 90).",
            "longitude": "Decimal degrees, e.g. 10.1453 (about −180 to 180).",
            "image": "Optional photo shown on the public map sidebar.",
        }

    def clean_latitude(self):
        v = self.cleaned_data["latitude"]
        if v < -90 or v > 90:
            raise ValidationError("Latitude must be between −90 and 90.")
        return v

    def clean_longitude(self):
        v = self.cleaned_data["longitude"]
        if v < -180 or v > 180:
            raise ValidationError("Longitude must be between −180 and 180.")
        return v

    def clean(self):
        cleaned = super().clean()
        lat = cleaned.get("latitude")
        lng = cleaned.get("longitude")
        if lat is None or lng is None:
            return cleaned
        if not (CAMPUS_LAT_MIN <= lat <= CAMPUS_LAT_MAX and CAMPUS_LNG_MIN <= lng <= CAMPUS_LNG_MAX):
            raise ValidationError(
                "Coordinates look outside the University of Bamenda area. "
                f"Expected latitude {CAMPUS_LAT_MIN}–{CAMPUS_LAT_MAX} and "
                f"longitude {CAMPUS_LNG_MIN}–{CAMPUS_LNG_MAX} "
                "(e.g. latitude 6.016, longitude 10.262)."
            )
        return cleaned

    def clean_slug(self):
        slug = (self.cleaned_data.get("slug") or "").strip()
        if not slug:
            return ""
        qs = Hall.objects.filter(slug=slug)
        if self.instance.pk:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise ValidationError("A hall with this slug already exists.")
        return slug
