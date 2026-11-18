/** The parts of `navigator.serviceWorker` the update needs (a fake stands in for tests). */
export interface SwContainer {
  getRegistration(): Promise<Pick<ServiceWorkerRegistration, "waiting" | "installing"> | undefined>;
  addEventListener(type: "controllerchange", fn: () => void): void;
  removeEventListener(type: "controllerchange", fn: () => void): void;
}

export interface ApplyUpdateOptions {
  container?: SwContainer;
  reload?: () => void;
  /** How long to wait for the new version to take over before reloading anyway. */
  timeoutMs?: number;
}

/**
 * Switches the app to the new version behind "Refresh": tells the waiting service worker to take
 * over, then reloads once it has. Doesn't depend on the page already being controlled, follows a
 * newer version that replaces the one picked, and reloads anyway after a few seconds.
 */
export async function applyUpdate(
  {
    container = typeof navigator === "undefined" ? undefined : navigator.serviceWorker,
    reload = () => window.location.reload(),
    timeoutMs = 8000,
  }: ApplyUpdateOptions = {},
  attempt = 0,
): Promise<void> {
  const reg = await container?.getRegistration().catch(() => undefined);
  // A waiting version is quickest; otherwise a newer one may still be downloading.
  const sw = reg?.waiting ?? reg?.installing;
  if (!container || !sw) return reload(); // Already active (another tab updated): a reload picks it up.
  const outcome = await new Promise<"active" | "replaced" | "timeout">((resolve) => {
    const finish = (o: "active" | "replaced" | "timeout") => {
      clearTimeout(timer);
      sw.removeEventListener("statechange", onState);
      container.removeEventListener("controllerchange", onControl);
      resolve(o);
    };
    const onControl = () => finish("active");
    const onState = () => {
      if (sw.state === "installed") sw.postMessage({ type: "SKIP_WAITING" });
      else if (sw.state === "activated") finish("active");
      else if (sw.state === "redundant") finish("replaced");
    };
    const timer = setTimeout(() => finish("timeout"), timeoutMs);
    container.addEventListener("controllerchange", onControl);
    sw.addEventListener("statechange", onState);
    onState();
  });
  // An even newer version replaced the one picked: switch to that one instead.
  if (outcome === "replaced" && attempt < 2) return applyUpdate({ container, reload, timeoutMs }, attempt + 1);
  reload();
}
