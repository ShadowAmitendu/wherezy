import { describe, expect, it } from "vitest";
import { createTheme, getContrastRatio } from "@mui/material/styles";
import {
  compositeOverSurface,
  getCategoryAccentColor,
  getCategoryBadgeSx,
} from "./categoryColors";

const SWATCH_PALETTE = [
  "#1976d2",
  "#486B85",
  "#02435C",
  "#57B5C3",
  "#2e7d32",
  "#388e3c",
  "#ed6c02",
  "#9c27b0",
  "#d32f2f",
  "#455a64",
  "#5d4037",
];

describe("categoryColors", () => {
  const darkTheme = createTheme({
    palette: {
      mode: "dark",
      background: {
        default: "#121212",
        paper: "#1E1E1E",
      },
      primary: {
        main: "#90CAF9",
      },
    },
  });

  const lightTheme = createTheme({
    palette: {
      mode: "light",
      background: {
        default: "#F8FAFC",
        paper: "#FFFFFF",
      },
      primary: {
        main: "#1976D2",
      },
    },
  });

  it("ensures every swatch color meets WCAG AA contrast (>= 4.5) in dark mode", () => {
    for (const color of [...SWATCH_PALETTE, "#000000", "#123"]) {
      const sx = getCategoryBadgeSx(color, darkTheme);
      const compositedBg = compositeOverSurface("#1E1E1E", sx.color, 0.18);
      expect(getContrastRatio(sx.color, compositedBg)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(sx.color, "#1E1E1E")).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("ensures every swatch color meets WCAG AA contrast (>= 4.5) in light mode", () => {
    for (const color of [...SWATCH_PALETTE, "#ffffff", "#e0f2fe", "#abc"]) {
      const sx = getCategoryBadgeSx(color, lightTheme);
      const compositedBg = compositeOverSurface("#FFFFFF", sx.color, 0.12);
      expect(getContrastRatio(sx.color, compositedBg)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(sx.color, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("falls back safely when category color is null, empty, or invalid", () => {
    for (const badColor of [null, undefined, "", "not-a-color", "undefined"]) {
      const darkSx = getCategoryBadgeSx(badColor, darkTheme);
      const lightSx = getCategoryBadgeSx(badColor, lightTheme);
      expect(darkSx.color).toBeTruthy();
      expect(darkSx.bgcolor).not.toContain("undefined");
      expect(darkSx.bgcolor).not.toContain("null");
      expect(getContrastRatio(darkSx.color, "#1E1E1E")).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(lightSx.color, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("preserves already-readable colors without unnecessary shifting", () => {
    // Dark navy is already dark enough on white in light mode
    expect(getCategoryAccentColor("#02435C", lightTheme)).toBe("rgb(2, 67, 92)");
    // Cyan is already light enough on dark #1E1E1E in dark mode
    expect(getCategoryAccentColor("#57B5C3", darkTheme)).toBe("rgb(87, 181, 195)");
  });
});
