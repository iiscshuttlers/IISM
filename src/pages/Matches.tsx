import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "../lib/session";
import { useMatchMutations, useMatches, useMembers, useStandings } from "../lib/api";
import { errorText } from "../lib/supabase";
import { MatchForm } from "../components/MatchForm";
import { MatchCard } from "../components/MatchCard";
import { PairingHelperModal } from "../components/PairingHelper";
import { Button, Empty, Field, PageTitle, Segmented, Sheet, Textarea } from "../components/ui";
import type { Category } from "../lib/scores";
import type { Match } from "../lib/types";

export default function MatchesPage() {
  const s = useSession();
  const campId = s.camp!.id;
  const matches = useMatches(campId);
  const members = useMembers(campId);
  const standings = useStandings(campId);
  const mut = useMatchMutations(campId);
  const [filter, setFilter] = useState<"all" | "mine" | "disputed">("all");
  const [recording, setRecording] = useState(false);
  const [prefill, setPrefill] = useState<{ category: Category; slots: (string | null)[] } | null>(null);
  const [editing, setEditing] = useState<Match | null>(null);
  const [disputing, setDisputing] = useState<Match | null>(null);
  const [resolving, setResolving] = useState<Match | null>(null);
  const [reason, setReason] = useState("");

  // ?new=1 opens the record sheet (used by the Today page).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") setRecording(true);
  }, []);

  const people = members.data ?? [];
  const players = people.filter((p) => p.role === "player");
  const list = (matches.data ?? []).filter((m) => {
    if (filter === "mine") return [m.t1_p1, m.t1_p2, m.t2_p1, m.t2_p2].includes(s.meId ?? "");
    if (filter === "disputed") return m.status === "disputed";
    return true;
  });
  const disputedCount = (matches.data ?? []).filter((m) => m.status === "disputed").length;

  return (
    <div>
      <PageTitle
        action={
          <div className="flex items-center gap-2">
            {players.length >= 2 && (
              <PairingHelperModal
                players={players}
                matches={matches.data ?? []}
                standings={standings.data ?? []}
                onSelectMatch={(cat, slots) => {
                  setPrefill({ category: cat, slots });
                  setRecording(true);
                }}
              />
            )}
            <Button
              onClick={() => {
                setPrefill(null);
                setRecording(true);
              }}
            >
              <Plus size={16} /> Record
            </Button>
          </div>
        }
      >
        Matches
      </PageTitle>
      {!s.camp!.players_see_all_results && !s.isStaff && (
        <p className="mb-3 text-xs text-ink-soft">The camp admin has limited this view to your own matches.</p>
      )}
      <div className="mb-4">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "mine", label: "Mine" },
            { value: "disputed", label: `Disputed${disputedCount ? ` (${disputedCount})` : ""}` },
          ]}
        />
      </div>

      {matches.isLoading ? (
        <p className="text-sm text-ink-soft">Loading…</p>
      ) : list.length === 0 ? (
        <Empty>No matches yet. Tap Record after a game.</Empty>
      ) : (
        <div className="space-y-2">
          {list.map((m) => (
            <MatchCard key={m.id} match={m} people={people} meId={s.meId} isStaff={s.isStaff}
              onEdit={setEditing} onDispute={(x) => { setReason(""); setDisputing(x); }} onResolve={setResolving} />
          ))}
        </div>
      )}

      <Sheet open={recording} onClose={() => { setRecording(false); setPrefill(null); }} title="Record match">
        {players.length < 2 ? (
          <Empty>Add players in Settings first.</Empty>
        ) : (
          <MatchForm
            key={prefill ? `${prefill.category}-${prefill.slots.join(",")}` : "fresh"}
            players={players}
            initialCategory={prefill?.category}
            initialSlots={prefill?.slots}
            submitLabel="Save match"
            busy={mut.record.isPending}
            onSubmit={async (m) => {
              await mut.record.mutateAsync(m);
              toast.success("Match recorded");
              setRecording(false);
              setPrefill(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title="Edit match">
        {editing && (
          <MatchForm players={players} initial={editing} submitLabel="Save changes" busy={mut.edit.isPending}
            onSubmit={async (m) => { await mut.edit.mutateAsync({ id: editing.id, m }); toast.success("Match updated"); setEditing(null); }} />
        )}
      </Sheet>

      <Sheet open={!!disputing} onClose={() => setDisputing(null)} title="Dispute result">
        <div className="space-y-3">
          <p className="text-sm text-ink-soft">A coach will review it. The match won't count in standings until resolved.</p>
          <Field label="What's wrong?">
            <Textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Second game was 21-19 to us" />
          </Field>
          <Button className="w-full" disabled={!reason.trim() || mut.dispute.isPending}
            onClick={() => mut.dispute.mutate({ id: disputing!.id, reason }, {
              onSuccess: () => { toast.success("Dispute sent to coaches"); setDisputing(null); },
              onError: (e) => toast.error(errorText(e)),
            })}>
            Send dispute
          </Button>
        </div>
      </Sheet>

      <Sheet open={!!resolving} onClose={() => setResolving(null)}
        title={resolving?.status === "disputed" ? "Resolve dispute" : resolving?.status === "void" ? "Restore match" : "Void match"}>
        {resolving && (
          <div className="space-y-4">
            {resolving.status !== "void" && (
              <Button variant="danger" className="w-full" disabled={mut.resolve.isPending}
                onClick={() => mut.resolve.mutate({ id: resolving.id, status: "void", games: null, winner: resolving.winner_side }, {
                  onSuccess: () => { toast.success("Match voided"); setResolving(null); },
                  onError: (e) => toast.error(errorText(e)),
                })}>
                Void match (removes it from standings)
              </Button>
            )}
            <div>
              <p className="mb-2 text-sm font-semibold">
                {resolving.status === "void" ? "Restore with this result" : "Or confirm with the correct result"}
              </p>
              <MatchForm players={people} initial={resolving} lockPlayers submitLabel="Confirm result" busy={mut.resolve.isPending}
                onSubmit={async (m) => {
                  await mut.resolve.mutateAsync({ id: resolving.id, status: "confirmed", games: m.games, winner: m.winner });
                  toast.success("Result confirmed");
                  setResolving(null);
                }} />
              <p className="mt-2 text-xs text-ink-soft">Players and category are fixed here. Use Edit to change them.</p>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
