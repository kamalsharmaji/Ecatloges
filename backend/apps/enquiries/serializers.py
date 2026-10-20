from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.media_library.serializers import MediaBriefSerializer

from .models import Customer, Enquiry, EnquirySource, EnquiryStatus
from .services import normalize_phone


class CustomerBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ["id", "name", "phone", "email"]


class EnquiryProductSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    sku = serializers.CharField()
    price = serializers.DecimalField(max_digits=12, decimal_places=2, allow_null=True)
    currency = serializers.CharField()
    thumbnail = MediaBriefSerializer(allow_null=True)


class EnquirySerializer(serializers.ModelSerializer):
    customer = CustomerBriefSerializer(read_only=True)
    catalogue = serializers.SerializerMethodField()
    product = serializers.SerializerMethodField()

    class Meta:
        model = Enquiry
        fields = [
            "id",
            "name",
            "phone",
            "email",
            "message",
            "quantity",
            "product_name",
            "catalogue_name",
            "catalogue",
            "product",
            "customer",
            "source",
            "status",
            "status_changed_at",
            "converted_at",
            "internal_notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [f for f in fields if f not in ("status", "internal_notes")]

    @extend_schema_field(serializers.DictField(allow_null=True))
    def get_catalogue(self, obj):
        c = obj.catalogue
        return {"id": str(c.id), "name": c.name} if c else None

    @extend_schema_field(EnquiryProductSerializer(allow_null=True))
    def get_product(self, obj):
        p = obj.product
        if not p:
            return None
        media = list(p.media_items.all())
        return EnquiryProductSerializer(
            {"id": p.id, "name": p.name, "sku": p.sku, "price": p.price, "currency": p.currency,
             "thumbnail": media[0].asset if media else None}
        ).data


class EnquirySummarySerializer(serializers.Serializer):
    total = serializers.IntegerField()
    new = serializers.IntegerField()
    contacted = serializers.IntegerField()
    in_progress = serializers.IntegerField()
    converted = serializers.IntegerField()
    closed = serializers.IntegerField()
    this_month = serializers.IntegerField()


class EnquiryBulkSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=200)
    action = serializers.ChoiceField(choices=["set_status", "delete"])
    status = serializers.ChoiceField(choices=EnquiryStatus.choices, required=False)


class PublicEnquirySerializer(serializers.Serializer):
    """Public form. `website` is a honeypot (must stay empty); `elapsed_ms` is time spent on the form."""

    name = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=25)
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    message = serializers.CharField(max_length=2000)
    quantity = serializers.IntegerField(required=False, allow_null=True, min_value=1, max_value=10_000_000)
    product_id = serializers.UUIDField(required=False, allow_null=True)
    source = serializers.ChoiceField(choices=[c for c in EnquirySource.values if c != "manual"], default="catalogue")
    idempotency_key = serializers.RegexField(r"^[A-Za-z0-9-]{8,64}$", required=False, allow_blank=True, default="")
    website = serializers.CharField(required=False, allow_blank=True, default="")
    elapsed_ms = serializers.IntegerField(required=False, min_value=0, default=0)

    def validate_name(self, value):
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError("Enter your name.")
        return value

    def validate_phone(self, value):
        return normalize_phone(value)

    def validate_message(self, value):
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError("Enter a message.")
        return value

    def validate_email(self, value):
        return value.strip().lower()


class PublicEnquiryResponseSerializer(serializers.Serializer):
    """Deliberately minimal: echoes no personal data."""

    status = serializers.CharField()
    reference = serializers.CharField()


class CustomerSerializer(serializers.ModelSerializer):
    enquiry_count = serializers.IntegerField(read_only=True, default=0)
    open_enquiry_count = serializers.IntegerField(read_only=True, default=0)
    converted_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Customer
        fields = [
            "id",
            "name",
            "phone",
            "email",
            "company",
            "city",
            "notes",
            "last_enquiry_at",
            "enquiry_count",
            "open_enquiry_count",
            "converted_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "last_enquiry_at", "created_at", "updated_at"]

    def validate_name(self, value):
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError("Enter a name.")
        return value

    def validate_phone(self, value):
        return normalize_phone(value) if value.strip() else ""

    def validate_email(self, value):
        return value.strip().lower()

    def validate(self, attrs):
        phone = attrs.get("phone", getattr(self.instance, "phone", ""))
        email = attrs.get("email", getattr(self.instance, "email", ""))
        if not phone and not email:
            raise serializers.ValidationError({"phone": ["Enter a phone number or an email address."]})
        return attrs


class CustomerEnquirySerializer(serializers.ModelSerializer):
    class Meta:
        model = Enquiry
        fields = ["id", "product_name", "catalogue_name", "message", "status", "source", "created_at"]


class CustomerDetailSerializer(CustomerSerializer):
    enquiries = serializers.SerializerMethodField()

    class Meta(CustomerSerializer.Meta):
        fields = [*CustomerSerializer.Meta.fields, "enquiries"]

    @extend_schema_field(CustomerEnquirySerializer(many=True))
    def get_enquiries(self, obj):
        return CustomerEnquirySerializer(obj.enquiries.order_by("-created_at")[:50], many=True).data


class CustomerSummarySerializer(serializers.Serializer):
    total = serializers.IntegerField()
    new_this_month = serializers.IntegerField()
    with_open_enquiries = serializers.IntegerField()
    converted = serializers.IntegerField()
