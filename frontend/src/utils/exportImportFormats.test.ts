import { describe, expect, it } from "vitest";
import {
  DATA_FORMAT_OPTIONS,
  detectImportFormatFromFilename,
  getDataFormatOption,
} from "./exportImportFormats";

describe("exportImportFormats", () => {
  it("defines matching CSV, JSON, and Excel options for both export and import", () => {
    expect(DATA_FORMAT_OPTIONS.map((o) => o.format)).toEqual(["csv", "json", "xlsx"]);
    for (const opt of DATA_FORMAT_OPTIONS) {
      expect(opt.label).toBeTruthy();
      expect(opt.exportEndpoint).toBeTruthy();
      expect(opt.exportFilename.endsWith(opt.extension)).toBe(true);
      expect(opt.accept).toContain(opt.extension);
      expect(opt.exportDescription).toBeTruthy();
      expect(opt.importDescription).toBeTruthy();
      expect(getDataFormatOption(opt.format)).toBe(opt);
    }
  });

  it("detects format from filename extensions case-insensitively", () => {
    expect(detectImportFormatFromFilename("wherezy_export.csv")).toBe("csv");
    expect(detectImportFormatFromFilename("ITEMS.JSON")).toBe("json");
    expect(detectImportFormatFromFilename("wherezy_book.Xlsx")).toBe("xlsx");
    expect(detectImportFormatFromFilename("notes.txt")).toBeNull();
    expect(detectImportFormatFromFilename(null)).toBeNull();
  });
});
