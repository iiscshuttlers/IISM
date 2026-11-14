import { Link } from "wouter";
import { useSession } from "../lib/session";
import { useActivity, useMarkActivityRead } from "../lib/api";
import { Button, Empty, PageTitle, Toggle, cx } from "../components/ui";
import { useAdminMutations, useMembers } from "../lib/api";
import { toast } from "sonner";
import { errorText } from "../lib/supabase";

export default function ActivityPage() {
  const s = useSession();
  const campId = s.camp!.id;
  const activity = useActivity(campId);
  const markRead = useMarkActivityRead(campId);
  const members = useMembers(campId);
  const me = (members.data ?? []).find((m) => m.id === s.meId);
  const admin = useAdminMutations(campId);
  const unread = (activity.data ?? []).some((a) => !a.read_at);

  return (
    <div>
      <PageTitle action={unread && <Button size="sm" variant="secondary" onClick={() => markRead.mutate()}>Mark all read</Button>}>
        Activity
      </PageTitle>
      {me && (
        <div className="mb-4 rounded-xl border border-line bg-surface px-4">
          <Toggle
            label="Show me camp activity"
            hint={s.camp!.activity_enabled ? "Updates when matches you played are recorded, edited or resolved." : "The camp admin has turned activity off for everyone."}
            checked={!me.activity_muted}
            disabled={!s.camp!.activity_enabled}
            onChange={(on) => admin.setMuted.mutate({ person_id: me.id, muted: !on }, { onError: (e) => toast.error(errorText(e)) })}
          />
        </div>
      )}
      {(activity.data ?? []).length === 0 ? (
        <Empty>Nothing yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {(activity.data ?? []).map((a) => (
            <li key={a.id}>
              <Link href="/matches" className={cx("block rounded-xl border border-line bg-surface p-3", !a.read_at && "border-brand/50")}>
                <p className={cx("text-sm", !a.read_at && "font-semibold")}>{a.message}</p>
                <p className="text-xs text-ink-soft">{new Date(a.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
