import { expect, test, type Page } from "@playwright/test";

// The e2e build points at a placeholder Supabase project, so these tests answer the auth
// requests themselves with the replies a real project gives a Google-only account.

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
