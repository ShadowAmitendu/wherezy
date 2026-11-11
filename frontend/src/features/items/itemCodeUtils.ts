/**
 * Shared helpers for formatting canonical item codes (starting from I01).
 */

/** Format a numeric item ID as an item code with at least two digits (e.g., 1 -> "I01", 10 -> "I10"). */
export function formatItemCode(id?: number | string | null): string {
  if (id === undefined || id === null || id === "") return "";
  const numericId = typeof id === "number" ? id : Number.parseInt(String(id).trim(), 10);
  if (!Number.isFinite(numericId) || numericId < 1) return "";
  return `I${String(Math.trunc(numericId)).padStart(2, "0")}`;
}
