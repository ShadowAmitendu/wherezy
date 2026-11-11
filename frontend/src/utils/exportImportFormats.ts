import type { ImportFormat } from "../api/client";

export interface DataFormatOption {
  format: ImportFormat;
  label: string;
  shortLabel: string;
  extension: string;
  accept: string;
  exportEndpoint: string;
  exportFilename: string;
  exportDescription: string;
  importDescription: string;
}

export const DATA_FORMAT_OPTIONS: readonly DataFormatOption[] = [
  {
    format: "csv",
    label: "CSV (.csv)",
    shortLabel: "CSV",
    extension: ".csv",
    accept: ".csv,text/csv",
    exportEndpoint: "/api/admin/export?format=csv",
    exportFilename: "wherezy_export.csv",
    exportDescription: "Spreadsheet-ready UTF-8 comma-separated values",
    importDescription: "Import rows from a CSV file or Wherezy CSV export",
  },
  {
    format: "json",
    label: "JSON (.json)",
    shortLabel: "JSON",
    extension: ".json",
    accept: ".json,application/json",
    exportEndpoint: "/api/admin/export?format=json",
    exportFilename: "wherezy_export.json",
    exportDescription: "Structured JSON array including custom field values",
    importDescription: "Import items from a JSON array or Wherezy JSON export",
  },
  {
    format: "xlsx",
    label: "Excel (.xlsx)",
    shortLabel: "Excel",
    extension: ".xlsx",
    accept: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    exportEndpoint: "/api/admin/export/book.xlsx",
    exportFilename: "wherezy_book.xlsx",
    exportDescription: "Multi-sheet Excel inventory workbook",
    importDescription: "Import sheets from an .xlsx spreadsheet or Inventory Book",
  },
] as const;

export function getDataFormatOption(format: ImportFormat): DataFormatOption {
  return DATA_FORMAT_OPTIONS.find((opt) => opt.format === format) ?? DATA_FORMAT_OPTIONS[0];
}

export function detectImportFormatFromFilename(filename?: string | null): ImportFormat | null {
  const lower = (filename || "").trim().toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".xlsx")) return "xlsx";
  return null;
}
