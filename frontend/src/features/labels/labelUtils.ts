import JsBarcode from "jsbarcode";

export interface LabelData {
  id: string;
  type: "item" | "location" | "box";
  name: string;
  path?: string;
  qrUrl: string;
  colour?: string;
  boxNumber?: number;
  destination?: string;
  itemCount?: number;
  locationKind?: string;
}

/** Extracts only the last storage place name from a full hierarchy path (e.g. "Room > Shelf > Box" -> "Box"). */
export function extractStoragePlaceName(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes(" > ")) {
    const parts = trimmed.split(" > ").map((s) => s.trim()).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : trimmed;
  }
  if (trimmed.includes(">")) {
    const parts = trimmed.split(">").map((s) => s.trim()).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : trimmed;
  }
  if (trimmed.includes(" / ")) {
    const parts = trimmed.split(" / ").map((s) => s.trim()).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : trimmed;
  }
  return trimmed;
}

/** Parse positive unique item IDs from either `?item_id=` or `?item_ids=1,2,3`. */
export function parseLabelItemIds(
  itemIdParam: string | null,
  itemIdsParam: string | null
): number[] {
  const seen = new Set<number>();
  const rawParts = [
    ...(itemIdsParam ? itemIdsParam.split(",") : []),
    ...(itemIdParam ? [itemIdParam] : []),
  ];
  for (const part of rawParts) {
    const parsed = Number(part.trim());
    if (Number.isInteger(parsed) && parsed > 0) {
      seen.add(parsed);
    }
  }
  return Array.from(seen);
}

export function buildLabelCopies(labels: LabelData[], copies: number): LabelData[] {
  const safeCopies = Math.max(1, Math.floor(Number.isFinite(copies) ? copies : 1));
  const result: LabelData[] = [];
  for (let c = 0; c < safeCopies; c++) {
    result.push(...labels);
  }
  return result;
}

export function renderBarcodeToCanvas(canvas: HTMLCanvasElement | null, value: string): void {
  if (!canvas || !value) return;
  try {
    JsBarcode(canvas, value, {
      format: "CODE128",
      width: 1.2,
      height: 25,
      displayValue: true,
      fontSize: 10,
      font: "JetBrains Mono",
      margin: 0,
      background: "#ffffff",
      lineColor: "#000000",
    });
  } catch (err) {
    console.error("Barcode render error", err);
  }
}
