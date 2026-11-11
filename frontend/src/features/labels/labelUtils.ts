import JsBarcode from "jsbarcode";

export interface LabelData {
  id: string;
  type: "item" | "location";
  name: string;
  path?: string;
  qrUrl: string;
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
