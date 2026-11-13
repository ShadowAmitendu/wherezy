import JsBarcode from "jsbarcode";

export interface LabelData {
  id: string;
  type: "item" | "location";
  name: string;
  path?: string;
  qrUrl: string;
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
