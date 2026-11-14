import { expect, test } from "@playwright/test";

test("sign-in screen renders with both sign-in options and the privacy link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /privacy/i })).toBeVisible();
});

test("deep links load the app instead of a 404 page", async ({ page }) => {
  await page.goto("/matches");
  await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
});

test("manifest is installable: name, standalone display and reachable PNG icons", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').first().getAttribute("href");
  expect(href).toBeTruthy();
  const manifestUrl = new URL(href!, page.url()).toString();
  const res = await request.get(manifestUrl);
  expect(res.ok()).toBeTruthy();
  const m = await res.json();
  expect(m.name).toBe("IISc Training Camp");
  expect(m.display).toBe("standalone");
  const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBeTruthy();
  for (const icon of m.icons) {
    const r = await request.get(new URL(icon.src, manifestUrl).toString());
    expect(r.ok(), icon.src).toBeTruthy();
    expect(r.headers()["content-type"]).toContain("image/png");
  }
  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect((await request.get(new URL(apple!, page.url()).toString())).ok()).toBeTruthy();
});

test("service worker installs and the app opens with no network", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Wait until the worker controls the page so navigations go through the precache.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.goto("/standings");
  await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
  await context.setOffline(false);
});

test("privacy page is served as its own page", async ({ page }) => {
  await page.goto("/privacy.html");
  await expect(page.getByRole("heading", { name: "Privacy policy" })).toBeVisible();
  await expect(page.getByText(/Daily check-in/)).toBeVisible();
});
