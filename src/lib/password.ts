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

/** A friendly message for a Supabase auth error, or null when it isn't one we know. */
export function authErrorText(err: unknown): string | null {
  const e = err as { code?: string; message?: string } | null;
  const code = e?.code ?? "";
  const msg = e?.message ?? "";
  if (code === "invalid_credentials" || /invalid login credentials/i.test(msg)) return WRONG_LOGIN;
  if (code === "user_already_exists" || /already registered/i.test(msg)) return ACCOUNT_EXISTS;
  if (code === "email_not_confirmed" || /email not confirmed/i.test(msg))
    return "Confirm your email first: open the link we sent you, then sign in.";
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
