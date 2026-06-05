from django.db import models
from django.utils.text import slugify


class Hall(models.Model):
    """Examination / event hall on or near University of Bamenda campuses."""

    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    latitude = models.FloatField()
    longitude = models.FloatField()
    address = models.CharField(max_length=500, blank=True)
    campus_zone = models.CharField(
        max_length=120,
        blank=True,
        help_text="e.g. Bambili Main Campus, Chomba, etc.",
    )
    description = models.TextField(blank=True)
    capacity = models.PositiveIntegerField(null=True, blank=True)
    phone = models.CharField(max_length=40, blank=True)
    amenities = models.CharField(
        max_length=500,
        blank=True,
        help_text="Comma-separated, e.g. Wi‑Fi, projector, AC",
    )
    is_featured = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    image = models.ImageField(upload_to="hall_images/", blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name) or "hall"
            slug = base
            n = 1
            while Hall.objects.exclude(pk=self.pk).filter(slug=slug).exists():
                slug = f"{base}-{n}"
                n += 1
            self.slug = slug
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.image:
            self.image.delete(save=False)
        super().delete(*args, **kwargs)
