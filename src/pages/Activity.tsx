import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Calendar, ChevronRight, Swords, Trophy, Users } from "lucide-react";
import { useSession } from "../lib/session";
import { useActivity, useMarkActivityRead } from "../lib/api";
import { Button, Empty, PageTitle, Segmented, Toggle, cx } from "../components/ui";
import { useAdminMutations, useMembers } from "../lib/api";
import { toast } from "sonner";
import { errorText } from "../lib/supabase";

type Filter = "all" | "unread" | "matches" | "training";

function getNotificationMeta(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("session") || lower.includes("drill") || lower.includes("training") || lower.includes("rpe")) {
    return { href: "/training", label: "View Session", category: "training" as const, Icon: Calendar };
  }
  if (lower.includes("selection") || lower.includes("squad") || lower.includes("roster")) {
    return { href: "/squad", label: "View Squad", category: "training" as const, Icon: Users };
  }
  if (lower.includes("standing") || lower.includes("rating") || lower.includes("elo") || lower.includes("leader")) {
    return { href: "/standings", label: "View Standings", category: "matches" as const, Icon: Trophy };
  }
  return { href: "/matches", label: "View Match", category: "matches" as const, Icon: Swords };
}

export default function ActivityPage() {
  const s = useSession();
  const campId = s.camp!.id;
  const activity = useActivity(campId);
  const markRead = useMarkActivityRead(campId);
  const members = useMembers(campId);
  const me = (members.data ?? []).find((m) => m.id === s.meId);
  const admin = useAdminMutations(campId);
  const [filter, setFilter] = useState<Filter>("all");

  const unreadCount = (activity.data ?? []).filter((a) => !a.read_at).length;

  const items = useMemo(() => {
    const all = activity.data ?? [];
    if (filter === "unread") return all.filter((a) => !a.read_at);
    if (filter === "matches") return all.filter((a) => getNotificationMeta(a.message).category === "matches");
    if (filter === "training") return all.filter((a) => getNotificationMeta(a.message).category === "training");
    return all;
  }, [activity.data, filter]);

  return (
    <div className="space-y-4">
      <PageTitle
        action={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                toast.success("In-app notifications are active!", {
                  description: "Match results, live scoring and roster alerts show up instantly.",
                });
              }}
            >
              Test Alert
            </Button>
            {unreadCount > 0 && (
              <Button size="sm" variant="secondary" onClick={() => markRead.mutate()}>
                Mark all read ({unreadCount})
              </Button>
            )}
          </div>
        }
      >
        Activity &amp; Alerts
      </PageTitle>

      {me && (
        <div className="rounded-xl border border-line bg-surface px-4 py-1">
          <Toggle
            label="Show me camp activity"
            hint={s.camp!.activity_enabled ? "Updates when matches you played are recorded, edited or resolved." : "The camp admin has turned activity off for everyone."}
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
          { value: "all", label: `All (${(activity.data ?? []).length})` },
          { value: "unread", label: `Unread (${unreadCount})` },
          { value: "matches", label: "Matches" },
          { value: "training", label: "Training" },
        ]}
      />

      {items.length === 0 ? (
        <Empty>{filter === "unread" ? "No unread notifications." : "No notifications in this filter."}</Empty>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => {
            const meta = getNotificationMeta(a.message);
            const { Icon } = meta;
            return (
              <li key={a.id}>
                <Link
                  href={meta.href}
                  className={cx(
                    "block rounded-xl border bg-surface p-3 transition hover:bg-surface-2/60 group",
                    !a.read_at
                      ? "border-l-4 border-l-brand border-line shadow-xs"
                      : "border-line text-ink-soft"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className={cx(
                        "p-1.5 rounded-lg shrink-0 mt-0.5",
                        !a.read_at ? "bg-brand-pale text-brand" : "bg-surface-2 text-ink-soft"
                      )}>
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className={cx("text-sm text-ink", !a.read_at && "font-semibold")}>
                          {a.message}
                        </p>
                        <p className="mt-1 text-xs text-ink-soft">
                          {new Date(a.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                      <span className="text-[11px] font-semibold text-brand group-hover:underline hidden sm:inline">
                        {meta.label}
                      </span>
                      <ChevronRight size={14} className="text-ink-soft group-hover:text-brand transition-colors" />
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
