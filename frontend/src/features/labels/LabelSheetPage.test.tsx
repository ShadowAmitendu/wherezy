import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import JsBarcode from "jsbarcode";
import {
  buildLabelCopies,
  extractStoragePlaceName,
  parseLabelItemIds,
  renderBarcodeToCanvas,
  type LabelData,
} from "./labelUtils";
import { LabelSheetPage } from "./LabelSheetPage";
import { getAccessibleBoxColor } from "../moves/MovesPage";

vi.mock("jsbarcode", () => ({
  default: vi.fn(),
}));

describe("LabelSheetPage & labelUtils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("duplicates label data cleanly across requested copy count", () => {
    const base: LabelData[] = [
      { id: "I26", type: "item", name: "Gauge", path: "medicine box", qrUrl: "data:image/png;base64,X" },
    ];

    const sevenCopies = buildLabelCopies(base, 7);
    expect(sevenCopies).toHaveLength(7);
    expect(sevenCopies.every((l) => l.id === "I26")).toBe(true);

    expect(buildLabelCopies(base, 0)).toHaveLength(1);
  });

  it("invokes JsBarcode for every individual canvas element target", () => {
    const jsBarcodeMock = vi.mocked(JsBarcode);
    const fakeCanvases = Array.from({ length: 7 }, (_, i) => ({ id: `c-${i}` }) as unknown as HTMLCanvasElement);

    fakeCanvases.forEach((canvas) => renderBarcodeToCanvas(canvas, "I26"));

    expect(jsBarcodeMock).toHaveBeenCalledTimes(7);
    const uniqueTargets = new Set(jsBarcodeMock.mock.calls.map((c) => c[0]));
    expect(uniqueTargets.size).toBe(7);
    expect(jsBarcodeMock).toHaveBeenCalledWith(
      fakeCanvases[6],
      "I26",
      expect.objectContaining({
        format: "CODE128",
        displayValue: true,
        background: "#ffffff",
        lineColor: "#000000",
      })
    );
  });

  it("renders a dedicated BarcodeCanvas element inside the label sheet markup", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/labels"]}>
        <LabelSheetPage />
      </MemoryRouter>
    );

    expect(html).toContain("Label Preset");
    expect(html).toContain("Copies");
    expect(html).toContain("Print Labels");
    expect(html).toContain("QR Code");
    expect(html).toContain("Barcode");
    expect(html).toContain("Storage Place");
    expect(html).toContain("Thermal / B&amp;W");
    expect(html).toContain("One per page");
  });

  it("defaults to one per page when opened with box_id", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/labels?box_id=1"]}>
        <LabelSheetPage />
      </MemoryRouter>
    );

    expect(html).toContain("One per Page (1 per sheet)");
    expect(html).toContain("One per page");
  });

  it("duplicates box labels cleanly preserving box metadata", () => {
    const boxLabels: LabelData[] = [
      {
        id: "BOX-1",
        type: "box",
        name: "Kitchen Pans",
        boxNumber: 1,
        destination: "Kitchen",
        colour: "#1976d2",
        itemCount: 8,
        qrUrl: "data:image/png;base64,BOX1",
      },
    ];

    const copies = buildLabelCopies(boxLabels, 3);
    expect(copies).toHaveLength(3);
    expect(copies[0].type).toBe("box");
    expect(copies[0].boxNumber).toBe(1);
    expect(copies[0].destination).toBe("Kitchen");
  });

  it("provides accessible high-contrast color tints for box labels in dark mode", () => {
    // In light mode, returns exact original color
    expect(getAccessibleBoxColor("#1976d2", false)).toBe("#1976d2");
    expect(getAccessibleBoxColor("#546e7a", false)).toBe("#546e7a");

    // In dark mode, maps to bright high-contrast tints
    expect(getAccessibleBoxColor("#1976d2", true)).toBe("#64b5f6");
    expect(getAccessibleBoxColor("#2e7d32", true)).toBe("#81c784");
    expect(getAccessibleBoxColor("#546e7a", true)).toBe("#b0bec5");
    expect(getAccessibleBoxColor("#ec407a", true)).toBe("#f48fb1");

    // Fallbacks
    expect(getAccessibleBoxColor(null, true)).toBe("#90caf9");
    expect(getAccessibleBoxColor(null, false)).toBe("#1976d2");
  });

  it("parses unique valid item IDs from item_id and item_ids query parameters", () => {
    expect(parseLabelItemIds("27", null)).toEqual([27]);
    expect(parseLabelItemIds(null, "12, 27,12, -1, abc, 45")).toEqual([12, 27, 45]);
    expect(parseLabelItemIds("9", "3,9,15")).toEqual([3, 9, 15]);
    expect(parseLabelItemIds(null, null)).toEqual([]);
  });

  it("extracts only the immediate storage place name from hierarchy paths", () => {
    // Multi-level hierarchy paths
    expect(extractStoragePlaceName("Garage > Workshop > Tool Bench > Shelf 2")).toBe("Shelf 2");
    expect(extractStoragePlaceName("Living Room > Bookshelf > Top Shelf")).toBe("Top Shelf");
    expect(extractStoragePlaceName("Attic>Holiday Box>Ornaments")).toBe("Ornaments");
    expect(extractStoragePlaceName("Master Bedroom / Closet / Shoe Rack")).toBe("Shoe Rack");

    // Single location name
    expect(extractStoragePlaceName("Tool Box")).toBe("Tool Box");

    // Preserves single location names with internal slashes
    expect(extractStoragePlaceName("A/C Closet")).toBe("A/C Closet");

    // Falsy and empty values
    expect(extractStoragePlaceName(null)).toBeUndefined();
    expect(extractStoragePlaceName(undefined)).toBeUndefined();
    expect(extractStoragePlaceName("")).toBeUndefined();
    expect(extractStoragePlaceName("   ")).toBeUndefined();
  });
});
