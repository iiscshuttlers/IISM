import { describe, expect, it } from "vitest";
import {
  ACCOUNT_EXISTS, MIN_PASSWORD_LENGTH, WRONG_LOGIN, authErrorText, isExistingAccountSignUp, newPasswordProblem,
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
