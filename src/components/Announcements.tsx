import { useState } from "react";
import { AlertCircle, AlertTriangle, Check, Clock, Megaphone, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, ConfirmDialog, Field, Input, Select, Sheet, Textarea, cx, fmtDate, today } from "./ui";
import { useSession } from "../lib/session";
import { useMembers } from "../lib/api";
import { errorText } from "../lib/supabase";
import {
  activeAnnouncements,
  useAnnouncementMutations,
  useAnnouncements,
  type Priority,
} from "../lib/sharedData";
import type { Member } from "../lib/types";

export function AnnouncementBanner({
  campId,
  meId,
  isStaff,
  onOpenManager,
}: {
  campId: string;
  meId: string | null;
  isStaff: boolean;
  onOpenManager?: () => void;
}) {
  const announcements = useAnnouncements(campId);
  const members = useMembers(campId);
  const mut = useAnnouncementMutations(campId);
  const list = activeAnnouncements(announcements.data ?? [], today());

  if (list.length === 0) return null;

  const top = list[0];
  const isRead = meId ? top.read_by.includes(meId) : false;
  const isUrgent = top.priority === "urgent";
  const isImportant = top.priority === "important";
  const author = (members.data ?? []).find((m) => m.id === top.created_by)?.full_name ?? "Camp staff";

  const handleAcknowledge = () => {
    if (!meId) return;
    mut.acknowledge.mutate(
      { announcementId: top.id, personId: meId },
      {
        onSuccess: () => toast.success("Announcement acknowledged"),
        onError: (e) => toast.error(errorText(e)),
      },
    );
  };

  return (
    <Card
      className={cx(
        "p-3.5 border transition-all shadow-xs",
        isUrgent
          ? "border-status-danger-border bg-status-danger-bg/40"
          : isImportant
          ? "border-status-warn-border bg-status-warn-bg/40"
          : "border-brand-border bg-brand-pale/40"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="shrink-0 mt-0.5">
            {isUrgent ? (
              <AlertCircle size={18} className="text-status-danger-text animate-pulse" />
            ) : isImportant ? (
              <AlertTriangle size={18} className="text-status-warn-text" />
            ) : (
              <Megaphone size={18} className="text-brand" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
              <span
                className={cx(
                  "text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border",
                  isUrgent
                    ? "bg-status-danger-bg text-status-danger-text border-status-danger-border"
                    : isImportant
                    ? "bg-status-warn-bg text-status-warn-text border-status-warn-border"
                    : "bg-brand-pale text-brand border-brand-border"
                )}
              >
                {top.priority} announcement
              </span>
              {top.expires_on && (
                <span className="text-[10px] text-ink-soft flex items-center gap-1">
                  <Clock size={10} /> Valid until {fmtDate(top.expires_on)}
                </span>
              )}
            </div>
            <p className="text-xs font-bold text-ink">{top.title}</p>
            <p className="text-xs text-ink-soft mt-0.5 whitespace-pre-wrap">{top.message}</p>
            <p className="text-[10px] text-ink-soft mt-1.5">
              Posted by {author}
              {isStaff && ` · ${top.read_by.length} acknowledged`}
              {list.length > 1 && ` · ${list.length - 1} more`}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {meId && !isRead && (
            <Button size="sm" onClick={handleAcknowledge} disabled={mut.acknowledge.isPending} className="!text-xs !py-1">
              <Check size={14} /> Got it
            </Button>
          )}
          {isRead && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-status-success-text">
              <Check size={12} /> Read
            </span>
          )}
          {onOpenManager && (
            <button
              type="button"
              onClick={onOpenManager}
              className="text-[11px] text-brand hover:underline font-semibold"
            >
              {isStaff ? "Manage" : list.length > 1 ? "See all" : "History"}
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

export function AnnouncementManagerModal({
  campId,
  open,
  onClose,
  members,
}: {
  campId: string;
  open: boolean;
  onClose: () => void;
  members: Member[];
  /** No longer used: the author is recorded by the database. Kept so existing callers compile. */
  authorName?: string;
}) {
  const s = useSession();
  const canPost = s.isStaff;
  const announcements = useAnnouncements(campId);
  const mut = useAnnouncementMutations(campId);
  const list = announcements.data ?? [];
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [expiresAt, setExpiresAt] = useState("");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;
    mut.post.mutate(
      { title: title.trim(), message: message.trim(), priority, expires_on: expiresAt || null },
      {
        onSuccess: () => {
          setTitle("");
          setMessage("");
          setExpiresAt("");
          setPriority("normal");
          setCreating(false);
          toast.success("Announcement posted to the camp");
        },
        onError: (err) => toast.error(errorText(err)),
      },
    );
  };

  const handleDelete = () => {
    if (!deleting) return;
    mut.remove.mutate(deleting, {
      onSuccess: () => toast.success("Announcement deleted"),
      onError: (err) => toast.error(errorText(err)),
    });
    setDeleting(null);
  };

  const memberMap = new Map(members.map((m) => [m.id, m.full_name]));
  const day = today();

  return (
    <Sheet open={open} onClose={onClose} title="Camp Announcements">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink-soft">
            {canPost
              ? "Post schedule changes, court notices and reminders. Everyone in the camp sees them, with read receipts."
              : "Notices from your coaches. Tap Got it on the Today page so they know you've seen it."}
          </p>
          {canPost && !creating && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus size={14} /> New notice
            </Button>
          )}
        </div>

        {canPost && creating && (
          <form onSubmit={handleCreate} className="p-3.5 rounded-xl border border-brand/40 bg-surface-2/60 space-y-3">
            <h4 className="text-xs font-bold text-ink">Post Announcement</h4>
            <Field label="Title">
              <Input
                required
                maxLength={120}
                placeholder="e.g. Schedule Change: Evening Session at 5:00 PM"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label="Message">
              <Textarea
                required
                rows={3}
                maxLength={2000}
                placeholder="Details of the announcement..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Priority">
                <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                  <option value="normal">Normal</option>
                  <option value="important">Important</option>
                  <option value="urgent">Urgent</option>
                </Select>
              </Field>
              <Field label="Expires on (optional)">
                <Input type="date" min={day} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </Field>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={mut.post.isPending}>
                {mut.post.isPending ? "Posting…" : "Post announcement"}
              </Button>
            </div>
          </form>
        )}

        <div className="space-y-2.5">
          {announcements.isLoading ? (
            <p className="text-xs text-ink-soft text-center py-6">Loading…</p>
          ) : list.length === 0 ? (
            <p className="text-xs text-ink-soft text-center py-6 border border-dashed border-line rounded-lg">
              No announcements posted yet.
            </p>
          ) : (
            list.map((a) => {
              const expired = !!a.expires_on && a.expires_on < day;
              return (
                <Card key={a.id} className={cx("space-y-2 p-3", expired && "opacity-60")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-2 border border-line">
                          {expired ? "expired" : a.priority}
                        </span>
                        <h4 className="text-xs font-bold text-ink">{a.title}</h4>
                      </div>
                      <p className="text-xs text-ink-soft mt-1 whitespace-pre-wrap">{a.message}</p>
                    </div>
                    {canPost && (
                      <button
                        type="button"
                        onClick={() => setDeleting(a.id)}
                        className="text-ink-soft hover:text-red-600 p-1 transition-colors"
                        aria-label={`Delete announcement ${a.title}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>

                  <div className="pt-2 border-t border-line flex items-center justify-between text-[11px] text-ink-soft">
                    <span>
                      Posted {fmtDate(a.created_at)} by {memberMap.get(a.created_by ?? "") ?? "Camp staff"}
                    </span>
                    {canPost && (
                      <span className="flex items-center gap-1 font-semibold text-brand">
                        <Users size={12} /> {a.read_by.length} read
                      </span>
                    )}
                  </div>

                  {canPost && a.read_by.length > 0 && (
                    <div className="text-[10px] text-ink-soft bg-surface-2 p-1.5 rounded-lg flex flex-wrap gap-1">
                      <span className="font-semibold text-ink">Read by:</span>
                      {a.read_by.map((pid) => memberMap.get(pid) ?? "Former member").join(", ")}
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleting}
        title="Delete this announcement?"
        message="It disappears for everyone in the camp."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </Sheet>
  );
}
