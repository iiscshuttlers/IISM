import { useEffect, type RefObject } from "react";
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { Toaster } from "sonner";

/** Keeps toasts just below the phone top bar, even when the offline/sync bar makes it taller. */
export function useToastsBelow(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => root.style.setProperty("--header-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--header-h");
    };
  }, [ref]);
}

const icon = { size: 18, strokeWidth: 2.25, "aria-hidden": true } as const;

/**
 * App-wide toasts: calm cards that follow the app's colours (and dark mode), with a tinted icon
 * per type. They sit just below the phone top bar so they never cover it. Look: index.css "Toasts".
 */
export function AppToaster() {
  return (
    <Toaster
      position="top-center"
      theme="system"
      closeButton
      gap={10}
      visibleToasts={3}
      style={{ "--width": "380px" } as React.CSSProperties}
      offset={{ top: "var(--toast-top)" }}
      mobileOffset={{ top: "var(--toast-top)" }}
      icons={{
        success: <CircleCheck {...icon} />,
        error: <CircleAlert {...icon} />,
        warning: <TriangleAlert {...icon} />,
        info: <Info {...icon} />,
        loading: <LoaderCircle {...icon} className="animate-spin" />,
      }}
      toastOptions={{ duration: 5000, closeButtonAriaLabel: "Dismiss" }}
    />
  );
}
