"""Icon resolution and status-badge image synthesis for tray, menu bar, and taskbar."""

from __future__ import annotations

from pathlib import Path
import sys

from PIL import Image, ImageDraw


STATUS_COLORS = {
    "running": "#22c55e",
    "paused": "#f59e0b",
    "starting": "#38bdf8",
    "stopped": "#64748b",
    "error": "#ef4444",
}

STATUS_LABELS = {
    "running": "Running",
    "paused": "Paused",
    "starting": "Starting...",
    "stopped": "Stopped",
    "error": "Error",
}


def resolve_asset_path(filename: str) -> Path | None:
    """Locate a packaged or repository UI icon asset by filename."""
    candidates: list[Path] = []
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        mp = Path(meipass)
        candidates.extend(
            [
                mp / "frontend" / "dist" / filename,
                mp / "packaging" / filename,
                mp / filename,
            ]
        )

    repo_root = Path(__file__).resolve().parents[3]
    app_root = Path(__file__).resolve().parents[1]
    candidates.extend(
        [
            repo_root / "frontend" / "public" / filename,
            repo_root / "frontend" / "dist" / filename,
            app_root / "static_dist" / filename,
            repo_root / "packaging" / filename,
        ]
    )

    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def _draw_fallback_brand_icon(size: int) -> Image.Image:
    """Draw a clean rounded Wherezy icon fallback if image assets are unavailable."""
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    pad = max(2, size // 16)
    radius = max(4, size // 4)
    draw.rounded_rectangle(
        [pad, pad, size - pad, size - pad],
        radius=radius,
        fill=(21, 101, 192, 255),
        outline=(147, 197, 253, 255),
        width=max(1, size // 32),
    )
    # Stylized geometric pin / roof silhouette in white
    cx = size // 2
    roof_top = int(size * 0.22)
    roof_mid = int(size * 0.48)
    base_bottom = int(size * 0.78)
    left = int(size * 0.26)
    right = int(size * 0.74)
    draw.polygon([(cx, roof_top), (right, roof_mid), (left, roof_mid)], fill=(255, 255, 255, 245))
    draw.rounded_rectangle(
        [int(size * 0.34), roof_mid - 2, int(size * 0.66), base_bottom],
        radius=max(2, size // 16),
        fill=(255, 255, 255, 245),
    )
    return image


def load_base_icon_image(size: int = 64) -> Image.Image:
    """Load the Wherezy PNG/ICO icon as an RGBA image resized cleanly to `size`."""
    for name in ("apple-touch-icon.png", "favicon.ico"):
        asset = resolve_asset_path(name)
        if asset is None:
            continue
        try:
            with Image.open(asset) as opened:
                img = opened.convert("RGBA")
                if img.size != (size, size):
                    img = img.resize((size, size), Image.Resampling.LANCZOS)
                return img
        except OSError:
            continue
    return _draw_fallback_brand_icon(size)


def create_tray_icon_image(status: str = "stopped", size: int = 64) -> Image.Image:
    """Render the Wherezy tray/menu-bar icon with a crisp status badge dot."""
    base = load_base_icon_image(size=size).copy()
    color_hex = STATUS_COLORS.get(status, STATUS_COLORS["stopped"])

    draw = ImageDraw.Draw(base)
    dot_radius = max(5, int(size * 0.19))
    border = max(2, int(size * 0.05))
    cx = size - dot_radius - border
    cy = size - dot_radius - border

    # Contrast halo so the status indicator remains legible on light & dark panels
    draw.ellipse(
        [
            cx - dot_radius - border,
            cy - dot_radius - border,
            cx + dot_radius + border,
            cy + dot_radius + border,
        ],
        fill=(15, 23, 42, 240),
    )
    draw.ellipse(
        [
            cx - dot_radius,
            cy - dot_radius,
            cx + dot_radius,
            cy + dot_radius,
        ],
        fill=color_hex,
    )
    return base


def build_ico_file(target_path: Path, source_size: int = 256) -> Path:
    """Write a multi-resolution Windows .ico bundle from Wherezy's brand artwork."""
    target_path.parent.mkdir(parents=True, exist_ok=True)
    master = load_base_icon_image(size=source_size)
    master.save(
        target_path,
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    return target_path
