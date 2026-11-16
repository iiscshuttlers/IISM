/**
 * Email + password helpers shared by the sign-in screen and the Me tab.
 *
 * A camp member who first signed in with Google has an account but no password, so the
 * password form answers "Invalid login credentials" and "sign up" refuses the email. These
 * helpers turn those Supabase answers into something that tells people what to do instead.
 */

/** Matches Supabase's default minimum password length. */
export const MIN_PASSWORD_LENGTH = 6;

/** Why a new password can't be saved yet, or null when it's fine. */
export function newPasswordProblem(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password !== confirm) return "The two passwords don't match.";
  return null;
}

export const WRONG_LOGIN =
  "Wrong email or password. If you joined with Google, tap Continue with Google. You can add a password later from the Me tab.";
export const ACCOUNT_EXISTS =
  "This email already has an account. Sign in instead, or tap Continue with Google if that's how you joined.";

export const NEED_EMAIL_FOR_RESET = "Type your email above first, then tap Forgot password.";
export const LINK_EXPIRED =
  "That email link has expired or was already used. Ask for a new one: tap Use email and password instead.";
const LINK_FAILED = "That email link didn't work. Ask for a new one: tap Use email and password instead.";

/** Shown after asking for a reset link. Supabase never says whether the email has an account. */
export function resetLinkSentText(email: string): string {
  return `If ${email} has an account, a reset link is on its way. Check Junk too. The link signs you in so you can choose a new password.`;
}

/** A friendly message for a Supabase auth error, or null when it isn't one we know. */
export function authErrorText(err: unknown): string | null {
  const e = err as { code?: string; message?: string } | null;
  const code = e?.code ?? "";
  const msg = e?.message ?? "";
  if (code === "invalid_credentials" || /invalid login credentials/i.test(msg)) return WRONG_LOGIN;
  if (code === "user_already_exists" || /already registered/i.test(msg)) return ACCOUNT_EXISTS;
  if (code === "email_not_confirmed" || /email not confirmed/i.test(msg))
    return "Confirm your email first: open the link we sent you, then sign in.";
  if (code === "over_email_send_rate_limit" || /only request this after/i.test(msg))
    return "An email was sent just now. Wait a minute, then try again.";
  if (code === "otp_expired" || /invalid or has expired/i.test(msg)) return LINK_EXPIRED;
  if (code === "same_password") return "That's already your password.";
  if (code === "reauthentication_needed")
    return "For safety, sign out and sign in again, then set your password straight away.";
  return null;
}

/**
 * With "Confirm email" on, Supabase answers a sign-up for an email that already has an account
 * with a stand-in user that has no identities (so it doesn't reveal who is registered).
 */
export function isExistingAccountSignUp(user: { identities?: unknown[] | null } | null | undefined): boolean {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0;
}

/** A sign-up confirmation ("email") or password reset ("recovery") link that hasn't been used yet. */
export interface EmailLink { tokenHash: string; type: "email" | "recovery" }

/**
 * The email templates link to the site as `?token_hash=…&type=…` instead of to Supabase. Opening
 * that page uses nothing up: the one-time token is only spent when the person taps to continue,
 * so a mail scanner that opens links first (common on university mail) can't burn it.
 */
export function readEmailLink(search: string): EmailLink | null {
  const p = new URLSearchParams(search);
  const tokenHash = p.get("token_hash");
  const type = p.get("type");
  if (!tokenHash || (type !== "email" && type !== "recovery")) return null;
  return { tokenHash, type };
}

/**
 * What an email link (sign-up confirmation or password reset) brought back in the address bar.
 * Supabase puts the result in the URL hash. Error text comes from fixed messages, never from the
 * URL, so a crafted link can't put its own words on the sign-in screen.
 */
export function readAuthRedirect(hash: string): { recovery: boolean; linkError: string | null } {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const failed = p.has("error") || p.has("error_code") || p.has("error_description");
  return {
    recovery: p.get("type") === "recovery" && p.has("access_token"),
    linkError: !failed ? null : p.get("error_code") === "otp_expired" ? LINK_EXPIRED : LINK_FAILED,
  };
}
