# Generated manually for SHU Hall Finder upgrade

from django.db import migrations, models
from django.utils.text import slugify


def populate_slugs(apps, schema_editor):
    Hall = apps.get_model("finder", "Hall")
    for hall in Hall.objects.all():
        base = slugify(hall.name) or "hall"
        slug = base
        n = 1
        while Hall.objects.exclude(pk=hall.pk).filter(slug=slug).exists():
            slug = f"{base}-{n}"
            n += 1
        hall.slug = slug
        hall.save(update_fields=["slug"])


class Migration(migrations.Migration):

    dependencies = [
        ("finder", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="hall",
            name="address",
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.AddField(
            model_name="hall",
            name="amenities",
            field=models.CharField(
                blank=True,
                help_text="Comma-separated, e.g. Wi‑Fi, projector, AC",
                max_length=500,
            ),
        ),
        migrations.AddField(
            model_name="hall",
            name="campus_zone",
            field=models.CharField(
                blank=True,
                help_text="e.g. Bambili Main Campus, Chomba, etc.",
                max_length=120,
            ),
        ),
        migrations.AddField(
            model_name="hall",
            name="capacity",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="hall",
            name="created_at",
            field=models.DateTimeField(auto_now_add=True, null=True),
        ),
        migrations.AddField(
            model_name="hall",
            name="description",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="hall",
            name="is_active",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="hall",
            name="is_featured",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="hall",
            name="phone",
            field=models.CharField(blank=True, max_length=40),
        ),
        migrations.AddField(
            model_name="hall",
            name="slug",
            field=models.SlugField(blank=True, max_length=220, null=True),
        ),
        migrations.RunPython(populate_slugs, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="hall",
            name="slug",
            field=models.SlugField(blank=True, max_length=220, unique=True),
        ),
        migrations.AlterField(
            model_name="hall",
            name="created_at",
            field=models.DateTimeField(auto_now_add=True),
        ),
    ]
