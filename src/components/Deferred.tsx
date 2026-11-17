import { Suspense, lazy, useState, type ComponentType, type LazyExoticComponent, type ReactNode } from "react";

/**
 * `React.lazy` for a named export, so a sheet that opens on tap stays out of the first download.
 * The service worker precaches every chunk, so it still opens offline once the app is installed.
 */
export function lazyNamed<M extends Record<K, ComponentType<any>>, K extends keyof M>(
  load: () => Promise<M>,
  name: K,
): LazyExoticComponent<M[K]> {
  return lazy(() => load().then((m) => ({ default: m[name] })));
}

/**
 * Mounts its children the first time `when` is true, then keeps them mounted, so a lazily loaded
 * sheet keeps its state between openings just as it did when it was always mounted.
 */
export function MountOnFirstOpen({ when, children }: { when: boolean; children: ReactNode }) {
  const [opened, setOpened] = useState(when);
  if (when && !opened) setOpened(true);
  if (!opened) return null;
  return <Suspense fallback={when ? <OpeningSheet /> : null}>{children}</Suspense>;
}

/** Shown only if a sheet's code takes a moment to arrive; fades in late so fast loads show nothing. */
function OpeningSheet() {
  return (
    <div
      role="status"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 animate-fade-in [animation-delay:200ms]"
    >
      <span className="rounded-full bg-surface px-4 py-2 text-sm font-semibold text-ink-soft shadow-lg">Opening…</span>
    </div>
  );
}
