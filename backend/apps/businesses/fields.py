from rest_framework import serializers


class BusinessScopedPrimaryKeyField(serializers.PrimaryKeyRelatedField):
    """
    A related-object id that is only valid inside the request's business.

    IDs belonging to another tenant are rejected exactly like non-existent ones
    ("Invalid pk … object does not exist"), so the response never confirms they exist.
    Pass `scope_filter={...}` for extra constraints (e.g. kind="image").
    """

    def __init__(self, *, model, scope_filter=None, **kwargs):
        self.model = model
        self.scope_filter = scope_filter or {}
        super().__init__(**kwargs)

    def get_queryset(self):
        business = self.context.get("business")
        if business is None:
            return self.model.objects.none()
        return self.model.objects.filter(business=business, **self.scope_filter)
