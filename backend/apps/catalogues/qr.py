"""QR codes for published catalogues (generated on demand with the `qrcode` library)."""
from io import BytesIO

import qrcode
import qrcode.image.svg
from qrcode.constants import ERROR_CORRECT_M

from .models import Catalogue


def qr_target(catalogue: Catalogue, *, tracking: bool = True) -> str:
    """The canonical public URL; `?src=qr` lets the page attribute visits to the QR code."""
    return f"{catalogue.public_url}?src=qr" if tracking else catalogue.public_url


def _qr(data: str) -> qrcode.QRCode:
    code = qrcode.QRCode(error_correction=ERROR_CORRECT_M, box_size=10, border=4)
    code.add_data(data)
    code.make(fit=True)
    return code


def render_png(data: str, *, color: str = "#000000", size: int = 600) -> bytes:
    img = _qr(data).make_image(fill_color=color, back_color="white").convert("RGB")
    img = img.resize((size, size), resample=0)  # nearest-neighbour keeps modules crisp
    out = BytesIO()
    img.save(out, "PNG")
    return out.getvalue()


def render_svg(data: str, *, color: str = "#000000") -> bytes:
    img = _qr(data).make_image(image_factory=qrcode.image.svg.SvgPathImage)
    svg = img.to_string(encoding="unicode")
    if color.lower() != "#000000":
        svg = svg.replace('fill="#000000"', f'fill="{color}"')
    return svg.encode()


def readable_color(hex_color: str) -> str:
    """Use the brand colour only if it is dark enough to scan reliably on white."""
    try:
        r, g, b = (int(hex_color[i : i + 2], 16) for i in (1, 3, 5))
    except (ValueError, TypeError):
        return "#000000"
    luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return hex_color if luminance < 140 else "#000000"
