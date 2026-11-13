import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import JsBarcode from "jsbarcode";
import {
  buildLabelCopies,
  parseLabelItemIds,
  renderBarcodeToCanvas,
  type LabelData,
} from "./labelUtils";
import { LabelSheetPage } from "./LabelSheetPage";

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
  });

  it("parses unique valid item IDs from item_id and item_ids query parameters", () => {
    expect(parseLabelItemIds("27", null)).toEqual([27]);
    expect(parseLabelItemIds(null, "12, 27,12, -1, abc, 45")).toEqual([12, 27, 45]);
    expect(parseLabelItemIds("9", "3,9,15")).toEqual([3, 9, 15]);
    expect(parseLabelItemIds(null, null)).toEqual([]);
  });
});
