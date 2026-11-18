import { expect, test, type Page, type Route } from "@playwright/test";

// The attendance register on Today, against a mocked camp: an admin, six players, today's
// session, a few check-ins and one player on exam leave. The e2e build points at a placeholder
// Supabase project, so every request is answered here.

const CAMP = "c0000000-0000-0000-0000-000000000001";
const SESSION = "s0000000-0000-0000-0000-000000000001";
const ADMIN = "p0000000-0000-0000-0000-000000000000";
const PLAYERS = [
  ["p1", "Ashitha D Pattabi"],
  ["p2", "Kaustav Basumatary"],
  ["p3", "Kriti Kalia"],
  ["p4", "Minakshi Jangir"],
  ["p5", "Shivpratap Singh Rathore"],
  ["p6", "Varla Aneesh"],
] as const;

async function mockCamp(page: Page) {
  const day = new Date().toLocaleDateString("en-CA");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const user = {
    id: "00000000-0000-0000-0000-000000000001", aud: "authenticated", role: "authenticated",
    email: "admin@example.com", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString(),
  };
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: user.id, aud: "authenticated", role: "authenticated", exp })}.sig`;
  const session = { access_token: token, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "r", user };
  await page.addInitScript((s) => localStorage.setItem("sb-placeholder-auth-token", s), JSON.stringify(session));

  // Kriti present, Minakshi late, Shivpratap away; Varla on exam leave; the rest not marked.
  let attendance = [
    { session_id: SESSION, person_id: "p3", status: "present", rpe: null, note: null, created_at: day },
    { session_id: SESSION, person_id: "p4", status: "late", rpe: null, note: null, created_at: day },
    { session_id: SESSION, person_id: "p5", status: "absent", rpe: null, note: null, created_at: day },
  ];
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

  await page.route("**/auth/v1/user**", (route) => json(route, user));
  await page.route("**/rest/v1/**", (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.replace(/^.*\/rest\/v1\//, "");
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
      return json(route, [
        { id: ADMIN, full_name: "Camp Admin", gender: "M" },
        ...PLAYERS.map(([id, full_name]) => ({ id, full_name, gender: "F" })),
      ]);
    }
    if (table === "sessions") {
      return json(route, [{ id: SESSION, camp_id: CAMP, session_date: day, title: "Training", focus: "", notes: "", duration_min: 120, created_by: ADMIN }]);
    }
    if (table === "player_leave") {
      return json(route, [{ id: "l1", camp_id: CAMP, person_id: "p6", starts_on: day, ends_on: day, reason: "exam", note: null, created_at: day }]);
    }
    if (table === "attendance") {
      if (req.method() === "POST") {
        const rows = [req.postDataJSON()].flat() as typeof attendance;
        for (const r of rows) attendance = [...attendance.filter((a) => a.person_id !== r.person_id), { ...r, created_at: day }];
        return json(route, [], 201);
      }
      if (req.method() === "DELETE") {
        const person = url.searchParams.get("person_id")?.replace(/^eq\./, "");
        attendance = attendance.filter((a) => a.person_id !== person);
        return json(route, []);
      }
      return json(route, attendance);
    }
    return json(route, []);
  });
}

const rowNames = (page: Page) =>
  page.getByRole("group", { name: /: attendance$/ }).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")!.replace(/: attendance$/, "")));

test("the register lists players by status and sets or clears one with a tap", async ({ page }) => {
  await mockCamp(page);
  await page.goto("/");

  const row = (name: string) => page.getByRole("group", { name: `${name}: attendance` });
  await expect(row("Kriti Kalia")).toBeVisible();

  // Present, late, away, on leave, then not marked (A–Z).
  expect(await rowNames(page)).toEqual([
    "Kriti Kalia", "Minakshi Jangir", "Shivpratap Singh Rathore", "Varla Aneesh", "Ashitha D Pattabi", "Kaustav Basumatary",
  ]);
  await expect(page.getByText("On leave · Exam")).toBeVisible();
  await expect(row("Kriti Kalia").getByRole("button", { name: "Present" })).toHaveAttribute("aria-pressed", "true");

  // One tap marks Ashitha present, and she moves up into the present group.
  await row("Ashitha D Pattabi").getByRole("button", { name: "Present" }).click();
  await expect(row("Ashitha D Pattabi").getByRole("button", { name: "Present" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => rowNames(page)).toEqual([
    "Ashitha D Pattabi", "Kriti Kalia", "Minakshi Jangir", "Shivpratap Singh Rathore", "Varla Aneesh", "Kaustav Basumatary",
  ]);

  // Another status switches it; tapping the lit one again clears it.
  await row("Ashitha D Pattabi").getByRole("button", { name: "Late" }).click();
  await expect(row("Ashitha D Pattabi").getByRole("button", { name: "Late" })).toHaveAttribute("aria-pressed", "true");
  await row("Ashitha D Pattabi").getByRole("button", { name: "Late" }).click();
  await expect(row("Ashitha D Pattabi").getByRole("button", { name: /^(Present|Late|Away)$/, pressed: true })).toHaveCount(0);
  await expect.poll(async () => (await rowNames(page)).at(-2)).toBe("Ashitha D Pattabi");

  if (process.env.REGISTER_SHOTS) {
    await page.screenshot({ path: `${process.env.REGISTER_SHOTS}/register-phone.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: `${process.env.REGISTER_SHOTS}/register-desktop.png`, fullPage: true });
  }
});
