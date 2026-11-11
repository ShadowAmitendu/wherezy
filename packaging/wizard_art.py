"""Generate branded Windows Inno Setup wizard BMP images from the Wherezy icon."""

from __future__ import annotations

from pathlib import Path
import sys
from PIL import Image, ImageDraw

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.app.desktop.icons import load_base_icon_image


def generate_wizard_bitmaps(out_dir: Path | None = None) -> tuple[Path, Path]:
    """Create wizard_banner.bmp (164x314) and wizard_small.bmp (55x58) for Inno Setup."""
    target_dir = out_dir or Path(__file__).resolve().parent
    target_dir.mkdir(parents=True, exist_ok=True)

    icon = load_base_icon_image(size=128)

    # Large side banner: 164x314, dark slate gradient matching Wherezy dark UI
    banner = Image.new("RGB", (164, 314), (15, 23, 42))
    draw = ImageDraw.Draw(banner)
    for y in range(314):
        t = y / 313.0
        r = int(15 + (21 - 15) * (1 - t))
        g = int(23 + (65 - 23) * (1 - t) * 0.6)
        b = int(42 + (120 - 42) * (1 - t) * 0.7)
        draw.line([(0, y), (163, y)], fill=(r, g, b))
    draw.rectangle([162, 0, 163, 313], fill=(37, 99, 235))

    banner_icon = icon.resize((96, 96), Image.Resampling.LANCZOS)
    banner_rgba = banner.convert("RGBA")
    banner_rgba.paste(banner_icon, ((164 - 96) // 2, 72), banner_icon)
    banner_path = target_dir / "wizard_banner.bmp"
    banner_rgba.convert("RGB").save(banner_path, format="BMP")

    # Small header image: 55x58, white background matching modern Inno header
    small = Image.new("RGBA", (55, 58), (255, 255, 255, 255))
    small_icon = icon.resize((46, 46), Image.Resampling.LANCZOS)
    small.paste(small_icon, ((55 - 46) // 2, (58 - 46) // 2), small_icon)
    small_path = target_dir / "wizard_small.bmp"
    small.convert("RGB").save(small_path, format="BMP")

    return banner_path, small_path


if __name__ == "__main__":
    banner, small = generate_wizard_bitmaps()
    print(f"Generated {banner} and {small}")
