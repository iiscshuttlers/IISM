import { useState, useEffect } from "react";
import { AlertCircle, AlertTriangle, Check, Clock, Megaphone, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, Field, Input, Select, Sheet, Textarea, cx, fmtDate } from "./ui";
import {
  getAnnouncements,
  getAllAnnouncementsHistory,
  addAnnouncement,
  acknowledgeAnnouncement,
  deleteAnnouncement,
  type Announcement,
} from "../lib/campExtended";
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
  const [list, setList] = useState<Announcement[]>(() => getAnnouncements(campId));

  useEffect(() => {
    const handleSync = () => setList(getAnnouncements(campId));
    window.addEventListener("iism_extended_change", handleSync);
    return () => window.removeEventListener("iism_extended_change", handleSync);
  }, [campId]);

  if (list.length === 0) return null;

  const top = list[0];
  const isRead = meId ? top.read_by.includes(meId) : false;
  const isUrgent = top.priority === "urgent";
  const isImportant = top.priority === "important";

  const handleAcknowledge = () => {
    if (!meId) return;
    acknowledgeAnnouncement(campId, top.id, meId);
    setList(getAnnouncements(campId));
    toast.success("Announcement acknowledged");
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
              {top.expires_at && (
                <span className="text-[10px] text-ink-soft flex items-center gap-1">
                  <Clock size={10} /> Valid until {fmtDate(top.expires_at)}
                </span>
              )}
            </div>
            <p className="text-xs font-bold text-ink">{top.title}</p>
            <p className="text-xs text-ink-soft mt-0.5 whitespace-pre-wrap">{top.message}</p>
            <p className="text-[10px] text-ink-soft mt-1.5">
              Posted by {top.author_name} · {top.read_by.length} acknowledged
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {meId && !isRead && (
            <Button size="sm" onClick={handleAcknowledge} className="!text-xs !py-1">
              <Check size={14} /> Got it
            </Button>
          )}
          {isRead && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-status-success-text">
              <Check size={12} /> Read
            </span>
          )}
          {isStaff && onOpenManager && (
            <button
              type="button"
              onClick={onOpenManager}
              className="text-[11px] text-brand hover:underline font-semibold"
            >
              Manage
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
  authorName,
}: {
  campId: string;
  open: boolean;
  onClose: () => void;
  members: Member[];
  authorName: string;
}) {
  const [list, setList] = useState<Announcement[]>(() => getAllAnnouncementsHistory(campId));
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<Announcement["priority"]>("normal");
  const [expiresAt, setExpiresAt] = useState("");

  const reload = () => setList(getAllAnnouncementsHistory(campId));

  useEffect(() => {
    if (open) reload();
  }, [open, campId]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;

    addAnnouncement(campId, {
      title: title.trim(),
      message: message.trim(),
      priority,
      author_name: authorName || "Camp Staff",
      expires_at: expiresAt || null,
    });

    setTitle("");
    setMessage("");
    setExpiresAt("");
    setCreating(false);
    reload();
    toast.success("Announcement posted to camp");
  };

  const handleDelete = (id: string) => {
    deleteAnnouncement(campId, id);
    reload();
    toast.success("Announcement deleted");
  };

  const memberMap = new Map(members.map((m) => [m.id, m.full_name]));

  return (
    <Sheet open={open} onClose={onClose} title="Camp Announcements">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-ink-soft">
            Broadcast schedule updates, court room notices, and time reminders with read receipts.
          </p>
          {!creating && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus size={14} /> New notice
            </Button>
          )}
        </div>

        {creating && (
          <form onSubmit={handleCreate} className="p-3.5 rounded-xl border border-brand/40 bg-surface-2/60 space-y-3">
            <h4 className="text-xs font-bold text-ink">Post Announcement</h4>
            <Field label="Title">
              <Input
                required
                placeholder="e.g. Schedule Change: Evening Session at 5:00 PM"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label="Message">
              <Textarea
                required
                rows={3}
                placeholder="Details of the announcement..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Priority">
                <Select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Announcement["priority"])}
                >
                  <option value="normal">Normal</option>
                  <option value="important">Important</option>
                  <option value="urgent">Urgent</option>
                </Select>
              </Field>
              <Field label="Expires on (optional)">
                <Input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </Field>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Post announcement
              </Button>
            </div>
          </form>
        )}

        {/* Existing Announcements */}
        <div className="space-y-2.5">
          {list.length === 0 ? (
            <p className="text-xs text-ink-soft text-center py-6 border border-dashed border-line rounded-lg">
              No announcements posted yet.
            </p>
          ) : (
            list.map((a) => (
              <Card key={a.id} className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-2 border border-line">
                        {a.priority}
                      </span>
                      <h4 className="text-xs font-bold text-ink">{a.title}</h4>
                    </div>
                    <p className="text-xs text-ink-soft mt-1 whitespace-pre-wrap">{a.message}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(a.id)}
                    className="text-ink-soft hover:text-red-600 p-1 transition-colors"
                    title="Delete announcement"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="pt-2 border-t border-line flex items-center justify-between text-[11px] text-ink-soft">
                  <span>Posted {fmtDate(a.created_at)} by {a.author_name}</span>
                  <span className="flex items-center gap-1 font-semibold text-brand">
                    <Users size={12} /> {a.read_by.length} read receipts
                  </span>
                </div>

                {a.read_by.length > 0 && (
                  <div className="text-[10px] text-ink-soft bg-surface-2 p-1.5 rounded-lg flex flex-wrap gap-1">
                    <span className="font-semibold text-ink">Read by:</span>
                    {a.read_by.map((pid) => memberMap.get(pid) ?? "Player").join(", ")}
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      </div>
    </Sheet>
  );
}
