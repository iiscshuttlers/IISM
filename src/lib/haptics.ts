import { toast } from "sonner";

/**
 * Haptic feedback, courtside-sized: a light tick on taps, a firmer pulse on selections,
 * and distinct patterns for saved / warning / failed.
 *
 * Android (and any browser with the Vibration API) gets real vibration patterns. iPhones have no
 * Vibration API; Safari 18+ plays the system tick when a native switch toggles, so a hidden switch
 * is flipped instead (older iPhones simply get nothing). Each phone can turn it off in Display.
 */
export type Haptic = "tap" | "select" | "impact" | "success" | "warning" | "error";

const PATTERNS: Record<Haptic, number | number[]> = {
  tap: 8,
  select: 12,
  impact: 22,
  success: [12, 70, 20],
  warning: [20, 60, 20],
  error: [28, 50, 28, 50, 28],
};
/** iPhone ticks per kind (one tick is all the switch trick can play at a time). */
const TICKS: Record<Haptic, number> = { tap: 1, select: 1, impact: 1, success: 2, warning: 2, error: 3 };
const OUTCOMES = new Set<Haptic>(["success", "warning", "error"]);

const KEY = "iism_haptics_off";
const readEnabled = () => {
  try {
    return localStorage.getItem(KEY) !== "1";
  } catch {
    return true;
  }
};
let enabled = typeof window === "undefined" ? false : readEnabled();

export const hapticsEnabled = () => enabled;
export function setHapticsEnabled(on: boolean) {
  enabled = on;
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, "1");
  } catch {
    // Private mode: the choice lasts until the tab closes.
  }
  if (on) haptic("success");
}

const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

let iosSwitch: HTMLLabelElement | null = null;
function iosTick() {
  if (!iosSwitch) {
    const label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    label.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.tabIndex = -1;
    label.appendChild(input);
    // These clicks are ours: keep them away from the app's own click handling.
    label.addEventListener("click", (e) => e.stopPropagation());
    document.body.appendChild(label);
    iosSwitch = label;
  }
  iosSwitch.click();
}

let lastAt = Number.NEGATIVE_INFINITY;
export function haptic(kind: Haptic = "tap") {
  if (!enabled || typeof window === "undefined") return;
  const now = performance.now();
  // Taps can arrive in bursts (a click that also selects something); outcomes always play.
  if (!OUTCOMES.has(kind) && now - lastAt < 50) return;
  lastAt = now;
  try {
    if (isIOS()) {
      iosTick();
      for (let i = 1; i < TICKS[kind]; i++) window.setTimeout(iosTick, i * 90);
    } else if (typeof navigator.vibrate === "function") {
      navigator.vibrate(PATTERNS[kind]);
    }
  } catch {
    // Some browsers throw when vibration is blocked; feedback is a nicety, never an error.
  }
}

const TAPPABLE = "button, a[href], [role=tab], [role=switch], [role=button], summary, input[type=checkbox], input[type=radio]";

/**
 * One listener for the whole app: every tap on a control ticks (choices tick firmer), and every
 * success / warning / error toast plays its pattern. A control opts out with data-haptic="off" or
 * picks its own kind with data-haptic="impact" (for example).
 */
export function installHaptics() {
  if (typeof document === "undefined") return;
  document.addEventListener(
    "click",
    (e) => {
      const el = (e.target as Element | null)?.closest?.(TAPPABLE);
      if (!el || (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") return;
      const own = el.closest("[data-haptic]")?.getAttribute("data-haptic");
      if (own === "off") return;
      const kind: Haptic =
        own && own in PATTERNS ? (own as Haptic)
          : el.matches("[role=tab], [role=switch], [aria-pressed], input") ? "select"
          : "tap";
      haptic(kind);
    },
    { capture: true, passive: true },
  );

  // Toasts report outcomes everywhere in the app, so they carry the outcome haptics.
  const t = toast as unknown as Record<"success" | "warning" | "error", (...args: unknown[]) => unknown>;
  for (const kind of ["success", "warning", "error"] as const) {
    const show = t[kind];
    t[kind] = (...args: unknown[]) => {
      haptic(kind);
      return show(...args);
    };
  }
}
