import { describe, expect, it } from "vitest";
import {
  clampTakenOutQuantity,
  formatTakenOutStatusLabel,
  getItemAvailableQuantity,
  getItemQuantity,
  getItemTakenOutQuantity,
  parsePositiveInt,
} from "./quantityUtils";

describe("quantityUtils", () => {
  it("normalizes item quantities with a minimum of 1", () => {
    expect(getItemQuantity({})).toBe(1);
    expect(getItemQuantity({ quantity: null })).toBe(1);
    expect(getItemQuantity({ quantity: 0 })).toBe(1);
    expect(getItemQuantity({ quantity: -4 })).toBe(1);
    expect(getItemQuantity({ quantity: 5 })).toBe(5);
  });

  it("clamps taken_out_quantity between 0 and total quantity", () => {
    expect(clampTakenOutQuantity(-2, 5)).toBe(0);
    expect(clampTakenOutQuantity(2.9, 5)).toBe(2);
    expect(clampTakenOutQuantity(9, 5)).toBe(5);
    expect(clampTakenOutQuantity(Number.NaN, 5)).toBe(0);
  });

  it("derives taken_out_quantity and available_quantity consistently", () => {
    expect(getItemTakenOutQuantity({ quantity: 6, taken_out_quantity: 2 })).toBe(2);
    expect(getItemAvailableQuantity({ quantity: 6, taken_out_quantity: 2 })).toBe(4);

    // Legacy boolean fallback when taken_out_quantity is absent
    expect(getItemTakenOutQuantity({ quantity: 1, taken_out: true })).toBe(1);
    expect(getItemAvailableQuantity({ quantity: 1, taken_out: true })).toBe(0);
    expect(getItemTakenOutQuantity({ quantity: 4, taken_out: false })).toBe(0);
    expect(getItemAvailableQuantity({ quantity: 4, taken_out: false })).toBe(4);
  });

  it("formats status labels for single and multi-unit items", () => {
    expect(formatTakenOutStatusLabel({ quantity: 1, taken_out: false, taken_out_quantity: 0 })).toBe("In Place");
    expect(formatTakenOutStatusLabel({ quantity: 1, taken_out: true, taken_out_quantity: 1 })).toBe("Taken Out");
    expect(formatTakenOutStatusLabel({ quantity: 5, taken_out: false, taken_out_quantity: 0 })).toBe("In Place");
    expect(formatTakenOutStatusLabel({ quantity: 5, taken_out: true, taken_out_quantity: 2 })).toBe("2/5 Out");
    expect(formatTakenOutStatusLabel({ quantity: 5, taken_out: true, taken_out_quantity: 5 })).toBe("All 5 Out");
  });

  it("parses positive whole integers strictly", () => {
    expect(parsePositiveInt("1")).toBe(1);
    expect(parsePositiveInt(" 42 ")).toBe(42);
    expect(parsePositiveInt("0")).toBeNull();
    expect(parsePositiveInt("-3")).toBeNull();
    expect(parsePositiveInt("2.5")).toBeNull();
    expect(parsePositiveInt("abc")).toBeNull();
  });
});
