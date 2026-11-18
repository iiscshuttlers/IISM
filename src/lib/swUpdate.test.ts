import { afterEach, describe, expect, it, vi } from "vitest";
import { applyUpdate, type SwContainer } from "./swUpdate";

/** A service worker that records messages and lets the test move it through its states. */
class FakeWorker extends EventTarget {
  state: ServiceWorkerState;
  messages: unknown[] = [];
  constructor(state: ServiceWorkerState) {
    super();
    this.state = state;
  }
  postMessage(m: unknown) {
    this.messages.push(m);
  }
  go(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}

function setup(reg: { waiting?: FakeWorker | null; installing?: FakeWorker | null } | undefined) {
  const events = new EventTarget();
  const container: SwContainer & { reg: typeof reg; changeController(): void } = {
    reg,
    getRegistration: async () => container.reg as never,
    addEventListener: (t, fn) => events.addEventListener(t, fn),
    removeEventListener: (t, fn) => events.removeEventListener(t, fn),
    changeController: () => events.dispatchEvent(new Event("controllerchange")),
  };
  const reload = vi.fn();
  return { container, reload };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => vi.useRealTimers());

describe("applyUpdate", () => {
  it("tells the waiting version to take over, and reloads once it's active", async () => {
    const waiting = new FakeWorker("installed");
    const { container, reload } = setup({ waiting });
    const done = applyUpdate({ container, reload });
    await tick();
    expect(waiting.messages).toEqual([{ type: "SKIP_WAITING" }]);
    expect(reload).not.toHaveBeenCalled();
    waiting.go("activating");
    waiting.go("activated");
    await done;
    expect(reload).toHaveBeenCalledOnce();
  });

  it("reloads as soon as the new version controls the page", async () => {
    const waiting = new FakeWorker("installed");
    const { container, reload } = setup({ waiting });
    const done = applyUpdate({ container, reload });
    await tick();
    container.changeController();
    await done;
    expect(reload).toHaveBeenCalledOnce();
  });

  it("just reloads when nothing is waiting (another tab already updated)", async () => {
    const { container, reload } = setup({ waiting: null, installing: null });
    await applyUpdate({ container, reload });
    expect(reload).toHaveBeenCalledOnce();
  });

  it("waits for a version that's still downloading, then switches to it", async () => {
    const installing = new FakeWorker("installing");
    const { container, reload } = setup({ installing });
    const done = applyUpdate({ container, reload });
    await tick();
    expect(installing.messages).toEqual([]);
    installing.go("installed");
    expect(installing.messages).toEqual([{ type: "SKIP_WAITING" }]);
    installing.go("activated");
    await done;
    expect(reload).toHaveBeenCalledOnce();
  });

  it("follows a newer version that replaces the one it picked", async () => {
    const older = new FakeWorker("installed");
    const newer = new FakeWorker("installed");
    const { container, reload } = setup({ waiting: older });
    const done = applyUpdate({ container, reload });
    await tick();
    container.reg = { waiting: newer };
    older.go("redundant");
    await tick();
    expect(newer.messages).toEqual([{ type: "SKIP_WAITING" }]);
    expect(reload).not.toHaveBeenCalled();
    newer.go("activated");
    await done;
    expect(reload).toHaveBeenCalledOnce();
  });

  it("reloads anyway if the new version doesn't take over in time", async () => {
    vi.useFakeTimers();
    const waiting = new FakeWorker("installed");
    const { container, reload } = setup({ waiting });
    const done = applyUpdate({ container, reload, timeoutMs: 8000 });
    await vi.advanceTimersByTimeAsync(7999);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(reload).toHaveBeenCalledOnce();
  });

  it("stops listening once it's done", async () => {
    const waiting = new FakeWorker("installed");
    const { container, reload } = setup({ waiting });
    const done = applyUpdate({ container, reload });
    await tick();
    waiting.go("activated");
    await done;
    container.changeController();
    waiting.go("redundant");
    await tick();
    expect(reload).toHaveBeenCalledOnce();
  });
});
