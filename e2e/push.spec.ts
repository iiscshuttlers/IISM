import { expect, test, type Worker } from "@playwright/test";

// Phone alerts in the real (built) service worker: a push shows a notification, and tapping it
// routes the open app to the alert's page without reloading it.
// Full Chromium: Playwright's default headless shell always denies notification permission.
test.use({ channel: "chromium" });

/** The bits of the service worker's global scope these checks use. */
type SwScope = {
  dispatchEvent(e: Event): boolean;
  registration: { getNotifications(o?: { tag?: string }): Promise<{ title: string; body: string; data: unknown }[]> };
  PushEvent: new (type: string, init: { data: string }) => Event;
  NotificationEvent: new (type: string, init: { notification: unknown }) => Event;
};

test("a push shows an alert, and tapping it routes the open app to the match", async ({ page, context }) => {
  await context.grantPermissions(["notifications"]);
  await page.goto("/");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const sw: Worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  await page.evaluate(() => { (window as unknown as { marker: number }).marker = 1; });

  const shown = await sw.evaluate(async () => {
    const g = self as unknown as SwScope;
    const data = JSON.stringify({ title: "Match recorded", body: "A match you played was recorded.", url: "/matches?match=m1", tag: "match-m1" });
    // Synthetic events can't extend their lifetime (waitUntil throws), but the handler has
    // already started the work by then.
    try { g.dispatchEvent(new g.PushEvent("push", { data })); } catch { /* waitUntil on an untrusted event */ }
    for (let i = 0; i < 50; i++) {
      const list = await g.registration.getNotifications({ tag: "match-m1" });
      if (list.length) return list.map((n) => ({ title: n.title, body: n.body, url: (n.data as { url: string }).url }));
      await new Promise((r) => setTimeout(r, 100));
    }
    return [];
  });
  expect(shown).toHaveLength(1);
  expect(shown[0]).toMatchObject({ title: "Match recorded", body: "A match you played was recorded." });
  expect(new URL(shown[0].url).pathname + new URL(shown[0].url).search).toBe("/matches?match=m1");

  await sw.evaluate(async () => {
    const g = self as unknown as SwScope;
    const [n] = await g.registration.getNotifications({ tag: "match-m1" });
    try { g.dispatchEvent(new g.NotificationEvent("notificationclick", { notification: n })); } catch { /* as above */ }
  });
  await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe("/matches?match=m1");
  // Same document: routed in place, not reloaded.
  expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1);
});
