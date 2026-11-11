import { flushSync } from "react-dom";
import type { gsap as GsapType } from "gsap";
import type {
  ThemeTransitionOrigin,
  ThemeTransitionSource,
} from "./themeConstants";

interface ViewTransitionLike {
  ready: Promise<void>;
  finished: Promise<void>;
  skipTransition?: () => void;
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => ViewTransitionLike;
};

export interface PointerRecord extends ThemeTransitionOrigin {
  time: number;
}

export interface RadialThemeTransitionOptions {
  applyTheme: () => void;
  origin: ThemeTransitionOrigin;
  overlayColor: string;
  accentColor: string;
}

const POINTER_RECENCY_MS = 1500;
const TRANSITION_CLASS = "theme-transitioning";

let activeTransitionToken = 0;
let activeViewTransition: ViewTransitionLike | null = null;
let activeTimeline: ReturnType<typeof GsapType.timeline> | null = null;
let activeOverlayEl: HTMLDivElement | null = null;

function isUsableTargetElement(value: unknown): value is HTMLElement {
  if (
    typeof value !== "object" ||
    value === null ||
    !("getBoundingClientRect" in value) ||
    typeof (value as HTMLElement).getBoundingClientRect !== "function"
  ) {
    return false;
  }
  const tagName = (value as HTMLElement).tagName;
  return tagName !== "BODY" && tagName !== "HTML";
}

function isOriginPoint(value: unknown): value is ThemeTransitionOrigin {
  return (
    typeof value === "object" &&
    value !== null &&
    "x" in value &&
    "y" in value &&
    typeof (value as ThemeTransitionOrigin).x === "number" &&
    typeof (value as ThemeTransitionOrigin).y === "number"
  );
}

/**
 * Resolve the screen coordinates for a radial theme transition origin.
 * Priority: explicit point/event/element > recent pointer (e.g. Select option) >
 * focused non-body active element (keyboard) > viewport center.
 */
export function extractThemeTransitionOrigin(
  source: ThemeTransitionSource,
  fallbackPointer: PointerRecord | null,
  viewport: { width: number; height: number },
  now = performance.now(),
  activeElement?: EventTarget | null,
): ThemeTransitionOrigin {
  const clampPoint = (x: number, y: number): ThemeTransitionOrigin => ({
    x: Math.min(Math.max(x, 0), viewport.width),
    y: Math.min(Math.max(y, 0), viewport.height),
  });

  if (isOriginPoint(source)) {
    return clampPoint(source.x, source.y);
  }

  if (isUsableTargetElement(source)) {
    const rect = source.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      return clampPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
  } else if (source && typeof source === "object") {
    const ev = source as {
      clientX?: number;
      clientY?: number;
      currentTarget?: EventTarget | null;
    };
    const hasPointerCoords =
      typeof ev.clientX === "number" &&
      typeof ev.clientY === "number" &&
      (ev.clientX !== 0 || ev.clientY !== 0);
    if (hasPointerCoords) {
      return clampPoint(ev.clientX as number, ev.clientY as number);
    }
    if (ev.currentTarget && isUsableTargetElement(ev.currentTarget)) {
      const rect = ev.currentTarget.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        return clampPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
    }
  }

  if (fallbackPointer && now - fallbackPointer.time <= POINTER_RECENCY_MS) {
    return clampPoint(fallbackPointer.x, fallbackPointer.y);
  }

  if (isUsableTargetElement(activeElement)) {
    const rect = activeElement.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      return clampPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
  }

  return {
    x: viewport.width / 2,
    y: viewport.height / 2,
  };
}

/** Calculate the exact radius needed to cover every corner of the viewport from origin. */
export function calculateMaxRadius(
  origin: ThemeTransitionOrigin,
  viewportWidth: number,
  viewportHeight: number,
): number {
  return Math.hypot(
    Math.max(origin.x, viewportWidth - origin.x),
    Math.max(origin.y, viewportHeight - origin.y),
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function cleanupGsapFallback(): void {
  if (activeTimeline) {
    activeTimeline.kill();
    activeTimeline = null;
  }
  if (activeOverlayEl) {
    activeOverlayEl.remove();
    activeOverlayEl = null;
  }
}

function cleanupInFlightTransitions(): void {
  cleanupGsapFallback();
  if (activeViewTransition) {
    try {
      activeViewTransition.skipTransition?.();
    } catch {
      // Ignore already-finished View Transitions
    }
    activeViewTransition = null;
  }
  if (typeof document !== "undefined") {
    document.documentElement.classList.remove(TRANSITION_CLASS);
  }
}

async function runGsapRadialFallback(
  options: RadialThemeTransitionOptions,
  maxRadius: number,
  token: number,
): Promise<void> {
  let gsapInstance: typeof GsapType;
  try {
    const mod = await import("gsap");
    gsapInstance = mod.default;
  } catch {
    if (token === activeTransitionToken) {
      options.applyTheme();
    }
    return;
  }

  if (token !== activeTransitionToken) return;

  const { applyTheme, origin, overlayColor, accentColor } = options;
  const diameter = Math.max(maxRadius * 2, 2);

  const circle = document.createElement("div");
  circle.setAttribute("aria-hidden", "true");
  Object.assign(circle.style, {
    position: "fixed",
    left: `${origin.x - maxRadius}px`,
    top: `${origin.y - maxRadius}px`,
    width: `${diameter}px`,
    height: `${diameter}px`,
    borderRadius: "50%",
    pointerEvents: "none",
    zIndex: "2147483645",
    background: `radial-gradient(circle, ${overlayColor} 68%, ${accentColor} 100%)`,
    willChange: "transform, opacity",
  });
  document.body.appendChild(circle);
  activeOverlayEl = circle;

  let themeApplied = false;
  const commitThemeOnce = () => {
    if (themeApplied || token !== activeTransitionToken) return;
    themeApplied = true;
    flushSync(() => {
      applyTheme();
    });
  };

  const tl = gsapInstance.timeline({
    onComplete: () => {
      if (token === activeTransitionToken) {
        cleanupGsapFallback();
      }
    },
  });
  activeTimeline = tl;

  tl.fromTo(
    circle,
    { scale: 0, opacity: 0.94 },
    { scale: 1, opacity: 0.98, duration: 0.36, ease: "power3.inOut" },
  )
    .call(commitThemeOnce)
    .to(circle, { opacity: 0, duration: 0.24, ease: "power2.out" });
}

/**
 * Animate a radial circular theme change expanding from the trigger coordinates.
 * Uses native View Transitions API where supported for pixel-accurate cross-theme wiping,
 * with a GPU-accelerated GSAP circular reveal fallback everywhere else.
 */
export function runRadialThemeTransition(
  options: RadialThemeTransitionOptions,
): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    options.applyTheme();
    return;
  }

  cleanupInFlightTransitions();
  const token = ++activeTransitionToken;

  if (prefersReducedMotion()) {
    options.applyTheme();
    return;
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxRadius = calculateMaxRadius(options.origin, vw, vh);
  const doc = document as DocumentWithViewTransition;

  if (typeof doc.startViewTransition === "function") {
    let applied = false;
    const safeApply = () => {
      if (applied) return;
      applied = true;
      options.applyTheme();
    };

    try {
      document.documentElement.classList.add(TRANSITION_CLASS);
      const transition = doc.startViewTransition(() => {
        flushSync(() => {
          safeApply();
        });
      });
      activeViewTransition = transition;

      transition.ready
        .then(() => {
          if (token !== activeTransitionToken) return;
          document.documentElement.animate(
            {
              clipPath: [
                `circle(0px at ${options.origin.x}px ${options.origin.y}px)`,
                `circle(${maxRadius}px at ${options.origin.x}px ${options.origin.y}px)`,
              ],
            },
            {
              duration: 520,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
              fill: "forwards",
              pseudoElement: "::view-transition-new(root)",
            },
          );
        })
        .catch(() => {
          // If View Transition snapshot setup fails, theme state was already applied cleanly
        });

      transition.finished
        .catch(() => {})
        .finally(() => {
          if (token === activeTransitionToken) {
            document.documentElement.classList.remove(TRANSITION_CLASS);
            activeViewTransition = null;
          }
        });
      return;
    } catch {
      document.documentElement.classList.remove(TRANSITION_CLASS);
      activeViewTransition = null;
      if (applied) return;
    }
  }

  void runGsapRadialFallback(options, maxRadius, token);
}
