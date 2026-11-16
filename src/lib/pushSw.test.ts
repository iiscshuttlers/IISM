import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

// Runs public/push-sw.js (loaded into the real service worker with importScripts) against a fake
// service-worker global, then fires the events a phone would.
const source = readFileSync(new URL("../../public/push-sw.js", import.meta.url), "utf8");
const SCOPE = "https://owner.github.io/camp/";

interface FakeWindow { url: string; focused: boolean; messages: unknown[]; focus(): Promise<FakeWindow>; postMessage(m: unknown): void }

function load(windows: FakeWindow[] = []) {
  const listeners: Record<string, (e: unknown) => void> = {};
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const subscribed: unknown[] = [];
  const self = {
    addEventListener: (type: string, fn: (e: unknown) => void) => { listeners[type] = fn; },
    registration: {
      scope: SCOPE,
      showNotification: async (title: string, options: Record<string, unknown>) => { shown.push({ title, options }); },
      pushManager: { subscribe: async (o: unknown) => { subscribed.push(o); return {}; } },
    },
    clients: {
      matchAll: async () => windows,
      openWindow: async (url: string) => { opened.push(url); return null; },
    },
  };
  runInNewContext(source, { self, URL });
  const fire = async (type: string, event: Record<string, unknown>) => {
    let wait: Promise<unknown> = Promise.resolve();
    listeners[type]({ ...event, waitUntil: (p: Promise<unknown>) => { wait = p; } });
    await wait;
  };
  return { fire, shown, opened, subscribed };
}

const pushEvent = (data: unknown) => ({
  data: { json: () => (typeof data === "string" ? JSON.parse(data) : data), text: () => String(data) },
});

function fakeWindow(url: string): FakeWindow {
  const w: FakeWindow = {
    url, focused: false, messages: [],
    focus: async () => { w.focused = true; return w; },
    postMessage: (m) => { w.messages.push(m); },
  };
  return w;
}

describe("push-sw.js", () => {
  it("shows the alert with app-relative links resolved under the site's sub-path", async () => {
    const sw = load();
    await sw.fire("push", pushEvent({ title: "Match recorded", body: "A match you played was recorded.", url: "/matches?match=m1", tag: "match-m1" }));
    expect(sw.shown).toEqual([{
      title: "Match recorded",
      options: {
        body: "A match you played was recorded.",
        icon: `${SCOPE}pwa-192x192.png`,
        data: { url: `${SCOPE}matches?match=m1` },
        tag: "match-m1",
        renotify: true,
      },
    }]);
  });

  it("still shows something for an empty or non-JSON push", async () => {
    const sw = load();
    await sw.fire("push", { data: null });
    await sw.fire("push", { data: { json: () => { throw new Error("not json"); }, text: () => "Plain text" } });
    expect(sw.shown.map((s) => s.title)).toEqual(["IISc Training Camp", "IISc Training Camp"]);
    expect(sw.shown[1].options.body).toBe("Plain text");
    expect(sw.shown[0].options.data).toEqual({ url: SCOPE });
    expect(sw.shown[0].options).not.toHaveProperty("tag");
  });

  it("routes inside an open app window instead of reloading it", async () => {
    const other = fakeWindow("https://owner.github.io/other-site/");
    const app = fakeWindow(`${SCOPE}training`);
    const sw = load([other, app]);
    let closed = false;
    await sw.fire("notificationclick", { notification: { data: { url: `${SCOPE}matches?match=m1` }, close: () => { closed = true; } } });
    expect(closed).toBe(true);
    expect(app.focused).toBe(true);
    expect(app.messages).toEqual([{ type: "push-open", url: `${SCOPE}matches?match=m1` }]);
    expect(other.messages).toEqual([]);
    expect(sw.opened).toEqual([]);
  });

  it("opens the app at the alert's page when it isn't running", async () => {
    const sw = load([]);
    await sw.fire("notificationclick", { notification: { data: { url: SCOPE }, close: () => undefined } });
    expect(sw.opened).toEqual([SCOPE]);
  });

  it("re-subscribes with the same key when the browser replaces the subscription", async () => {
    const sw = load();
    const key = new Uint8Array([4, 1, 2]).buffer;
    await sw.fire("pushsubscriptionchange", { oldSubscription: { options: { applicationServerKey: key } } });
    expect(sw.subscribed).toEqual([{ userVisibleOnly: true, applicationServerKey: key }]);
  });
});
