import { describe, expect, it } from "vitest";
import { formatItemCode } from "./itemCodeUtils";

describe("itemCodeUtils", () => {
  it("formats single-digit item IDs starting from I01", () => {
    expect(formatItemCode(1)).toBe("I01");
    expect(formatItemCode(2)).toBe("I02");
    expect(formatItemCode(9)).toBe("I09");
  });

  it("preserves two or more digits without truncation", () => {
    expect(formatItemCode(10)).toBe("I10");
    expect(formatItemCode(42)).toBe("I42");
    expect(formatItemCode(123)).toBe("I123");
    expect(formatItemCode("7")).toBe("I07");
  });

  it("returns empty string for invalid or non-positive IDs", () => {
    expect(formatItemCode(0)).toBe("");
    expect(formatItemCode(-5)).toBe("");
    expect(formatItemCode(null)).toBe("");
    expect(formatItemCode(undefined)).toBe("");
    expect(formatItemCode("")).toBe("");
    expect(formatItemCode("abc")).toBe("");
  });
});
