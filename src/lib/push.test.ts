import { describe, expect, it } from "vitest";
import { alertedMatchId, base64UrlToBytes, isIosDevice, pushSupport, sameKey, testAlertMessage, type PushEnv } from "./push";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

const env = (over: Partial<PushEnv>): PushEnv => ({
  vapidKey: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  userAgent: ANDROID,
  maxTouchPoints: 5,
  standalone: false,
  serviceWorker: true,
  pushManager: true,
  notification: true,
  ...over,
});

describe("isIosDevice", () => {
  it("spots iPhones, and iPads that report themselves as Macs", () => {
    expect(isIosDevice(IPHONE)).toBe(true);
    expect(isIosDevice(IPAD, 5)).toBe(true);
    expect(isIosDevice(IPAD, 0)).toBe(false); // a real Mac
    expect(isIosDevice(ANDROID, 5)).toBe(false);
  });
});

describe("pushSupport", () => {
  it("hides the switch until the site has a VAPID key", () => {
    expect(pushSupport(env({ vapidKey: "" }))).toBe("not-configured");
  });
  it("works in Android Chrome, in a tab or installed", () => {
    expect(pushSupport(env({}))).toBe("ok");
    expect(pushSupport(env({ standalone: true }))).toBe("ok");
  });
  it("asks iPhone users to add the app to the Home Screen first", () => {
    // Safari in a tab has no PushManager at all; the Home Screen app does (iOS 16.4+).
    expect(pushSupport(env({ userAgent: IPHONE, pushManager: false }))).toBe("needs-install");
    expect(pushSupport(env({ userAgent: IPAD, maxTouchPoints: 5, pushManager: false }))).toBe("needs-install");
    expect(pushSupport(env({ userAgent: IPHONE, standalone: true }))).toBe("ok");
  });
  it("reports older iPhones and browsers without Web Push as unsupported", () => {
    expect(pushSupport(env({ userAgent: IPHONE, standalone: true, pushManager: false }))).toBe("unsupported");
    expect(pushSupport(env({ serviceWorker: false }))).toBe("unsupported");
    expect(pushSupport(env({ notification: false }))).toBe("unsupported");
  });
});

describe("alertedMatchId", () => {
  const id = "3f1c2a7e-9b4d-4e2a-8c1f-0a2b3c4d5e6f";
  it("reads the match a match alert points at, with or without the leading ?", () => {
    expect(alertedMatchId(`match=${id}`)).toBe(id);
    expect(alertedMatchId(`?filter=disputed&match=${id.toUpperCase()}`)).toBe(id);
  });
  it("ignores missing or malformed ids", () => {
    expect(alertedMatchId("")).toBeNull();
    expect(alertedMatchId("new=1")).toBeNull();
    expect(alertedMatchId("match=")).toBeNull();
    expect(alertedMatchId("match=1;drop")).toBeNull();
  });
});

describe("base64UrlToBytes / sameKey", () => {
  it("decodes the 65-byte public key and compares it with a subscription's key", () => {
    const key = base64UrlToBytes(env({}).vapidKey);
    expect(key.length).toBe(65);
    expect(key[0]).toBe(4);
    expect(sameKey(key.slice().buffer, key)).toBe(true);
    const other = key.slice();
    other[64] ^= 1;
    expect(sameKey(other.buffer, key)).toBe(false);
    expect(sameKey(null, key)).toBe(false);
  });
});

describe("testAlertMessage", () => {
  it("only a queued test counts as sent", () => {
    expect(testAlertMessage("queued").ok).toBe(true);
    for (const r of ["too_soon", "no_phone", "not_configured", "unavailable"] as const) {
      expect(testAlertMessage(r).ok).toBe(false);
    }
  });

  it("says what to do for each problem", () => {
    expect(testAlertMessage("too_soon").hint).toMatch(/30 seconds/);
    expect(testAlertMessage("no_phone").hint).toMatch(/off and on again/);
    expect(testAlertMessage("not_configured").hint).toMatch(/setup/);
    expect(testAlertMessage("unavailable").hint).toMatch(/0008/);
  });
});
