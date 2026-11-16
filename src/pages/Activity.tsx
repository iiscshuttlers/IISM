import { useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, CheckCircle2, ChevronRight, Pencil, Swords } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "../lib/session";
import { useActivity, useAdminMutations, useMarkActivityItemRead, useMarkActivityRead, useMembers } from "../lib/api";
import { errorText } from "../lib/supabase";
import { Button, Empty, PageTitle, Segmented, Toggle, cx } from "../components/ui";
import type { ActivityRow } from "../lib/types";

type Filter = "all" | "unread";

/** Icon and action wording for each kind of alert (all alerts today are about a match). */
const KIND: Record<string, { Icon: typeof Swords; label: string; tone: string }> = {
  match_recorded: { Icon: Swords, label: "View match", tone: "text-brand" },
  match_edited: { Icon: Pencil, label: "View change", tone: "text-brand" },
  match_disputed: { Icon: AlertTriangle, label: "Review dispute", tone: "text-status-warn-text" },
  match_resolved: { Icon: CheckCircle2, label: "View result", tone: "text-status-success-text" },
};

/** Where an alert leads: straight to the match it's about, highlighted. */
export const activityHref = (a: Pick<ActivityRow, "match_id">) => (a.match_id ? `/matches?match=${a.match_id}` : "/matches");

export default function ActivityPage() {
  const s = useSession();
  const campId = s.camp!.id;
  const activity = useActivity(campId);
  const markAll = useMarkActivityRead(campId);
  const markOne = useMarkActivityItemRead();
  const members = useMembers(campId);
  const me = (members.data ?? []).find((m) => m.id === s.meId);
  const admin = useAdminMutations(campId);
  const [filter, setFilter] = useState<Filter>("all");

  const all = activity.data ?? [];
  const unreadCount = all.filter((a) => !a.read_at).length;
  const items = filter === "unread" ? all.filter((a) => !a.read_at) : all;

  return (
    <div className="space-y-4">
      <PageTitle
        action={
          unreadCount > 0 ? (
            <Button size="sm" variant="secondary" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
              Mark all read ({unreadCount})
            </Button>
          ) : undefined
        }
      >
        Activity
      </PageTitle>

      {me && (
        <div className="rounded-xl border border-line bg-surface px-4 py-1">
          <Toggle
            label="Show me camp activity"
            hint={s.camp!.activity_enabled ? "Updates when matches you played are recorded, edited, disputed or resolved." : "The camp admin has turned activity off for everyone."}
            checked={!me.activity_muted}
            disabled={!s.camp!.activity_enabled}
            onChange={(on) => admin.setMuted.mutate({ person_id: me.id, muted: !on }, { onError: (e) => toast.error(errorText(e)) })}
          />
        </div>
      )}

      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: `All (${all.length})` },
          { value: "unread", label: `Unread (${unreadCount})` },
        ]}
      />

      {activity.isLoading ? (
        <p className="text-sm text-ink-soft">Loading…</p>
      ) : items.length === 0 ? (
        <Empty>{filter === "unread" ? "You're all caught up." : "Nothing yet. You'll see updates here when matches you played are recorded or changed."}</Empty>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => {
            const kind = KIND[a.kind] ?? KIND.match_recorded;
            const { Icon } = kind;
            return (
              <li key={a.id}>
                <Link
                  href={activityHref(a)}
                  onClick={() => { if (!a.read_at) markOne.mutate(a.id); }}
                  className={cx(
                    "group block rounded-xl border bg-surface p-3 transition hover:bg-surface-2/60",
                    !a.read_at ? "border-line border-l-4 border-l-brand shadow-xs" : "border-line text-ink-soft",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <div className={cx("mt-0.5 shrink-0 rounded-lg p-1.5", !a.read_at ? "bg-brand-pale" : "bg-surface-2", kind.tone)}>
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className={cx("text-sm text-ink", !a.read_at && "font-semibold")}>{a.message}</p>
                        <p className="mt-1 text-xs text-ink-soft">
                          {new Date(a.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                      <span className="hidden text-[11px] font-semibold text-brand group-hover:underline sm:inline">{kind.label}</span>
                      <ChevronRight size={14} className="text-ink-soft transition-colors group-hover:text-brand" />
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
