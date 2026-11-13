import {
  alpha,
  darken,
  decomposeColor,
  getContrastRatio,
  hslToRgb,
  lighten,
  type Theme,
} from "@mui/material/styles";

const MIN_CONTRAST_RATIO = 4.8;

export interface CategoryBadgeSx {
  bgcolor: string;
  color: string;
  border: string;
  borderColor: string;
}

function toOpaqueRgbTuple(rawColor: string | null | undefined): [number, number, number] | null {
  if (!rawColor || typeof rawColor !== "string") {
    return null;
  }
  const trimmed = rawColor.trim();
  if (!trimmed) {
    return null;
  }
  try {
    let decomposed = decomposeColor(trimmed);
    if (decomposed.type === "hsl" || decomposed.type === "hsla") {
      decomposed = decomposeColor(hslToRgb(trimmed));
    }
    if ((decomposed.type === "rgb" || decomposed.type === "rgba") && decomposed.values.length >= 3) {
      const [r, g, b] = decomposed.values;
      if ([r, g, b].every((n) => Number.isFinite(n))) {
        return [
          Math.max(0, Math.min(255, Math.round(r))),
          Math.max(0, Math.min(255, Math.round(g))),
          Math.max(0, Math.min(255, Math.round(b))),
        ];
      }
    }
  } catch {
    return null;
  }
  return null;
}

function formatRgb(rgb: [number, number, number]): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

/** Blend an opaque foreground RGB color with alpha over an opaque surface RGB color. */
export function compositeOverSurface(
  surfaceColor: string,
  foregroundColor: string,
  opacity: number
): string {
  const bg = toOpaqueRgbTuple(surfaceColor);
  const fg = toOpaqueRgbTuple(foregroundColor);
  if (!bg || !fg) {
    return surfaceColor;
  }
  const a = Math.max(0, Math.min(1, opacity));
  return formatRgb([
    Math.round(bg[0] * (1 - a) + fg[0] * a),
    Math.round(bg[1] * (1 - a) + fg[1] * a),
    Math.round(bg[2] * (1 - a) + fg[2] * a),
  ]);
}

function resolveBaseColor(rawColor: string | null | undefined, theme: Theme): string {
  const parsed = toOpaqueRgbTuple(rawColor);
  if (parsed) {
    return formatRgb(parsed);
  }
  const fallback = toOpaqueRgbTuple(theme.palette.primary.main);
  if (fallback) {
    return formatRgb(fallback);
  }
  return theme.palette.mode === "dark" ? "rgb(144, 202, 249)" : "rgb(25, 118, 210)";
}

/**
 * Return an opaque accent color adjusted when needed so it meets WCAG AA contrast
 * on both the current theme surface and tinted category badge background.
 */
export function getCategoryAccentColor(
  rawColor: string | null | undefined,
  theme: Theme
): string {
  const isDark = theme.palette.mode === "dark";
  const surface = theme.palette.background.paper || (isDark ? "#121212" : "#ffffff");
  const bgOpacity = isDark ? 0.18 : 0.12;
  const base = resolveBaseColor(rawColor, theme);

  for (let step = 0; step <= 19; step += 1) {
    const amount = step * 0.05;
    const candidate = amount === 0 ? base : isDark ? lighten(base, amount) : darken(base, amount);
    const pillBg = compositeOverSurface(surface, candidate, bgOpacity);
    if (
      getContrastRatio(candidate, pillBg) >= MIN_CONTRAST_RATIO &&
      getContrastRatio(candidate, surface) >= MIN_CONTRAST_RATIO
    ) {
      return candidate;
    }
  }

  return theme.palette.text.primary;
}

/**
 * Compute contrast-safe Chip/Badge styles (`bgcolor`, `color`, subtle `border`)
 * for a category color across light and dark themes.
 */
export function getCategoryBadgeSx(
  rawColor: string | null | undefined,
  theme: Theme
): CategoryBadgeSx {
  const isDark = theme.palette.mode === "dark";
  const fg = getCategoryAccentColor(rawColor, theme);
  const bgOpacity = isDark ? 0.18 : 0.12;
  const borderOpacity = isDark ? 0.36 : 0.28;

  return {
    bgcolor: alpha(fg, bgOpacity),
    color: fg,
    border: "1px solid",
    borderColor: alpha(fg, borderOpacity),
  };
}
