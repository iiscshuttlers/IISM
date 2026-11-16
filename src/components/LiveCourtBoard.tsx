import { useState } from "react";
import { Play, Sparkles, Check, X, Swords, Dumbbell } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, Sheet, cx } from "./ui";
import { toast } from "sonner";
import { errorText } from "../lib/supabase";
import { MAX_COURTS, courtNumbers, useCourtMutations, useCourts, type CourtAllocation } from "../lib/sharedData";
import { useSession } from "../lib/session";
import type { Member } from "../lib/types";

/** A court on the board: its allocation, or open when nothing is assigned. */
interface CourtView {
  court_num: number;
  status: CourtAllocation["status"] | "open";
  title: string;
  subtitle: string | null;
  started_at: string | null;
}

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function LiveCourtBoard({
  campId,
  isStaff,
  players,
  onRecordMatchOnCourt,
  hideWhenIdle = false,
}: {
  campId: string;
  isStaff?: boolean;
  players: Member[];
  onRecordMatchOnCourt?: (courtNum: number) => void;
  /** Render nothing while every court is open (players don't need an empty board). */
  hideWhenIdle?: boolean;
}) {
  // Shared by the whole camp: coaches assign courts, everyone sees the board update live.
  const courtsQ = useCourts(campId);
  const mut = useCourtMutations(campId);
  const courtCount = useSession().camp?.court_count ?? 4;
  const [choosingCount, setChoosingCount] = useState(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const courts: CourtView[] = courtNumbers(courtCount).map(
    (n) =>
      courtsQ.data?.find((c) => c.court_num === n) ?? {
        court_num: n, status: "open", title: `Court ${n} available`, subtitle: null, started_at: null,
      },
  );
  const [selectedCourt, setSelectedCourt] = useState<CourtView | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  // Form state for updating court
  const [formStatus, setFormStatus] = useState<CourtAllocation["status"]>("match");
  const [formTitle, setFormTitle] = useState("");
  const [formSubtitle, setFormSubtitle] = useState("");
  const onErr = (e: unknown) => toast.error(errorText(e));

  const busyAbove = (n: number) => (courtsQ.data ?? []).filter((c) => c.court_num > n);
  const chooseCount = (n: number) => {
    setChoosingCount(false);
    if (n === courtCount) return;
    if (busyAbove(n).length) setPendingCount(n);
    else applyCount(n);
  };
  const applyCount = (n: number) => {
    setPendingCount(null);
    mut.setCount.mutate(n, {
      onSuccess: () => toast.success(`Board set to ${n} court${n === 1 ? "" : "s"}`),
      onError: onErr,
    });
  };

  const handleOpenAssign = (c: CourtView) => {
    setSelectedCourt(c);
    setFormStatus(c.status === "open" ? "match" : c.status);
    setFormTitle(c.status === "open" ? "" : c.title);
    setFormSubtitle(c.subtitle || "");
    setAssignOpen(true);
  };

  const handleSaveCourt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourt) return;
    const courtNum = selectedCourt.court_num;

    mut.assign.mutate(
      {
        court_num: courtNum,
        status: formStatus,
        title: formTitle.trim() || `Court ${courtNum} active`,
        subtitle: formSubtitle.trim() || null,
        // Editing a busy court keeps its start time; a newly assigned court starts now.
        started_at: selectedCourt.status !== "open" && selectedCourt.started_at ? selectedCourt.started_at : new Date().toISOString(),
      },
      {
        onSuccess: () => {
          toast.success(`Court ${courtNum} updated`);
          setAssignOpen(false);
        },
        onError: onErr,
      },
    );
  };

  const handleClear = (courtNum: number) => {
    mut.free.mutate(courtNum, {
      onSuccess: () => toast.success(`Court ${courtNum} is now open.`),
      onError: onErr,
    });
  };

  if (hideWhenIdle && !courtsQ.data?.length) return null;

  return (
    <>
      <Card className="border-line bg-surface">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-status-success-text animate-pulse" />
            <h3 className="text-sm font-bold text-ink">Live courts</h3>
          </div>
          <p className="text-[11px] text-ink-soft">
            {courts.filter((c) => c.status !== "open").length} of {courtCount} active
            {isStaff && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => setChoosingCount((v) => !v)}
                  aria-expanded={choosingCount}
                  className="font-semibold text-brand hover:underline"
                >
                  Courts: {courtCount} · Change
                </button>
              </>
            )}
          </p>
        </div>

        {/* 2x2 or 4x1 Badminton Courts Grid */}
        {isStaff && choosingCount && (
          <div className="mb-3 rounded-xl border border-brand/40 bg-brand-pale/30 p-2.5">
            <p className="mb-2 text-xs font-semibold text-ink">How many courts are you using?</p>
            <div className="grid grid-cols-8 gap-1">
              {Array.from({ length: MAX_COURTS }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => chooseCount(n)}
                  disabled={mut.setCount.isPending}
                  aria-pressed={n === courtCount}
                  aria-label={`${n} court${n === 1 ? "" : "s"}`}
                  className={cx(
                    "min-h-[40px] rounded-lg border text-sm font-bold",
                    n === courtCount ? "border-brand-border bg-brand-pale text-brand" : "border-line bg-surface text-ink",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* One column on the narrowest phones so names and buttons never get squeezed. */}
        <div className={cx("grid gap-2", courtCount === 1 ? "grid-cols-1" : courtCount <= 4 ? "grid-cols-1 min-[360px]:grid-cols-2" : "grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-4")}>
          {courts.map((court) => {
            const isMatch = court.status === "match";
            const isDrill = court.status === "drill";
            const isWarmup = court.status === "warmup";
            const isOpen = court.status === "open";

            const tone: "good" | "brand" | "warn" | "neutral" = isMatch
              ? "good"
              : isDrill
              ? "brand"
              : isWarmup
              ? "warn"
              : "neutral";

            return (
              <div
                key={court.court_num}
                className={cx(
                  "relative flex flex-col justify-between rounded-xl p-3 transition-colors",
                  isMatch ? "bg-status-success-bg" : isDrill ? "bg-brand-pale" : isWarmup ? "bg-status-warn-bg" : "bg-surface-2/70",
                )}
              >
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
                    <span className="whitespace-nowrap text-xs font-bold uppercase tracking-wide text-ink-soft">
                      Court {court.court_num}
                    </span>
                    <Badge tone={tone}>
                      {isMatch ? "Match" : isDrill ? "Drill" : isWarmup ? "Warm-up" : "Open"}
                    </Badge>
                  </div>

                  <p className="text-xs font-bold text-ink leading-snug truncate">
                    {court.title}
                  </p>
                  {court.subtitle && (
                    <p className="text-[11px] text-ink-soft truncate mt-0.5">{court.subtitle}</p>
                  )}
                  {court.started_at && !isOpen && (
                    <p className="mt-1 text-[11px] tabular-nums text-ink-soft">
                      Started: {fmtTime(court.started_at)}
                    </p>
                  )}
                </div>

                {/* Players without actions get no empty strip. */}
                {(onRecordMatchOnCourt || isStaff) && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-1 border-t border-line/60 pt-2">
                  {onRecordMatchOnCourt && (
                    <button
                      type="button"
                      onClick={() => onRecordMatchOnCourt(court.court_num)}
                      className="text-[11px] font-semibold text-brand hover:underline flex items-center gap-1 cursor-pointer"
                      title={`Record score for Court ${court.court_num}`}
                    >
                      <Play size={11} />
                      <span>Record</span>
                    </button>
                  )}

                  {isStaff && (
                    <div className="flex items-center gap-1.5 ml-auto">
                      {!isOpen && (
                        <button
                          type="button"
                          onClick={() => handleClear(court.court_num)}
                          disabled={mut.free.isPending}
                          className="p-1 rounded text-ink-soft hover:text-status-danger-text text-[11px]"
                          aria-label={`Free court ${court.court_num}`}
                        >
                          <X size={12} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleOpenAssign(court)}
                        className="px-2 py-0.5 rounded text-[11px] font-semibold bg-surface border border-line text-ink hover:border-brand/40"
                      >
                        {isOpen ? "Assign" : "Edit"}
                      </button>
                    </div>
                  )}
                </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <ConfirmDialog
        open={pendingCount !== null}
        title={`Use ${pendingCount} court${pendingCount === 1 ? "" : "s"}?`}
        message={pendingCount !== null
          ? `${busyAbove(pendingCount).map((c) => `Court ${c.court_num} (${c.title})`).join(", ")} will be cleared.`
          : undefined}
        confirmLabel="Change courts"
        onConfirm={() => pendingCount !== null && applyCount(pendingCount)}
        onCancel={() => setPendingCount(null)}
      />

      {/* Assign Court Modal */}
      {selectedCourt && (
        <Sheet
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          title={`Court ${selectedCourt.court_num} Allocation`}
        >
          <form onSubmit={handleSaveCourt} className="space-y-4">
            <p className="text-xs text-ink-soft">
              Assign this court to an active match, technique drill, or warmup station.
            </p>

            <div>
              <label className="text-xs font-semibold text-ink-soft block mb-1">Court Mode</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: "match" as const, label: "Match Play", icon: Swords },
                  { key: "drill" as const, label: "Drill Routine", icon: Dumbbell },
                  { key: "warmup" as const, label: "Warmup / Free", icon: Sparkles },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setFormStatus(item.key)}
                      className={`p-2.5 rounded-lg border text-xs font-bold flex flex-col items-center gap-1 transition ${
                        formStatus === item.key
                          ? "bg-brand text-white border-brand shadow-xs"
                          : "bg-surface text-ink border-line hover:bg-surface-2"
                      }`}
                    >
                      <Icon size={16} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-ink-soft block mb-1">
                Activity Title <span className="text-status-danger-text">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={120}
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder={
                  formStatus === "match"
                    ? "e.g. MD: Aneesh & Raja vs Suresh & Varun"
                    : formStatus === "drill"
                    ? "e.g. Smash Defense 2-on-1 Drills"
                    : "e.g. General Racket Warmup"
                }
                className="w-full text-xs rounded-lg border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-brand"
              />
              {players && players.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1 items-center">
                  <span className="text-[10px] text-ink-soft">Quick add:</span>
                  {players.slice(0, 8).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setFormTitle((prev) => (prev ? `${prev} & ${p.full_name}` : p.full_name));
                      }}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-line bg-surface-2 hover:border-brand/40 text-ink cursor-pointer"
                    >
                      +{p.full_name.split(" ")[0]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-ink-soft block mb-1">
                Coach Notes / Subtitle (Optional)
              </label>
              <input
                type="text"
                maxLength={200}
                value={formSubtitle}
                onChange={(e) => setFormSubtitle(e.target.value)}
                placeholder="e.g. Best of 3 sets, 21 pts"
                className="w-full text-xs rounded-lg border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>

            <div className="pt-2 space-y-2">
              <Button type="submit" className="w-full" disabled={mut.assign.isPending}>
                <Check size={14} className="mr-1.5" />
                <span>{mut.assign.isPending ? "Saving…" : `Save Court ${selectedCourt.court_num}`}</span>
              </Button>

              {selectedCourt.status !== "open" && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    handleClear(selectedCourt.court_num);
                    setAssignOpen(false);
                  }}
                  className="w-full text-status-danger-text hover:bg-status-danger-bg/20"
                >
                  Clear / Free Court {selectedCourt.court_num}
                </Button>
              )}
            </div>
          </form>
        </Sheet>
      )}
    </>
  );
}
