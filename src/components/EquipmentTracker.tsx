import { useState } from "react";
import { Check, Package, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, ConfirmDialog, Field, Input, Select, Sheet } from "./ui";
import { useSession } from "../lib/session";
import { errorText } from "../lib/supabase";
import { useEquipment, useEquipmentMutations, type EquipmentItem } from "../lib/sharedData";
import type { Member } from "../lib/types";

export function EquipmentTrackerModal({
  campId,
  open,
  onClose,
  players,
}: {
  campId: string;
  open: boolean;
  onClose: () => void;
  players: Member[];
}) {
  // Everyone sees the camp's gear; coaches and the admin manage it.
  const canEdit = useSession().isStaff;
  const equipment = useEquipment(open ? campId : undefined); // only fetch while the sheet is open
  const mut = useEquipmentMutations(campId);
  const items = equipment.data ?? [];
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<EquipmentItem | null>(null);
  const onErr = (e: unknown) => toast.error(errorText(e));

  // Form
  const [name, setName] = useState("");
  const [category, setCategory] = useState<EquipmentItem["category"]>("shuttles");
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState<EquipmentItem["status"]>("available");
  const [borrowedBy, setBorrowedBy] = useState<string>("");
  const [notes, setNotes] = useState("");

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const wasEditing = !!editingId;
    const previous = items.find((it) => it.id === editingId);
    const lending = status === "borrowed";

    mut.save.mutate(
      {
        id: editingId ?? undefined,
        name: name.trim(),
        category,
        quantity,
        status,
        borrowed_by: lending ? borrowedBy || null : null,
        // Keep the original check-out time when editing an item that's still with the same person.
        borrowed_at: lending
          ? previous?.borrowed_by === (borrowedBy || null) && previous?.borrowed_at
            ? previous.borrowed_at
            : new Date().toISOString()
          : null,
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => {
          setAdding(false);
          setEditingId(null);
          setName("");
          setQuantity(1);
          setStatus("available");
          setBorrowedBy("");
          setNotes("");
          toast.success(wasEditing ? "Equipment item updated" : "Equipment item added");
        },
        onError: onErr,
      },
    );
  };

  const handleEdit = (it: EquipmentItem) => {
    setEditingId(it.id);
    setName(it.name);
    setCategory(it.category);
    setQuantity(it.quantity);
    setStatus(it.status);
    setBorrowedBy(it.borrowed_by || "");
    setNotes(it.notes || "");
    setAdding(true);
  };

  const handleQuickReturn = (it: EquipmentItem) => {
    mut.save.mutate(
      {
        id: it.id,
        name: it.name,
        category: it.category,
        quantity: it.quantity,
        status: "available",
        borrowed_by: null,
        borrowed_at: null,
        notes: it.notes,
      },
      { onSuccess: () => toast.success(`${it.name} marked returned`), onError: onErr },
    );
  };

  const handleDelete = () => {
    if (!deleting) return;
    const it = deleting;
    setDeleting(null);
    mut.remove.mutate(it.id, { onSuccess: () => toast.success(`${it.name} removed`), onError: onErr });
  };

  const memberMap = new Map(players.map((p) => [p.id, p.full_name]));

  const filtered = categoryFilter === "all" ? items : items.filter((it) => it.category === categoryFilter);

  // Summary counts
  const needsReplacementCount = items.filter((it) => it.status === "needs_replacement").length;
  const borrowedCount = items.filter((it) => it.status === "borrowed").length;

  return (
    <Sheet open={open} onClose={onClose} title="Camp Equipment Tracker">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs text-ink-soft">
              Track shared camp rackets, shuttle boxes, agility cones, and first-aid kits.
            </p>
            <p className="text-[11px] text-ink font-semibold mt-0.5">
              {items.length} total items · {borrowedCount} checked out · {needsReplacementCount} needs replacement
            </p>
          </div>
          {canEdit && !adding && (
            <Button size="sm" onClick={() => { setEditingId(null); setName(""); setAdding(true); }}>
              <Plus size={14} /> Add gear
            </Button>
          )}
        </div>

        {canEdit && adding && (
          <form onSubmit={handleSave} className="p-3.5 rounded-xl border border-brand/30 bg-surface-2/60 space-y-3">
            <h4 className="text-xs font-bold text-ink">{editingId ? "Edit Equipment" : "Add Camp Equipment"}</h4>
            <Field label="Item name">
              <Input
                required
                placeholder="e.g. Yonex Nanoflare 800 Play, Speed 77 Shuttles, Agility Cones"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Category">
                <Select value={category} onChange={(e) => setCategory(e.target.value as EquipmentItem["category"])}>
                  <option value="shuttles">Shuttles</option>
                  <option value="rackets">Rackets</option>
                  <option value="training_aids">Training Aids</option>
                  <option value="medical">Medical / First Aid</option>
                </Select>
              </Field>
              <Field label="Quantity">
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Status">
                <Select value={status} onChange={(e) => setStatus(e.target.value as EquipmentItem["status"])}>
                  <option value="available">Available in hall</option>
                  <option value="borrowed">Checked out / Borrowed</option>
                  <option value="needs_replacement">Needs replacement / Broken</option>
                </Select>
              </Field>

              {status === "borrowed" ? (
                <Field label="Borrowed by">
                  <Select value={borrowedBy} onChange={(e) => setBorrowedBy(e.target.value)}>
                    <option value="">Select player</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>{p.full_name}</option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <Field label="Notes (optional)">
                  <Input placeholder="Grip size, condition, tension" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => { setAdding(false); setEditingId(null); }}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={mut.save.isPending}>
                {mut.save.isPending ? "Saving…" : "Save gear"}
              </Button>
            </div>
          </form>
        )}

        {/* Filter categories */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
          {["all", "shuttles", "rackets", "training_aids", "medical"].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-2.5 py-1 rounded-full font-medium transition capitalize whitespace-nowrap ${
                categoryFilter === cat
                  ? "bg-brand-pale text-brand border border-brand-border font-bold"
                  : "bg-surface-2 text-ink-soft border border-line hover:border-brand-border"
              }`}
            >
              {cat.replace("_", " ")}
            </button>
          ))}
        </div>

        {/* Equipment list */}
        <div className="space-y-2">
          {equipment.isLoading ? (
            <p className="text-xs text-ink-soft text-center py-6">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-ink-soft text-center py-6 border border-dashed border-line rounded-lg">
              {items.length === 0
                ? canEdit
                  ? "No gear listed yet. Tap Add gear to start the camp inventory."
                  : "Your coaches haven't listed any camp gear yet."
                : "No equipment found in this category."}
            </p>
          ) : (
            filtered.map((it) => {
              const isNeedsRep = it.status === "needs_replacement";
              const isBorrowed = it.status === "borrowed";
              const borrowerName = it.borrowed_by ? memberMap.get(it.borrowed_by) : null;

              return (
                <Card key={it.id} className="p-3 border-line space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="p-1.5 rounded-lg bg-surface-2 text-ink shrink-0 mt-0.5">
                        <Package size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-xs text-ink">{it.name}</span>
                          <span className="text-[10px] text-ink-soft font-mono">({it.quantity}x)</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <Badge tone={isNeedsRep ? "bad" : isBorrowed ? "warn" : "good"}>
                            {it.status.replace("_", " ")}
                          </Badge>
                          <span className="text-[10px] text-ink-soft capitalize">
                            {it.category.replace("_", " ")}
                          </span>
                        </div>
                        {isBorrowed && (
                          <p className="text-[11px] text-ink font-semibold mt-1">
                            Checked out to: {borrowerName ?? "Unknown player"}
                          </p>
                        )}
                        {it.notes && (
                          <p className="text-[11px] text-ink-soft mt-0.5">{it.notes}</p>
                        )}
                      </div>
                    </div>

                    {canEdit && (
                      <div className="flex items-center gap-1 shrink-0">
                        {isBorrowed && (
                          <Button size="sm" variant="secondary" onClick={() => handleQuickReturn(it)} disabled={mut.save.isPending}>
                            <Check size={12} /> Return
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="!p-1 text-ink-soft" onClick={() => handleEdit(it)}>
                          Edit
                        </Button>
                        <button
                          type="button"
                          onClick={() => setDeleting(it)}
                          className="text-ink-soft hover:text-red-600 p-1 transition-colors"
                          aria-label={`Delete ${it.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleting}
        title={`Remove ${deleting?.name ?? "this item"}?`}
        message="It disappears from the camp inventory for everyone."
        confirmLabel="Remove"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </Sheet>
  );
}
