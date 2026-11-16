import type { ReactNode } from "react";
import { BellRing, X } from "lucide-react";

/**
 * The match a phone alert pointed at (`/matches?match=<id>`), pinned above the list so it's
 * the first thing seen whatever filters are set. `children` is the match card, or nothing when
 * the match can't be shown (removed, or hidden by the camp's results setting).
 */
export function AlertedMatch({ children, onClose }: { children?: ReactNode; onClose: () => void }) {
  return (
    <section aria-label="Match from your alert" className="mb-4 rounded-2xl border border-brand-border bg-brand-pale p-2">
      <div className="mb-1.5 flex items-center gap-1.5 px-1">
        <BellRing size={13} className="text-brand" />
        <p className="flex-1 text-xs font-bold text-brand">From your alert</p>
        <button type="button" onClick={onClose} aria-label="Close and show all matches"
          className="rounded-lg p-1 text-ink-soft transition hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          <X size={15} />
        </button>
      </div>
      {children ?? (
        <p className="px-1 pb-1 text-xs text-ink-soft">
          This match isn't available any more. It may have been removed, or the camp admin has limited what you can see.
        </p>
      )}
    </section>
  );
}
