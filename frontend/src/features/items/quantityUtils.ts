/**
 * Shared helpers for item quantity & partial taken-out calculations.
 */

export interface QuantityLike {
  quantity?: number | null;
  taken_out?: boolean;
  taken_out_quantity?: number | null;
  available_quantity?: number | null;
}

export function getItemQuantity(item: QuantityLike): number {
  const parsed = Number(item.quantity ?? 1);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.trunc(parsed);
}

export function clampTakenOutQuantity(value: number, totalQuantity: number): number {
  const max = Math.max(1, Math.trunc(Number.isFinite(totalQuantity) ? totalQuantity : 1));
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, Math.trunc(value)));
}

export function getItemTakenOutQuantity(item: QuantityLike): number {
  const total = getItemQuantity(item);
  if (item.taken_out_quantity !== undefined && item.taken_out_quantity !== null) {
    return clampTakenOutQuantity(Number(item.taken_out_quantity), total);
  }
  return item.taken_out ? 1 : 0;
}

export function getItemAvailableQuantity(item: QuantityLike): number {
  const total = getItemQuantity(item);
  const out = getItemTakenOutQuantity(item);
  return Math.max(0, total - out);
}

export function formatTakenOutStatusLabel(item: QuantityLike): string {
  const total = getItemQuantity(item);
  const out = getItemTakenOutQuantity(item);
  if (out <= 0) return "In Place";
  if (total <= 1) return "Taken Out";
  if (out >= total) return `All ${total} Out`;
  return `${out}/${total} Out`;
}

export function parsePositiveInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const num = Number.parseInt(trimmed, 10);
  return Number.isFinite(num) && num >= 1 ? num : null;
}
