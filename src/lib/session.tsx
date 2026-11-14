import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session as AuthSession } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { outbox } from "./outbox";
import { must, supabase } from "./supabase";
import { useCamps, useIsSiteAdmin, useRole } from "./api";
import type { Camp, Role } from "./types";

interface Ctx {
  auth: AuthSession | null;
  authLoading: boolean;
  /** people.id after claiming; null = signed in but not on any roster. */
  meId: string | null | undefined;
  isSiteAdmin: boolean;
  camps: Camp[];
  camp: Camp | undefined;
  setCampId: (id: string) => void;
  role: Role | null | undefined;
  isStaff: boolean;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Ctx | null>(null);
const CAMP_KEY = "camp.selected";
/** localStorage key of the persisted React Query cache (see main.tsx). */
export const CACHE_KEY = "camp.cache.v1";

function readStoredCamp(): string | null {
  try { return localStorage.getItem(CAMP_KEY); } catch { return null; }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [campId, setCampIdState] = useState<string | null>(readStoredCamp);
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuth(data.session);
      setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setAuth(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = auth?.user.id;
  // Links the Google account to the admin-created profile with the same email.
  const me = useQuery({
    queryKey: ["me", userId],
    enabled: !!userId,
    staleTime: Infinity,
    queryFn: async () => (must(await supabase.rpc("claim_my_profile")) as string | null) ?? null,
  });
  const hasProfile = !!me.data;
  const camps = useCamps(hasProfile);
  const siteAdmin = useIsSiteAdmin(hasProfile);

  const camp = useMemo(() => {
    const list = camps.data ?? [];
    return list.find((c) => c.id === campId) ?? list.find((c) => c.status === "active") ?? list[0];
  }, [camps.data, campId]);
  const role = useRole(camp?.id);

  const value: Ctx = {
    auth,
    authLoading,
    meId: userId ? me.data : null,
    isSiteAdmin: !!siteAdmin.data,
    camps: camps.data ?? [],
    camp,
    setCampId: (id) => {
      setCampIdState(id);
      try { localStorage.setItem(CAMP_KEY, id); } catch { /* storage unavailable */ }
    },
    role: role.data,
    isStaff: role.data === "admin" || role.data === "coach",
    isAdmin: role.data === "admin",
    loading: authLoading || (!!userId && (me.isLoading || (hasProfile && (camps.isLoading || siteAdmin.isLoading || (!!camp && role.isLoading))))),
    signOut: async () => {
      await supabase.auth.signOut();
      // Nothing from this account stays on a shared phone.
      outbox.clear();
      qc.clear();
      try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
    },
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}
