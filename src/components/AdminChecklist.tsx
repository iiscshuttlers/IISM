import { useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, ChevronRight, Circle } from "lucide-react";
import { Card, cx } from "./ui";
import { useRosterAdmin } from "../lib/api";
import type { Camp, RosterAdminRow } from "../lib/types";

export interface SetupStep { key: string; title: string; hint: string; done: boolean; href: string }

/** The camp admin's setup steps, worked out from the camp and its roster. */
export function setupSteps(camp: Pick<Camp, "starts_on" | "ends_on" | "selection_target">, roster: Pick<RosterAdminRow, "role" | "email" | "signed_in">[]): SetupStep[] {
  const players = roster.filter((r) => r.role === "player").length;
  const coaches = roster.filter((r) => r.role === "coach").length;
  const withEmail = roster.filter((r) => r.email);
  const signedIn = withEmail.filter((r) => r.signed_in).length;
  return [
    {
      key: "dates", title: "Set the camp dates", hint: "Used for the calendar and the camp archive.",
      done: !!camp.starts_on && !!camp.ends_on, href: "/settings",
    },
    {
      key: "players", title: `Add your players (${players} added)`,
      hint: `At least the squad size (${camp.selection_target}). "Add many" takes a pasted list.`,
      done: players >= camp.selection_target, href: "/settings",
    },
    {
      key: "coaches", title: "Add your coaches", hint: "Coaches record attendance, assess players and run selection.",
      done: coaches > 0, href: "/settings",
    },
    {
      key: "signin", title: `Get everyone signed in (${signedIn} of ${withEmail.length})`,
      hint: "Send the sign-in steps on WhatsApp from the roster.",
      done: withEmail.length > 0 && signedIn === withEmail.length, href: "/settings?filter=pending",
    },
  ];
}

/** Shown to the camp admin on Today until setup is finished (or hidden). */
export function AdminSetupChecklist({ camp }: { camp: Camp }) {
  const roster = useRosterAdmin(camp.id, true);
  const key = `setup.hidden.${camp.id}`;
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(key) === "1"; } catch { return false; }
  });
  if (hidden || roster.isLoading || !roster.data) return null;

  const steps = setupSteps(camp, roster.data);
  const done = steps.filter((x) => x.done).length;
  if (done === steps.length) return null;

  const hide = () => {
    setHidden(true);
    try { localStorage.setItem(key, "1"); } catch { /* storage unavailable */ }
  };

  return (
    <Card className="!p-0">
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <p className="text-sm font-bold text-ink">Set up your camp · {done} of {steps.length} done</p>
        <button type="button" onClick={hide} className="text-[11px] font-semibold text-ink-soft hover:text-ink">Hide</button>
      </div>
      <div className="mx-4 mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-brand transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <div className="mt-1 divide-y divide-line">
        {steps.map((x) => (
          <Link key={x.key} href={x.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60">
            {x.done
              ? <CheckCircle2 size={18} className="shrink-0 text-status-success-text" />
              : <Circle size={18} className="shrink-0 text-ink-soft" />}
            <span className="min-w-0 flex-1">
              <span className={cx("block text-sm font-semibold", x.done ? "text-ink-soft line-through" : "text-ink")}>{x.title}</span>
              {!x.done && <span className="block text-[11px] text-ink-soft">{x.hint}</span>}
            </span>
            {!x.done && <ChevronRight size={16} className="shrink-0 text-ink-soft" />}
          </Link>
        ))}
      </div>
    </Card>
  );
}
