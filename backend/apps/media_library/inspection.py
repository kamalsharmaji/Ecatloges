"""
Server-side validation of uploaded files. Never trusts the client's filename or Content-Type:
the type is detected from the file's content and must match its extension.
"""
import hashlib
import os
import re
import struct
import unicodedata
from dataclasses import dataclass

from django.conf import settings
from PIL import Image, UnidentifiedImageError
from rest_framework import exceptions

from .models import MediaKind

IMAGE_FORMATS = {"JPEG": ("jpg", "image/jpeg"), "PNG": ("png", "image/png"), "WEBP": ("webp", "image/webp")}
IMAGE_EXTENSIONS = {"jpg": "JPEG", "jpeg": "JPEG", "png": "PNG", "webp": "WEBP"}
VIDEO_EXTENSIONS = {"mp4": "video/mp4", "mov": "video/quicktime"}
ALLOWED = sorted([*IMAGE_EXTENSIONS, *VIDEO_EXTENSIONS])


@dataclass
class UploadInfo:
    kind: str
    extension: str
    mime_type: str
    size_bytes: int
    sha256: str
    display_name: str
    width: int | None = None
    height: int | None = None
    duration_seconds: float | None = None


def _error(message: str, code: str = "invalid_file") -> exceptions.ValidationError:
    return exceptions.ValidationError({"file": [message]}, code=code)


def safe_display_name(name: str) -> str:
    """Keep a readable name for display only; it is never used as a storage path."""
    name = unicodedata.normalize("NFKC", os.path.basename(name or "file"))
    name = re.sub(r"[^\w.\- ()]+", "_", name).strip(" .") or "file"
    return name[:200]


def _sha256(upload) -> str:
    digest = hashlib.sha256()
    for chunk in upload.chunks():
        digest.update(chunk)
    upload.seek(0)
    return digest.hexdigest()


def _iter_boxes(fh, start: int, end: int):
    """Yield (type, payload_start, box_end) for ISO-BMFF boxes between start and end."""
    pos = start
    while pos + 8 <= end:
        fh.seek(pos)
        header = fh.read(8)
        if len(header) < 8:
            return
        size, box_type = struct.unpack(">I4s", header)
        header_len = 8
        if size == 1:
            size = struct.unpack(">Q", fh.read(8))[0]
            header_len = 16
        elif size == 0:
            size = end - pos
        if size < header_len:
            return
        yield box_type, pos + header_len, pos + size
        pos += size


def mp4_duration(fh, file_size: int) -> float | None:
    """Read movie duration from the moov/mvhd box without loading the file (best effort)."""
    try:
        for box_type, payload, box_end in _iter_boxes(fh, 0, file_size):
            if box_type != b"moov":
                continue
            for inner, inner_payload, _ in _iter_boxes(fh, payload, box_end):
                if inner != b"mvhd":
                    continue
                fh.seek(inner_payload)
                version = fh.read(1)[0]
                fh.read(3)  # flags
                if version == 1:
                    fh.read(16)
                    timescale, duration = struct.unpack(">IQ", fh.read(12))
                else:
                    fh.read(8)
                    timescale, duration = struct.unpack(">II", fh.read(8))
                return round(duration / timescale, 2) if timescale else None
    except (OSError, struct.error, IndexError):
        return None
    return None


def inspect_upload(upload) -> UploadInfo:
    if upload is None:
        raise _error("Choose a file to upload.", "required")
    size = upload.size or 0
    if size == 0:
        raise _error("The file is empty.")
    if size > settings.MEDIA_MAX_UPLOAD_MB * 1024 * 1024:
        raise _error(f"Files can be at most {settings.MEDIA_MAX_UPLOAD_MB} MB.", "file_too_large")

    display = safe_display_name(upload.name)
    ext = os.path.splitext(display)[1].lower().lstrip(".")
    if ext not in IMAGE_EXTENSIONS and ext not in VIDEO_EXTENSIONS:
        raise _error(f"Unsupported file type. Allowed: {', '.join(ALLOWED)}.", "unsupported_type")

    if ext in IMAGE_EXTENSIONS:
        try:
            with Image.open(upload) as img:
                fmt = img.format
                width, height = img.size
                img.verify()
        except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError):
            raise _error("This file is not a valid image.") from None
        finally:
            upload.seek(0)
        if fmt != IMAGE_EXTENSIONS[ext]:
            raise _error("The file content does not match its extension.", "type_mismatch")
        if width * height > settings.MEDIA_MAX_IMAGE_PIXELS:
            raise _error("The image dimensions are too large.", "image_too_large")
        canonical_ext, mime = IMAGE_FORMATS[fmt]
        return UploadInfo(MediaKind.IMAGE, canonical_ext, mime, size, _sha256(upload), display, width, height)

    # Video: ISO base media file (MP4 / QuickTime) — "ftyp" box at offset 4.
    header = upload.read(12)
    upload.seek(0)
    if len(header) < 12 or header[4:8] != b"ftyp":
        raise _error("This file is not a valid MP4 or MOV video.")
    brand = header[8:12]
    mime = "video/quicktime" if brand == b"qt  " else "video/mp4"
    duration = mp4_duration(upload, size)
    upload.seek(0)
    return UploadInfo(MediaKind.VIDEO, ext, mime, size, _sha256(upload), display, duration_seconds=duration)
