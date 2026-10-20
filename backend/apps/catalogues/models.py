from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models

from apps.core.models import UUIDModel

hex_color = RegexValidator(r"^#[0-9a-fA-F]{6}$", "Use a hex colour like #1d4ed8.")
phone_validator = RegexValidator(r"^\+?[0-9][0-9\s\-()]{6,18}$", "Enter a valid phone number.")


class CatalogueStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PUBLISHED = "published", "Published"
    ARCHIVED = "archived", "Archived"


class Catalogue(UUIDModel):
    """
    A shareable collection of a business's products.
    Public URL: {PUBLIC_CATALOGUE_BASE_URL}/{business.slug}/{catalogue.slug}
    """

    business = models.ForeignKey("businesses.Business", on_delete=models.CASCADE, related_name="catalogues")
    name = models.CharField(max_length=150)
    slug = models.SlugField(max_length=80)
    description = models.CharField(max_length=1000, blank=True)

    # Branding & public page settings
    tagline = models.CharField(max_length=150, blank=True, help_text="Hero subtitle on the public page.")
    cover = models.ForeignKey(
        "media_library.MediaAsset", null=True, blank=True, on_delete=models.RESTRICT, related_name="+"
    )
    logo = models.ForeignKey(
        "media_library.MediaAsset", null=True, blank=True, on_delete=models.RESTRICT, related_name="+"
    )
    theme_color = models.CharField(max_length=7, default="#1d4ed8", validators=[hex_color])
    show_prices = models.BooleanField(default=True)
    whatsapp_number = models.CharField(max_length=20, blank=True, validators=[phone_validator])
    contact_email = models.EmailField(blank=True)
    enquiries_enabled = models.BooleanField(default=True)

    status = models.CharField(max_length=20, choices=CatalogueStatus.choices, default=CatalogueStatus.DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    products = models.ManyToManyField("products.Product", through="CatalogueItem", related_name="catalogues")

    class Meta:
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=["business", "slug"], name="catalogues_slug_per_business")]
        indexes = [models.Index(fields=["business", "status"], name="catalogue_biz_status")]

    def __str__(self):
        return self.name

    @property
    def public_url(self) -> str:
        return f"{settings.PUBLIC_CATALOGUE_BASE_URL}/{self.business.slug}/{self.slug}"


class CatalogueItem(models.Model):
    """Membership of a product in a catalogue, with a per-catalogue display position."""

    catalogue = models.ForeignKey(Catalogue, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey("products.Product", on_delete=models.CASCADE, related_name="catalogue_items")
    position = models.PositiveIntegerField(default=0)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["position", "id"]
        constraints = [models.UniqueConstraint(fields=["catalogue", "product"], name="catalogues_item_unique")]
        indexes = [models.Index(fields=["catalogue", "position"], name="catalogue_item_pos")]
