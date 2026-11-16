import { useEffect, useRef } from "react";
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
        "inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-brand active:scale-[0.98]",
        size === "sm" ? "px-3 py-1.5 text-xs min-h-[36px]" : "px-4 py-2.5 text-sm min-h-[44px]",
        variant === "primary" && "bg-brand text-white hover:bg-brand-dark shadow-sm hover:shadow",
        variant === "secondary" && "bg-surface-2 text-ink border border-line hover:bg-surface-3",
        variant === "ghost" && "text-ink-soft hover:text-ink hover:bg-surface-2",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-700 shadow-sm",
        className,
      )}
    />
  );
}

export const Card = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cx("rounded-2xl border border-line/80 bg-surface p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)]", className)}>{children}</div>
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
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold select-none tracking-tight shadow-xs",
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
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition-all";

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
    <div className="inline-flex w-full sm:w-auto rounded-xl border border-line bg-surface-2 p-1 gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            "flex-1 sm:flex-initial rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-[0.98] border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1",
            value === o.value
              ? "bg-brand-pale text-brand border-brand-border font-bold shadow-xs"
              : "border-transparent text-ink-soft hover:text-ink hover:bg-surface/60"
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
      "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide border",
      tone === "neutral" && "bg-surface-2 text-ink-soft border-line/70",
      tone === "good" && "bg-status-success-bg text-status-success-text border-status-success-border",
      tone === "warn" && "bg-status-warn-bg text-status-warn-text border-status-warn-border",
      tone === "bad" && "bg-status-danger-bg text-status-danger-text border-status-danger-border",
      tone === "brand" && "bg-brand-pale text-brand border-brand-border",
    )}
  >
    {children}
  </span>
);

export const PageTitle = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
  <div className="mb-4 flex items-center justify-between gap-3">
    <h1 className="text-xl font-bold text-ink">{children}</h1>
    {action}
  </div>
);

export const Empty = ({ children }: { children: ReactNode }) => (
  <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">{children}</p>
);

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
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-0 z-50 flex flex-col bg-surface pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
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
      </div>
    );
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl border-t sm:border border-line sm:rounded-2xl animate-in slide-in-from-bottom-3 duration-200"
      >
        {/* Mobile drag notch handle */}
        <div className="w-12 h-1 bg-surface-3 rounded-full mx-auto -mt-2 mb-3 sm:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-2 transition"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
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
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-150"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-surface border border-line p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="space-y-1.5">
          <h3 className="text-base font-bold text-ink">{title}</h3>
          {message && <p className="text-xs text-ink-soft leading-relaxed">{message}</p>}
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
    </div>
  );
}

export const today = () => new Date().toLocaleDateString("en-CA");
export const fmtDate = (d: string) =>
  new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
export { cx };
