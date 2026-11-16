import { expect, test, type Page } from "@playwright/test";

// The e2e build points at a placeholder Supabase project, so these tests answer the auth
// requests themselves with the replies a real project gives a Google-only account.

/**
 * Answers the requests a signed-in account makes: Supabase's user endpoint (read and password
 * change) and the roster claim, which finds no profile so the "not on the roster" screen shows.
 */
async function mockAccount(page: Page) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const user = {
    id: "00000000-0000-0000-0000-000000000002", aud: "authenticated", role: "authenticated",
    email: "player@example.com", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString(),
  };
  const claims = { sub: user.id, email: user.email, aud: "authenticated", role: "authenticated", exp };
  const accessToken = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.sig`;
  const saved: { password?: string } = {};
  await page.route("**/auth/v1/user**", (route) => {
    if (route.request().method() === "PUT") saved.password = route.request().postDataJSON()?.password;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) });
  });
  await page.route("**/rest/v1/rpc/claim_my_profile**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "null" }),
  );
  const session = { access_token: accessToken, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "r", user };
  return { session, saved };
}

async function setNewPassword(page: Page) {
  const sheet = page.getByRole("dialog", { name: "Choose a new password" });
  await expect(sheet.getByText(/Your reset link signed you in/)).toBeVisible();
  await sheet.getByLabel("New password").fill("shuttle-123");
  await sheet.getByLabel("Type it again").fill("shuttle-123");
  await sheet.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByText(/Password saved/)).toBeVisible();
}

async function openPasswordForm(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /email and password/i }).click();
  await page.getByLabel("Email").fill("player@example.com");
  await page.getByLabel("Password").fill("not-the-password");
}

test("a rejected password points people who joined with Google back to Google", async ({ page }) => {
  await page.route("**/auth/v1/token**", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }),
    }),
  );
  await openPasswordForm(page);
  await page.getByRole("button", { name: /sign in with password/i }).click();
  await expect(page.getByText(/If you joined with Google, tap Continue with Google/)).toBeVisible();
});

test("Forgot password sends a reset link back to this site", async ({ page }) => {
  let sent: { email?: string; url: string } | null = null;
  await page.route("**/auth/v1/recover**", (route) => {
    sent = { email: route.request().postDataJSON()?.email, url: route.request().url() };
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await openPasswordForm(page);
  await page.getByRole("button", { name: /forgot password/i }).click();
  await expect(page.getByText(/If player@example\.com has an account, a reset link is on its way/)).toBeVisible();
  expect(sent!.email).toBe("player@example.com");
  expect(decodeURIComponent(sent!.url)).toContain("redirect_to=http://localhost:4178/");
});

test("Forgot password asks for the email first", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /email and password/i }).click();
  await page.getByRole("button", { name: /forgot password/i }).click();
  await expect(page.getByText(/Type your email above first/)).toBeVisible();
});

test("an expired email link explains itself and tidies the address bar", async ({ page }) => {
  await page.goto("/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
  await expect(page.getByText(/expired or was already used/)).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
});

test("an old-style reset link (straight from Supabase) still asks for a new password", async ({ page }) => {
  const { session, saved } = await mockAccount(page);
  const { access_token, expires_at } = session;
  // Not on a roster: the prompt must still appear on that screen.
  await page.goto(`/#access_token=${access_token}&expires_in=3600&expires_at=${expires_at}&refresh_token=r&token_type=bearer&type=recovery`);
  await setNewPassword(page);
  expect(saved.password).toBe("shuttle-123");
});

test("a reset link spends nothing until the tap, then asks for a new password", async ({ page }) => {
  const { session, saved } = await mockAccount(page);
  let verified: Record<string, unknown> | null = null;
  await page.route("**/auth/v1/verify**", (route) => {
    verified = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) });
  });

  await page.goto("/?token_hash=hash-123&type=recovery");
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  // What a mail scanner sees: the page, and no use of the one-time token.
  expect(verified).toBeNull();

  await page.getByRole("button", { name: "Choose a new password" }).click();
  await setNewPassword(page);
  expect(verified).toMatchObject({ token_hash: "hash-123", type: "recovery" });
  expect(saved.password).toBe("shuttle-123");
  expect(new URL(page.url()).search).toBe("");
});

test("a sign-up confirmation link confirms and signs in on tap", async ({ page }) => {
  const { session } = await mockAccount(page);
  await page.route("**/auth/v1/verify**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) }),
  );
  await page.goto("/?token_hash=hash-456&type=email");
  await page.getByRole("button", { name: "Confirm and sign in" }).click();
  await expect(page.getByText("Email confirmed. You're signed in.")).toBeVisible();
  await expect(page.getByText(/not on a camp roster yet/)).toBeVisible();
});

test("a used-up email link says so and goes back to sign-in", async ({ page }) => {
  await page.route("**/auth/v1/verify**", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ code: 403, error_code: "otp_expired", msg: "Email link is invalid or has expired" }),
    }),
  );
  await page.goto("/?token_hash=old&type=recovery");
  await page.getByRole("button", { name: "Choose a new password" }).click();
  await expect(page.getByText(/expired or was already used/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  expect(new URL(page.url()).search).toBe("");
});

test("signing up with an email that already has an account says so instead of 'account created'", async ({ page }) => {
  // With "Confirm email" on, Supabase hides existing accounts behind a user with no identities.
  await page.route("**/auth/v1/signup**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "00000000-0000-0000-0000-000000000001",
        aud: "authenticated",
        role: "authenticated",
        email: "player@example.com",
        identities: [],
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
      }),
    }),
  );
  await openPasswordForm(page);
  await page.getByRole("button", { name: /no account yet/i }).click();
  await expect(page.getByText(/Signed in with Google before\?/)).toBeVisible();
  await page.getByRole("button", { name: /create password & sign up/i }).click();
  await expect(page.getByText(/This email already has an account/)).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in with password/i })).toBeVisible();
});
