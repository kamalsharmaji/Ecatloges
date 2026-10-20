from django.db.models import Count
from drf_spectacular.utils import extend_schema
from rest_framework import exceptions, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.audit_logs import services as audit
from apps.businesses.mixins import BusinessScopedViewMixin
from apps.businesses.views import BUSINESS_HEADER_PARAM
from apps.core.exceptions import BusinessRuleViolation

from . import services
from .models import MediaAsset, MediaFolder
from .serializers import MediaAssetSerializer, MediaBulkSerializer, MediaUploadSerializer, MediaUsageSerializer


@extend_schema(parameters=[BUSINESS_HEADER_PARAM])
class MediaViewSet(
    BusinessScopedViewMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = MediaAssetSerializer
    queryset = MediaAsset.objects.all()
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ["get", "post", "patch", "delete"]
    filterset_fields = ["kind", "folder"]
    search_fields = ["original_filename", "title"]
    ordering_fields = ["created_at", "size_bytes", "original_filename"]
    ordering = ["-created_at"]
    required_permissions = {
        "list": "media.view",
        "retrieve": "media.view",
        "usage": "media.view",
        "create": "media.upload",
        "partial_update": "media.upload",
        "destroy": "media.delete",
        "bulk": (),  # checked per action below
    }

    def get_queryset(self):
        return super().get_queryset().annotate(usage_count=Count("product_uses", distinct=True))

    @extend_schema(request={"multipart/form-data": MediaUploadSerializer}, responses={201: MediaAssetSerializer})
    def create(self, request, *args, **kwargs):
        serializer = MediaUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        asset = services.upload_media(
            request.business_context, user=request.user, upload=data["file"], folder=data["folder"], title=data["title"]
        )
        return Response(MediaAssetSerializer(self.get_queryset().get(pk=asset.pk)).data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        services.delete_media(instance, ctx=self.request.business_context)

    @extend_schema(responses=MediaUsageSerializer)
    @action(detail=False, methods=["get"])
    def usage(self, request):
        return Response(MediaUsageSerializer(services.usage_summary(request.business)).data)

    @extend_schema(request=MediaBulkSerializer, responses={200: None})
    @action(detail=False, methods=["post"], parser_classes=[JSONParser])
    def bulk(self, request):
        serializer = MediaBulkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        ctx = request.business_context
        needed = "media.delete" if data["action"] == "delete" else "media.upload"
        if not ctx.has(needed):
            raise exceptions.PermissionDenied()
        assets = list(MediaAsset.objects.filter(business=request.business, pk__in=data["ids"]))
        if len(assets) != len(set(data["ids"])):
            raise exceptions.NotFound("One or more files were not found.")
        if data["action"] == "move":
            folder = data.get("folder")
            if folder not in MediaFolder.values:
                raise exceptions.ValidationError({"folder": ["Choose a folder."]})
            MediaAsset.objects.filter(pk__in=[a.pk for a in assets]).update(folder=folder)
            audit.record_ctx(ctx, "media.moved", target_type="mediaasset", target_label=f"{len(assets)} files",
                             metadata={"count": len(assets), "folder": folder})
            return Response({"updated": len(assets)})
        deleted, skipped = 0, []
        for asset in assets:
            try:
                services.delete_media(asset, ctx=ctx)
                deleted += 1
            except BusinessRuleViolation:  # still used by a product/catalogue/category
                skipped.append(str(asset.pk))
        return Response({"deleted": deleted, "skipped_in_use": skipped})
