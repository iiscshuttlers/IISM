import { describe, expect, it } from "vitest";
import {
  ACCOUNT_EXISTS, LINK_EXPIRED, MIN_PASSWORD_LENGTH, WRONG_LOGIN, authErrorText, isExistingAccountSignUp,
  newPasswordProblem, readAuthRedirect, readEmailLink, resetLinkSentText,
} from "./password";

describe("newPasswordProblem", () => {
  it("asks for a longer password", () => {
    expect(newPasswordProblem("abc", "abc")).toMatch(String(MIN_PASSWORD_LENGTH));
  });
  it("catches a mistyped confirmation", () => {
    expect(newPasswordProblem("shuttle-123", "shuttle-124")).toMatch(/don't match/);
  });
  it("accepts a long enough, matching password", () => {
    expect(newPasswordProblem("shuttle-123", "shuttle-123")).toBeNull();
  });
});

describe("authErrorText", () => {
  it("points Google users to Google when the password is rejected", () => {
    expect(authErrorText({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe(WRONG_LOGIN);
    // Older servers send only the message.
    expect(authErrorText({ message: "Invalid login credentials" })).toBe(WRONG_LOGIN);
  });
  it("explains a sign-up for an email that already has an account", () => {
    expect(authErrorText({ code: "user_already_exists", message: "User already registered" })).toBe(ACCOUNT_EXISTS);
  });
  it("handles password-change refusals", () => {
    expect(authErrorText({ code: "same_password", message: "x" })).toMatch(/already your password/);
    expect(authErrorText({ code: "reauthentication_needed", message: "x" })).toMatch(/sign in again/);
  });
  it("asks people to wait when reset emails are rate limited", () => {
    expect(authErrorText({ code: "over_email_send_rate_limit", message: "x" })).toMatch(/Wait a minute/);
    expect(authErrorText({ message: "For security purposes, you can only request this after 42 seconds." }))
      .toMatch(/Wait a minute/);
  });
  it("explains a used-up email link", () => {
    expect(authErrorText({ code: "otp_expired", message: "Email link is invalid or has expired" })).toBe(LINK_EXPIRED);
    expect(authErrorText({ message: "Token has expired or is invalid" })).toBeNull();
  });
  it("leaves unknown errors to the caller", () => {
    expect(authErrorText({ message: "network down" })).toBeNull();
    expect(authErrorText(null)).toBeNull();
  });
});

describe("isExistingAccountSignUp", () => {
  it("spots Supabase's stand-in user for an existing email", () => {
    expect(isExistingAccountSignUp({ identities: [] })).toBe(true);
  });
  it("treats a real new account as new", () => {
    expect(isExistingAccountSignUp({ identities: [{ provider: "email" }] })).toBe(false);
    expect(isExistingAccountSignUp(null)).toBe(false);
    expect(isExistingAccountSignUp({})).toBe(false);
  });
});

describe("resetLinkSentText", () => {
  it("names the address without saying whether it has an account", () => {
    expect(resetLinkSentText("a@iisc.ac.in")).toMatch(/^If a@iisc\.ac\.in has an account/);
  });
});

describe("readEmailLink", () => {
  it("reads sign-up and reset links from the template", () => {
    expect(readEmailLink("?token_hash=abc&type=recovery")).toEqual({ tokenHash: "abc", type: "recovery" });
    expect(readEmailLink("?token_hash=abc&type=email")).toEqual({ tokenHash: "abc", type: "email" });
  });
  it("ignores pages that aren't an email link, and link types the app doesn't use", () => {
    expect(readEmailLink("")).toBeNull();
    expect(readEmailLink("?type=recovery")).toBeNull();
    expect(readEmailLink("?token_hash=abc&type=invite")).toBeNull();
    expect(readEmailLink("?token_hash=&type=email")).toBeNull();
  });
});

describe("readAuthRedirect", () => {
  it("spots a password-reset link that signed someone in", () => {
    expect(readAuthRedirect("#access_token=t&refresh_token=r&type=recovery")).toEqual({ recovery: true, linkError: null });
  });
  it("ignores other sign-ins and plain pages", () => {
    expect(readAuthRedirect("#access_token=t&refresh_token=r&type=signup").recovery).toBe(false);
    expect(readAuthRedirect("")).toEqual({ recovery: false, linkError: null });
    // "type=recovery" without a session isn't a signed-in reset.
    expect(readAuthRedirect("#type=recovery").recovery).toBe(false);
  });
  it("explains an expired or reused link", () => {
    const r = readAuthRedirect("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid");
    expect(r).toEqual({ recovery: false, linkError: LINK_EXPIRED });
  });
  it("never shows text taken from the link itself", () => {
    const r = readAuthRedirect("#error=x&error_description=Call+this+number+now");
    expect(r.linkError).toMatch(/didn't work/);
    expect(r.linkError).not.toMatch(/Call this number/);
  });
});
