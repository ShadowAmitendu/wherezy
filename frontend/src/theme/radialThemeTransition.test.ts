import { describe, expect, it, vi } from "vitest";
import {
  calculateMaxRadius,
  extractThemeTransitionOrigin,
  runRadialThemeTransition,
} from "./radialThemeTransition";

describe("radialThemeTransition geometry and origin resolution", () => {
  it("computes the exact viewport corner coverage radius from any origin", () => {
    expect(calculateMaxRadius({ x: 0, y: 0 }, 300, 400)).toBe(500);
    expect(calculateMaxRadius({ x: 300, y: 400 }, 300, 400)).toBe(500);
    expect(calculateMaxRadius({ x: 500, y: 300 }, 1000, 600)).toBeCloseTo(
      Math.hypot(500, 300),
    );
  });

  it("prefers explicit point and non-zero pointer events, ignoring synthetic (0,0) clicks", () => {
    const viewport = { width: 1200, height: 800 };

    expect(
      extractThemeTransitionOrigin({ x: 250, y: 120 }, null, viewport),
    ).toEqual({ x: 250, y: 120 });

    expect(
      extractThemeTransitionOrigin(
        { clientX: 900, clientY: 45 },
        { x: 100, y: 100, time: 1000 },
        viewport,
        1050,
      ),
    ).toEqual({ x: 900, y: 45 });

    // Keyboard activation produces clientX=0, clientY=0 -> use target rect center instead
    const mockTarget = {
      tagName: "DIV",
      getBoundingClientRect: () => ({
        left: 200,
        top: 100,
        width: 80,
        height: 40,
      }),
    } as unknown as HTMLElement;

    expect(
      extractThemeTransitionOrigin(
        { clientX: 0, clientY: 0, currentTarget: mockTarget },
        { x: 999, y: 999, time: 1000 },
        viewport,
        1050,
      ),
    ).toEqual({ x: 240, y: 120 });
  });

  it("uses recent pointer coordinates before activeElement or viewport center fallback", () => {
    const viewport = { width: 1000, height: 800 };
    const activeEl = {
      tagName: "BUTTON",
      getBoundingClientRect: () => ({
        left: 10,
        top: 10,
        width: 40,
        height: 20,
      }),
    } as unknown as HTMLElement;

    // Fresh pointerdown (e.g., MUI Select portal option tap)
    expect(
      extractThemeTransitionOrigin(
        undefined,
        { x: 640, y: 420, time: 5000 },
        viewport,
        5200,
        activeEl,
      ),
    ).toEqual({ x: 640, y: 420 });

    // Stale pointerdown (>1500ms) -> use keyboard activeElement center
    expect(
      extractThemeTransitionOrigin(
        undefined,
        { x: 640, y: 420, time: 1000 },
        viewport,
        3000,
        activeEl,
      ),
    ).toEqual({ x: 30, y: 20 });

    // No pointer and no active element -> viewport center
    expect(
      extractThemeTransitionOrigin(undefined, null, viewport, 3000, null),
    ).toEqual({ x: 500, y: 400 });
  });

  it("applies theme immediately in non-DOM/test environments", () => {
    const applyTheme = vi.fn();
    runRadialThemeTransition({
      applyTheme,
      origin: { x: 100, y: 100 },
      overlayColor: "#121212",
      accentColor: "#90CAF9",
    });
    expect(applyTheme).toHaveBeenCalledTimes(1);
  });
});
