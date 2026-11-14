import { useState } from "react";
import { toast } from "sonner";
import { supabase, errorText } from "../lib/supabase";
import { useSession } from "../lib/session";
import { useCreateCamp } from "../lib/api";
import { Button, Card, Field, Input } from "../components/ui";

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
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">TC</div>
        <h1 className="text-xl font-bold">Training Camp</h1>
        <p className="mb-5 mt-1 text-sm text-ink-soft">Private site for camp players and coaches.</p>

        {/* Email / Password Form */}
        <form onSubmit={handleEmailAuth} className="space-y-3 text-left mb-4">
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

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Working…" : mode === "signin" ? "Sign in with password" : "Create password & sign up"}
          </Button>

          <div className="flex items-center justify-between text-xs pt-1">
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="text-brand font-semibold hover:underline"
            >
              {mode === "signin" ? "First time? Set a password" : "Already have a password? Sign in"}
            </button>
          </div>
        </form>

        <div className="relative my-4 flex items-center justify-center">
          <div className="border-t border-line w-full" />
          <span className="bg-surface px-2 text-[11px] font-medium text-ink-soft uppercase absolute">or</span>
        </div>

        {/* Google OAuth fallback */}
        <Button variant="secondary" className="w-full" onClick={signInWithGoogle} disabled={busy}>
          {busy ? "Opening Google…" : "Continue with Google"}
        </Button>

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
  return (
    <Centered>
      <Card>
        <h1 className="mb-2 text-lg font-bold">You're not on a camp roster</h1>
        <p className="mb-4 text-sm text-ink-soft">
          Signed in as <strong>{s.auth?.user.email}</strong>. Ask the camp admin to add this email to your profile, then
          sign in again.
        </p>
        <Button variant="secondary" className="w-full" onClick={s.signOut}>Sign out</Button>
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
          <p className="mb-4 text-sm text-ink-soft">The camp is currently visible to coaches only. Check back later.</p>
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
