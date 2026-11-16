import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ───────── Overlay behaviour: Esc, the phone's Back button, scroll lock ─────────

const overlayStack: string[] = [];
let overlaySeq = 0;
let bodyOverflowBefore = "";

/** Pops still to come from our own history.back() calls; overlays ignore those. */
let ownPops = 0;

/** history.back() whose popstate the overlay listeners ignore (it only removes our own entry). */
function ownBack() {
  ownPops++;
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    window.removeEventListener("popstate", settle);
    window.clearTimeout(timer);
    // Clear the flag only after every listener for this popstate has seen it.
    window.setTimeout(() => { ownPops = Math.max(0, ownPops - 1); }, 0);
  };
  const timer = window.setTimeout(settle, 1000); // in case the browser never fires it
  window.addEventListener("popstate", settle);
  window.history.back();
}

/**
 * While `open`: Esc and the phone's Back button close the top-most overlay (instead of leaving
 * the app), and the page behind it stops scrolling.
 */
export function useOverlayDismiss(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    // Unique across reloads too: a reloaded page can sit on an entry an earlier overlay pushed.
    const id = `${Date.now().toString(36)}-${++overlaySeq}`;
    overlayStack.push(id);
    const isTop = () => overlayStack[overlayStack.length - 1] === id;

    if (overlayStack.length === 1) {
      bodyOverflowBefore = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }

    // One same-URL history entry per overlay, so Back pops it. Deferred a tick so React
    // StrictMode's mount → unmount → mount in development doesn't push and pop twice.
    let pushed = false;
    let closedByBack = false;
    const pushTimer = window.setTimeout(() => {
      window.history.pushState({ ...(window.history.state ?? {}), overlay: id }, "");
      pushed = true;
    }, 0);

    const onPop = () => {
      if (ownPops === 0 && pushed && isTop()) {
        closedByBack = true;
        closeRef.current();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isTop()) {
        e.preventDefault();
        closeRef.current();
      }
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);

    return () => {
      window.clearTimeout(pushTimer);
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      overlayStack.splice(overlayStack.indexOf(id), 1);
      if (overlayStack.length === 0) document.body.style.overflow = bodyOverflowBefore;
      // Closed with ✕, Cancel or Save: drop our entry so Back still leaves the page next time.
      if (pushed && !closedByBack && window.history.state?.overlay === id) ownBack();
    };
  }, [open]);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex select-none items-center justify-center gap-1.5 rounded-xl font-semibold transition-[background-color,color,box-shadow,transform] duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]",
        size === "sm" ? "min-h-[36px] px-3 py-1.5 text-xs" : "min-h-[44px] px-4 py-2.5 text-sm",
        variant === "primary" && "bg-brand text-white shadow-[0_1px_2px_rgb(0_0_0/0.12),inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-brand-dark",
        variant === "secondary" && "bg-surface text-ink shadow-card ring-1 ring-line hover:bg-surface-2",
        variant === "ghost" && "text-ink-soft hover:bg-surface-2 hover:text-ink",
        variant === "danger" && "bg-red-600 text-white shadow-sm hover:bg-red-700",
        className,
      )}
    />
  );
}

export const Card = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cx("rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line/70", className)}>{children}</div>
);

/** A titled group on a page: a small label, an optional action, then its content. */
export function Section({ title, action, children, className }: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("space-y-2.5", className)}>
      {(title || action) && (
        <div className="flex min-h-[24px] items-center justify-between gap-3 px-1">
          {title && <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-faint">{title}</h2>}
          {action && <div className="text-xs font-semibold text-brand">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Placeholder while something loads (keeps the layout from jumping). */
export const Skeleton = ({ className }: { className?: string }) => (
  <div aria-hidden className={cx("animate-shimmer rounded-xl bg-surface-3/70", className)} />
);

const AVATAR_COLORS = [
  "bg-teal-600 text-white",
  "bg-indigo-600 text-white",
  "bg-emerald-600 text-white",
  "bg-blue-600 text-white",
  "bg-amber-600 text-white",
  "bg-purple-600 text-white",
  "bg-rose-600 text-white",
  "bg-cyan-600 text-white",
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const parts = name.trim().split(/\s+/);
  const initials =
    parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : (parts[0]?.slice(0, 2) || "—").toUpperCase();
  const color = AVATAR_COLORS[hashName(name) % AVATAR_COLORS.length];

  return (
    <span
      className={cx(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold tracking-tight",
        size === "xs" && "h-5 w-5 text-[9px]",
        size === "sm" && "h-6 w-6 text-[10px]",
        size === "md" && "h-8 w-8 text-xs",
        size === "lg" && "h-10 w-10 text-sm",
        color,
        className,
      )}
      title={name}
      aria-label={name}
    >
      {initials}
    </span>
  );
}

export const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold text-ink-soft">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
  </label>
);

const inputCls =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint transition-[border-color,box-shadow] focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:opacity-60";

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...p} className={cx(inputCls, "min-h-[72px]", p.className)} />
);
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(inputCls, p.className)} />;

export function Toggle({ checked, onChange, label, hint, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean;
}) {
  return (
    <label className={cx("flex items-start justify-between gap-4 py-2 cursor-pointer select-none", disabled && "opacity-50 pointer-events-none")}>
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-ink-soft">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-200", checked ? "bg-brand" : "bg-surface-3")}
      >
        <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" className="inline-flex w-full max-w-full gap-1 rounded-xl bg-surface-3/60 p-1 sm:w-auto">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "min-h-[30px] min-w-0 flex-1 rounded-lg px-2 py-1.5 text-center text-xs font-semibold leading-tight transition-[background-color,color,box-shadow] duration-150 min-[400px]:px-3 sm:flex-initial sm:whitespace-nowrap",
            value === o.value
              ? "bg-surface text-ink shadow-card"
              : "text-ink-soft hover:text-ink"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Badge = ({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "brand" }) => (
  <span
    className={cx(
      "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
      tone === "neutral" && "bg-surface-2 text-ink-soft",
      tone === "good" && "bg-status-success-bg text-status-success-text",
      tone === "warn" && "bg-status-warn-bg text-status-warn-text",
      tone === "bad" && "bg-status-danger-bg text-status-danger-text",
      tone === "brand" && "bg-brand-pale text-brand",
    )}
  >
    {children}
  </span>
);

export const PageTitle = ({ children, action, sub }: { children: ReactNode; action?: ReactNode; sub?: ReactNode }) => (
  <div className="mb-5 flex flex-wrap items-end justify-between gap-x-3 gap-y-3">
    <div className="min-w-0 flex-1 basis-40">
      <h1 className="text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl">{children}</h1>
      {sub && <p className="mt-0.5 text-sm text-ink-soft">{sub}</p>}
    </div>
    {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
  </div>
);

/** A filter pill. Filters are dark when on, so they never look like the green action buttons. */
export function Chip({ active, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cx(
        "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-[background-color,color,transform] duration-150 active:scale-95",
        active ? "bg-ink text-bg" : "bg-surface text-ink-soft ring-1 ring-line hover:text-ink",
        className,
      )}
      {...p}
    >
      {children}
    </button>
  );
}

/** Chips and quick actions: they wrap onto more lines, so nothing ever scrolls sideways. */
export const ChipRow = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cx("flex flex-wrap items-center gap-2", className)}>{children}</div>
);

export const Empty = ({ children }: { children: ReactNode }) => (
  <p className="rounded-2xl bg-surface-2/70 px-6 py-7 text-center text-sm text-ink-soft">{children}</p>
);

/**
 * Overlays render at the end of <body>. Inside the page they'd share its layer (the page-in
 * animation keeps a transform on <main>), so the bottom tab bar would draw over them.
 */
const toBody = (node: ReactNode) => createPortal(node, document.body);

export function Sheet({ open, onClose, title, children, fullScreen = false, closeOnBackdrop = true }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Covers the whole screen (no backdrop to tap by mistake), e.g. the live scorer. */
  fullScreen?: boolean;
  /** Tapping the dimmed area outside closes the sheet. */
  closeOnBackdrop?: boolean;
}) {
  useOverlayDismiss(open, onClose);
  if (!open) return null;
  if (fullScreen) {
    return toBody(
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-0 z-50 flex animate-sheet-up flex-col bg-bg pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur-md">
          <h2 className="text-lg font-bold tracking-tight text-ink">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-2 transition"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="mx-auto max-w-lg">{children}</div>
        </div>
      </div>,
    );
  }
  return toBody(
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-black/40 backdrop-blur-[3px] sm:items-center sm:p-6"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-lg animate-sheet-up overflow-y-auto overscroll-contain rounded-t-[28px] bg-surface px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-sheet sm:animate-pop-in sm:rounded-3xl"
      >
        <div className="sticky top-0 z-10 -mx-5 mb-3 bg-surface/95 px-5 pb-2 pt-2.5 backdrop-blur-md">
          {/* Mobile drag handle */}
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-surface-3 sm:hidden" />
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold tracking-tight text-ink">{title}</h2>
            <button
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-soft transition hover:bg-surface-3 hover:text-ink"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>,
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "brand";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useOverlayDismiss(open, onCancel);
  if (!open) return null;
  return toBody(
    <div
      className="fixed inset-0 z-[60] flex animate-fade-in items-center justify-center bg-black/45 p-4 backdrop-blur-[3px]"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm animate-pop-in space-y-4 rounded-3xl bg-surface p-5 shadow-sheet"
      >
        <div className="space-y-1.5">
          <h3 className="text-base font-bold text-ink">{title}</h3>
          {message && <p className="text-sm leading-relaxed text-ink-soft">{message}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            size="sm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
  );
}

export const today = () => new Date().toLocaleDateString("en-CA");
export const fmtDate = (d: string) =>
  new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
/** List headings: "Today", "Yesterday", else "Sat, 15 Nov". */
export const dayLabel = (d: string) => {
  const day = d.slice(0, 10);
  if (day === today()) return "Today";
  if (day === new Date(Date.now() - 864e5).toLocaleDateString("en-CA")) return "Yesterday";
  return new Date(day + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
};
export { cx };
