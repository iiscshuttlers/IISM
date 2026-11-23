import { expect, test, type Page, type Route } from "@playwright/test";

// The attendance grid, against a mocked camp: an admin, four players, four sessions so far (two
// of them yesterday), one planned for later, and one player on exam leave. The e2e build points at
// a placeholder Supabase project, so every request is answered here.

const CAMP = "c0000000-0000-0000-0000-000000000001";
const ADMIN = "p0000000-0000-0000-0000-000000000000";
const PLAYERS = [
  ["p1", "Kriti Kalia", "F"],
  ["p2", "Ashitha D Pattabi", "F"],
  ["p3", "Shivpratap Singh Rathore", "M"],
  ["p4", "Varla Aneesh", "M"],
] as const;
const day = (offset: number) => new Date(Date.now() + offset * 864e5).toLocaleDateString("en-CA");

async function mockCamp(page: Page) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const user = {
    id: "00000000-0000-0000-0000-000000000001", aud: "authenticated", role: "authenticated",
    email: "admin@example.com", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString(),
  };
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: user.id, aud: "authenticated", role: "authenticated", exp })}.sig`;
  const session = { access_token: token, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "r", user };
  await page.addInitScript((s) => localStorage.setItem("sb-placeholder-auth-token", s), JSON.stringify(session));

  const s = (id: string, offset: number, title: string) =>
    ({ id, camp_id: CAMP, session_date: day(offset), title, focus: "", notes: "", duration_min: 120, created_by: ADMIN });
  // Newest first, and on a shared day the one logged last first (as the app asks for them).
  const sessions = [s("s9", 2, "Planned"), s("s0", 0, "Training"), s("s1b", -1, "Evening"), s("s1a", -1, "Morning"), s("s3", -3, "Training")];
  const a = (session_id: string, person_id: string, status: string) => ({ session_id, person_id, status, rpe: null, note: null, created_at: day(0) });
  const attendance = [
    a("s0", "p1", "present"), a("s0", "p2", "late"), a("s0", "p3", "absent"),
    a("s1b", "p1", "present"),
    a("s1a", "p1", "present"), a("s1a", "p2", "present"),
    a("s3", "p1", "absent"), a("s3", "p2", "present"), a("s3", "p3", "present"),
  ];
  const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

  await page.route("**/auth/v1/user**", (route) => json(route, user));
  await page.route("**/rest/v1/**", (route) => {
    const table = new URL(route.request().url()).pathname.replace(/^.*\/rest\/v1\//, "");
    if (table === "rpc/claim_my_profile") return json(route, ADMIN);
    if (table === "rpc/camp_role") return json(route, "admin");
    if (table === "rpc/is_site_admin") return json(route, false);
    if (table.startsWith("rpc/")) return json(route, []);
    if (table === "camps") {
      return json(route, [{
        id: CAMP, name: "Test camp", starts_on: null, ends_on: null, status: "active", selection_target: 8,
        visibility: "members", players_see_all_results: true, publish_selection: false, activity_enabled: false,
        selection_locked_at: null, court_count: 4,
      }]);
    }
    if (table === "camp_members") {
      return json(route, [
        { person_id: ADMIN, role: "admin", activity_muted: false, events: [] },
        ...PLAYERS.map(([id]) => ({ person_id: id, role: "player", activity_muted: false, events: [] })),
      ]);
    }
    if (table === "people") {
      return json(route, [{ id: ADMIN, full_name: "Camp Admin", gender: "M" }, ...PLAYERS.map(([id, full_name, gender]) => ({ id, full_name, gender }))]);
    }
    if (table === "sessions") return json(route, sessions);
    if (table === "attendance") return json(route, attendance);
    if (table === "player_leave") {
      return json(route, [{ id: "l1", camp_id: CAMP, person_id: "p4", starts_on: day(-3), ends_on: day(-1), reason: "exam", note: null, created_at: day(-5) }]);
    }
    return json(route, []);
  });
}

/** Each row as "Name pct", top to bottom. */
const rows = (page: Page) =>
  page.getByRole("rowheader").evaluateAll((els) => els.map((e) => e.textContent!.replace(/(\d+%|—)$/, " $1")));
/** One player's cells, left to right, as the label after the colon. */
const marks = (page: Page, name: string) =>
  page.locator("tbody tr", { has: page.getByRole("rowheader", { name: new RegExp(`^${name}`) }) })
    .locator("td[title]").evaluateAll((els) => els.map((e) => e.getAttribute("title")!.replace(/^.*: /, "")));

test("the attendance grid shows every player against every session so far", async ({ page }) => {
  await mockCamp(page);
  await page.goto("/");

  // From Today's register.
  await page.getByRole("link", { name: "All days" }).click();
  await expect(page).toHaveURL(/\/attendance$/);
  await expect(page.getByRole("region", { name: "Attendance by player and date" })).toBeVisible();

  // Four sessions up to today, newest first; the planned one is left out. Under each date: how many came.
  const dates = page.locator('thead a[href*="/training?session="]');
  await expect(dates).toHaveCount(4);
  expect(await page.locator("thead th:has(a) > span").allTextContents()).toEqual(["2 came", "1 came", "2 came", "2 came"]);

  // A–Z by default, with attendance % (leave excluded).
  await expect.poll(() => rows(page)).toEqual(["Ashitha D Pattabi 75%", "Kriti Kalia 75%", "Shivpratap Singh Rathore 25%", "Varla Aneesh 0%"]);
  expect(await marks(page, "Kriti Kalia")).toEqual(["Present", "Present", "Present", "Away"]);
  expect(await marks(page, "Ashitha D Pattabi")).toEqual(["Late", "Not marked", "Present", "Present"]);
  expect(await marks(page, "Varla Aneesh")).toEqual(["Not marked", "On leave (Exam)", "On leave (Exam)", "On leave (Exam)"]);

  // Lowest first, then men only.
  await page.getByRole("button", { name: "Lowest first" }).click();
  await expect.poll(() => rows(page)).toEqual(["Varla Aneesh 0%", "Shivpratap Singh Rathore 25%", "Ashitha D Pattabi 75%", "Kriti Kalia 75%"]);
  await page.getByRole("button", { name: /^Men/ }).click();
  await expect.poll(() => rows(page)).toEqual(["Varla Aneesh 0%", "Shivpratap Singh Rathore 25%"]);

  // The grid scrolls inside its card; the page itself never scrolls sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  if (process.env.GRID_SHOTS) {
    await page.getByRole("button", { name: /^Everyone/ }).click();
    await page.getByRole("button", { name: "A–Z" }).click();
    await page.screenshot({ path: `${process.env.GRID_SHOTS}/grid-phone.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: `${process.env.GRID_SHOTS}/grid-desktop.png`, fullPage: true });
  }

  // A date opens that session in the training log.
  await dates.first().click();
  await expect(page).toHaveURL(/\/training\?session=s0$/);
  await expect(page.getByRole("heading", { name: /^Training · / })).toBeVisible();
});
