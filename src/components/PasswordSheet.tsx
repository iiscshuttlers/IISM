import { useEffect, useState } from "react";
import { toast } from "sonner";
import { authRedirect, supabase, errorText } from "../lib/supabase";
import { MIN_PASSWORD_LENGTH, authErrorText, newPasswordProblem } from "../lib/password";
import { useSession } from "../lib/session";
import { Button, Field, Input, Sheet } from "./ui";

/**
 * After a password-reset link signs someone in, asks for the new password straight away, on
 * whichever screen they land (including "not on the roster" and "no camp yet").
 */
export function PasswordResetPrompt() {
  const s = useSession();
  // The address bar says so on first load; the event covers a link opened in an already-open tab.
  const [open, setOpen] = useState(authRedirect.recovery);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setOpen(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  if (!s.auth || s.loading) return null;
  return <PasswordSheet open={open} onClose={() => setOpen(false)} email={s.auth.user.email ?? ""} resetting />;
}

/**
 * Set or change the password for email sign-in. People who joined with Google have no password
 * until they set one here; after that, both Google and email + password open the same account.
 */
export function PasswordSheet({ open, onClose, email, resetting = false }: {
  open: boolean; onClose: () => void; email: string; resetting?: boolean;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setConfirm("");
      setShow(false);
      setProblem(null);
    }
  }, [open]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const issue = newPasswordProblem(password, confirm);
    setProblem(issue);
    if (issue) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(authErrorText(error) ?? errorText(error));
      return;
    }
    toast.success("Password saved. You can now sign in with your email and this password.");
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={resetting ? "Choose a new password" : "Sign-in password"}>
      <form onSubmit={save} className="space-y-3">
        {resetting ? (
          <p className="text-sm text-ink-soft">
            Your reset link signed you in. Choose a new password for{" "}
            <span className="break-all font-semibold text-ink">{email}</span>. It replaces the old one.
          </p>
        ) : (
          <p className="text-sm text-ink-soft">
            Set a password to sign in with <span className="break-all font-semibold text-ink">{email}</span> on any
            device, as well as with Google. If you already have a password, this replaces it.
          </p>
        )}
        {/* Lets password managers save the new password under the right email. */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <Field label="New password" hint={`At least ${MIN_PASSWORD_LENGTH} characters`}>
          <Input
            type={show ? "text" : "password"}
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Type it again">
          <Input
            type={show ? "text" : "password"}
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-xs text-ink-soft">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          Show password
        </label>
        {problem && <p role="alert" className="text-xs font-semibold text-status-danger-text">{problem}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Saving…" : "Save password"}
        </Button>
      </form>
    </Sheet>
  );
}
