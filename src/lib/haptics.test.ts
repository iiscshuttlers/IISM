import { afterEach, describe, expect, it, vi } from "vitest";

// A pretend Android phone: Vibration API present, storage in memory.
async function phone() {
  const vibrate = vi.fn();
  const store = new Map<string, string>();
  vi.stubGlobal("window", { setTimeout });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 14)", platform: "Linux armv8l", maxTouchPoints: 5, vibrate });
  const mod = await import("./haptics");
  return { ...mod, vibrate, store };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.useRealTimers();
});

describe("haptics", () => {
  it("plays a distinct pattern for each kind", async () => {
    vi.useFakeTimers();
    const h = await phone();
    h.haptic("tap");
    vi.advanceTimersByTime(100);
    h.haptic("error");
    expect(h.vibrate).toHaveBeenNthCalledWith(1, 8);
    expect(h.vibrate).toHaveBeenNthCalledWith(2, [28, 50, 28, 50, 28]);
  });

  it("drops a second tap in the same burst but always plays outcomes", async () => {
    const h = await phone();
    h.haptic("tap");
    h.haptic("select");
    h.haptic("success");
    expect(h.vibrate).toHaveBeenCalledTimes(2);
    expect(h.vibrate).toHaveBeenLastCalledWith([12, 70, 20]);
  });

  it("stays silent once turned off on this phone, and remembers it", async () => {
    const h = await phone();
    h.setHapticsEnabled(false);
    h.haptic("success");
    expect(h.vibrate).not.toHaveBeenCalled();
    expect(h.hapticsEnabled()).toBe(false);
    expect(h.store.get("iism_haptics_off")).toBe("1");
  });
});
