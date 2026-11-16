import { useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase, errorText } from "../lib/supabase";
import { useSession } from "../lib/session";
import { useCreateCamp } from "../lib/api";
import { Button, Card, Field, Input } from "../components/ui";
import { AppLogo } from "../components/AppLogo";

const Centered = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-screen items-center justify-center p-4">
    <div className="w-full max-w-sm">{children}</div>
  </div>
);

export function SetupNeededPage() {
  return (
    <Centered>
      <Card>
        <h1 className="mb-2 text-lg font-bold">Setup needed</h1>
        <p className="text-sm text-ink-soft">
          Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to a <code>.env</code> file, then
          restart. See README.md.
        </p>
      </Card>
    </Centered>
  );
}

export function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  // Google is how the camp signs in; email + password is a fallback, one tap away.
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const signInWithGoogle = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
    });
    if (error) {
      toast.error(errorText(error));
      setBusy(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        toast.success("Signed in successfully");
      } else {
        const { error, data } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Account created and signed in!");
        } else {
          toast.success("Account created! Please check your email to confirm, or sign in if confirmation is disabled.");
          setMode("signin");
        }
      }
    } catch (err: unknown) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Centered>
      <Card className="text-center">
        <AppLogo size={56} className="mx-auto mb-3 shadow-sm" />
        <h1 className="text-xl font-bold">IISc Training Camp</h1>
        <p className="mb-5 mt-1 text-sm text-ink-soft">Private site for camp players and coaches.</p>

        <Button className="w-full" onClick={signInWithGoogle} disabled={busy}>
          {busy && !showPassword ? "Opening Google…" : "Continue with Google"}
        </Button>

        {!showPassword ? (
          <button type="button" onClick={() => setShowPassword(true)} className="mt-3 text-xs font-semibold text-brand hover:underline">
            Use email and password instead
          </button>
        ) : (
          <>
            <div className="relative my-4 flex items-center justify-center">
              <div className="w-full border-t border-line" />
              <span className="absolute bg-surface px-2 text-[11px] font-medium uppercase text-ink-soft">or</span>
            </div>
            <form onSubmit={handleEmailAuth} className="space-y-3 text-left">
              <Field label="Email">
                <Input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@gmail.com"
                />
              </Field>
              <Field label="Password">
                <Input
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </Field>

              <Button type="submit" variant="secondary" className="w-full" disabled={busy}>
                {busy ? "Working…" : mode === "signin" ? "Sign in with password" : "Create password & sign up"}
              </Button>

              <button
                type="button"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="text-xs font-semibold text-brand hover:underline"
              >
                {mode === "signin" ? "First time? Set a password" : "Already have a password? Sign in"}
              </button>
            </form>
          </>
        )}

        <p className="mt-4 text-xs text-ink-soft">Use the email your camp admin added to the roster.</p>
        <a href={`${import.meta.env.BASE_URL}privacy.html`} className="mt-2 inline-block text-xs font-semibold text-brand">
          Privacy policy
        </a>
      </Card>
    </Centered>
  );
}

export function NotOnRosterPage() {
  const s = useSession();
  const email = s.auth?.user.email ?? "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      toast.success("Email copied");
    } catch {
      toast.error("Couldn't copy. Long-press the email to copy it.");
    }
  };
  const askAdmin = () => {
    const text = `Hi, I can't get into the training camp app. Please add ${email} to my profile on the camp roster.`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  };
  return (
    <Centered>
      <Card>
        <h1 className="mb-2 text-lg font-bold">You're not on a camp roster yet</h1>
        <p className="text-sm text-ink-soft">You signed in as:</p>
        <p className="my-2 select-all break-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-sm text-ink">{email}</p>
        <p className="mb-4 text-sm text-ink-soft">
          Your camp admin needs to add this exact email to your profile. Then sign in again. If you meant to use a
          different Google account, sign out and pick that one.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={copy}><Copy size={14} /> Copy my email</Button>
          <Button variant="secondary" onClick={askAdmin}><MessageCircle size={14} className="text-emerald-600" /> Message admin</Button>
        </div>
        <Button variant="ghost" className="mt-2 w-full" onClick={s.signOut}>Sign out and use another account</Button>
      </Card>
    </Centered>
  );
}

export function NoCampPage() {
  const s = useSession();
  const create = useCreateCamp();
  const [form, setForm] = useState({ name: "", starts_on: "", ends_on: "", selection_target: 10 });

  if (!s.isSiteAdmin) {
    return (
      <Centered>
        <Card>
          <h1 className="mb-2 text-lg font-bold">No camp to show yet</h1>
          <p className="mb-4 text-sm text-ink-soft">
            You're on the roster, but your camp isn't open to players right now. Your coaches will open it when the camp
            starts. Check back then.
          </p>
          <Button variant="secondary" className="w-full" onClick={s.signOut}>Sign out</Button>
        </Card>
      </Centered>
    );
  }
  return (
    <Centered>
      <Card>
        <h1 className="mb-4 text-lg font-bold">Create your camp</h1>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(form, {
              onSuccess: (id) => { s.setCampId(id); toast.success("Camp created"); },
              onError: (err) => toast.error(errorText(err)),
            });
          }}
        >
          <Field label="Camp name">
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Selection camp, Nov 2026" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts"><Input type="date" value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} /></Field>
            <Field label="Ends"><Input type="date" value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} /></Field>
          </div>
          <Field label="Squad size (players to select)">
            <Input type="number" min={1} max={100} value={form.selection_target}
              onChange={(e) => setForm({ ...form, selection_target: Number(e.target.value) })} />
          </Field>
          <Button type="submit" className="w-full" disabled={create.isPending}>Create camp</Button>
        </form>
      </Card>
    </Centered>
  );
}
