import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PrintShelfPage } from "./PrintShelfPage";

// Mock API client
vi.mock("../../api/client", () => ({
  api: {
    getLocation: vi.fn().mockResolvedValue({
      id: 2,
      name: "Storage Bunk Box 1",
      path: "Living Room > Storage Bunk Box 1",
    }),
    getLocationItems: vi.fn().mockResolvedValue([
      {
        id: 19,
        name: "12 Strings Diya Motif",
        category_name: "Festival Lights",
        location_id: 3,
        location_name: "Festival Light Box - 3",
        location_path: "Living Room > Storage Bunk Box 1 > Festival Light Box - 3",
        quantity: 1,
        available_quantity: 1,
        taken_out: false,
      },
    ]),
  },
}));

// Mock qrcode
vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,FAKEQR"),
  },
}));

describe("PrintShelfPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the controls bar with one location/box per page and audit options", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/print/location/2"]}>
        <PrintShelfPage />
      </MemoryRouter>
    );

    expect(html).toContain("Back");
    expect(html).toContain("Include sub-locations");
    expect(html).toContain("Thumbnails");
    expect(html).toContain("Audit tick-box");
    expect(html).toContain("One location/box per page");
    expect(html).toContain("Font Size");
    expect(html).toContain("Print / Save as PDF");
  });

  it("includes print CSS enforcing high-contrast dark text and exact color adjustment for dark mode", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/print/location/2"]}>
        <PrintShelfPage />
      </MemoryRouter>
    );

    expect(html).toContain("@media print");
    expect(html).toContain("print-color-adjust: exact");
    expect(html).toContain("#printable-shelf-sheet");
    expect(html).toContain("background-color: #ffffff !important");
    expect(html).toContain("color: #111827 !important");
    expect(html).toContain(".shelf-page-card.one-per-page");
  });
});
