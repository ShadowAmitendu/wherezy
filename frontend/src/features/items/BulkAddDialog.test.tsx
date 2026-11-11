import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BulkAddDialog } from "./BulkAddDialog";

describe("BulkAddDialog Import File tab", () => {
  it("renders the format selector matching export options when opened in xlsx mode", () => {
    const html = renderToStaticMarkup(
      <BulkAddDialog
        open
        disablePortal
        initialTab="csv"
        initialImportFormat="xlsx"
        onClose={() => {}}
        onAdded={() => {}}
      />
    );

    expect(html).toContain("Import File");
    expect(html).toContain("Import Format");
    expect(html).toContain("Excel (.xlsx)");
    expect(html).toContain("Auto-detect from file");
    expect(html).toContain("Download Excel Template");
    expect(html).toContain("Select Excel File");
  });
});
