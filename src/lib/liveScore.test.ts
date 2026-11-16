import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLiveScore, loadLiveScore, saveLiveScore, type LiveScoreState } from "./liveScore";

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

const state: LiveScoreState = {
  step: "scoring",
  category: "MS",
  targetPoints: 21,
  isCustomPoints: false,
  enableDeuce: true,
  matchFormat: "best_of_3",
  slots: ["a", null, "b", null],
  playedOn: "2026-11-16",
  currentGame: 2,
  scoreA: 7,
  scoreB: 9,
  gamesHistory: ["21-18"],
  winsA: 1,
  winsB: 0,
  scoreLog: [{ a: 7, b: 8 }],
  endsSwapped: true,
  servingSide: "B",
};

describe("live scorer persistence", () => {
  beforeEach(() => vi.stubGlobal("localStorage", new MemoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it("restores a match in progress exactly as it was", () => {
    saveLiveScore(state, 1_000);
    expect(loadLiveScore(2_000)).toEqual(state);
  });

  it("drops a match older than 12 hours", () => {
    saveLiveScore(state, 0);
    expect(loadLiveScore(12 * 60 * 60 * 1000 + 1)).toBeNull();
    expect(loadLiveScore(0)).toBeNull(); // and removes it
  });

  it("clears on demand", () => {
    saveLiveScore(state, 0);
    clearLiveScore();
    expect(loadLiveScore(0)).toBeNull();
  });

  it("ignores corrupt or unrelated data", () => {
    localStorage.setItem("live-scorer.v1", "{not json");
    expect(loadLiveScore()).toBeNull();
    localStorage.setItem("live-scorer.v1", JSON.stringify({ step: "setup", savedAt: Date.now() }));
    expect(loadLiveScore()).toBeNull();
  });

  it("works when storage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => saveLiveScore(state)).not.toThrow();
    expect(loadLiveScore()).toBeNull();
    expect(() => clearLiveScore()).not.toThrow();
  });
});
