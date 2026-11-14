import { useState, useEffect, useRef } from "react";
import { Play, Pause, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { Button, Card, Sheet } from "./ui";

function playBeep(freq = 880, duration = 0.15) {
  try {
    const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // AudioContext blocked or not allowed yet
  }
}

export function DrillTimerModal({
  open,
  onClose,
  initialWorkSec = 30,
  initialRestSec = 15,
  initialSets = 4,
}: {
  open: boolean;
  onClose: () => void;
  initialWorkSec?: number;
  initialRestSec?: number;
  initialSets?: number;
}) {
  const [workSec, setWorkSec] = useState(initialWorkSec);
  const [restSec, setRestSec] = useState(initialRestSec);
  const [totalSets, setTotalSets] = useState(initialSets);

  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<"work" | "rest" | "finished">("work");
  const [currentSet, setCurrentSet] = useState(1);
  const [timeLeft, setTimeLeft] = useState(initialWorkSec);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Phase transition
          if (phase === "work") {
            if (currentSet >= totalSets) {
              if (soundEnabled) playBeep(523, 0.4); // High finish chime
              setActive(false);
              setPhase("finished");
              return 0;
            } else {
              if (soundEnabled) playBeep(440, 0.2); // Rest beep
              setPhase("rest");
              return restSec;
            }
          } else {
            // Rest to Work
            if (soundEnabled) playBeep(880, 0.25); // Work beep
            setPhase("work");
            setCurrentSet((s) => s + 1);
            return workSec;
          }
        }

        // Countdown beep on last 3 seconds
        if (prev <= 4 && prev > 1 && soundEnabled) {
          playBeep(600, 0.08);
        }

        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [active, phase, currentSet, totalSets, workSec, restSec, soundEnabled]);

  const resetTimer = () => {
    setActive(false);
    setPhase("work");
    setCurrentSet(1);
    setTimeLeft(workSec);
  };

  const handleStart = () => {
    if (phase === "finished") {
      resetTimer();
    }
    setActive(true);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Courtside Interval Timer">
      <div className="space-y-4">
        {/* Timer Hero Display */}
        <div
          className={`rounded-2xl p-6 text-center text-white transition-colors shadow-lg ${
            phase === "work"
              ? "bg-emerald-600"
              : phase === "rest"
              ? "bg-amber-500"
              : "bg-brand"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-white/80 mb-2">
            <span>
              {phase === "finished"
                ? "Routine Done"
                : `Set ${currentSet} of ${totalSets}`}
            </span>
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-1 rounded bg-black/10 hover:bg-black/20"
              aria-label="Toggle beep sound"
            >
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
          </div>

          <div className="text-7xl font-black font-mono tabular-nums tracking-tight my-2">
            {phase === "finished" ? "DONE" : `${timeLeft}s`}
          </div>

          <p className="text-sm font-extrabold uppercase tracking-widest text-white/90">
            {phase === "work"
              ? "⚡ WORK"
              : phase === "rest"
              ? "⏸ REST"
              : "Great Effort!"}
          </p>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            size="md"
            variant={active ? "secondary" : "primary"}
            onClick={() => (active ? setActive(false) : handleStart())}
            className="flex items-center justify-center gap-2 font-bold !py-3"
          >
            {active ? <Pause size={18} /> : <Play size={18} />}
            <span>{active ? "Pause" : "Start"}</span>
          </Button>

          <Button
            size="md"
            variant="ghost"
            onClick={resetTimer}
            className="flex items-center justify-center gap-2 !py-3"
          >
            <RotateCcw size={18} />
            <span>Reset</span>
          </Button>
        </div>

        {/* Presets & Settings */}
        <Card className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Interval Configuration</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <label className="text-[11px] text-ink-soft block mb-1">Work (sec)</label>
              <input
                type="number"
                disabled={active}
                value={workSec}
                onChange={(e) => {
                  const val = Math.max(5, Number(e.target.value));
                  setWorkSec(val);
                  if (!active && phase === "work") setTimeLeft(val);
                }}
                className="w-full text-center font-bold text-sm bg-surface-2 border border-line rounded-lg p-2"
              />
            </div>

            <div>
              <label className="text-[11px] text-ink-soft block mb-1">Rest (sec)</label>
              <input
                type="number"
                disabled={active}
                value={restSec}
                onChange={(e) => setRestSec(Math.max(5, Number(e.target.value)))}
                className="w-full text-center font-bold text-sm bg-surface-2 border border-line rounded-lg p-2"
              />
            </div>

            <div>
              <label className="text-[11px] text-ink-soft block mb-1">Sets</label>
              <input
                type="number"
                disabled={active}
                value={totalSets}
                onChange={(e) => setTotalSets(Math.max(1, Number(e.target.value)))}
                className="w-full text-center font-bold text-sm bg-surface-2 border border-line rounded-lg p-2"
              />
            </div>
          </div>

          {/* Quick routine presets */}
          <div className="pt-2 border-t border-line flex flex-wrap gap-1.5">
            <span className="text-[10px] text-ink-soft uppercase font-bold self-center mr-1">Presets:</span>
            <button
              type="button"
              disabled={active}
              onClick={() => {
                setWorkSec(30);
                setRestSec(15);
                setTotalSets(4);
                setTimeLeft(30);
                setPhase("work");
              }}
              className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-2 hover:bg-surface-3 border border-line"
            >
              Footwork (30s/15s × 4)
            </button>
            <button
              type="button"
              disabled={active}
              onClick={() => {
                setWorkSec(45);
                setRestSec(30);
                setTotalSets(6);
                setTimeLeft(45);
                setPhase("work");
              }}
              className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-2 hover:bg-surface-3 border border-line"
            >
              Multi-Shuttle (45s/30s × 6)
            </button>
            <button
              type="button"
              disabled={active}
              onClick={() => {
                setWorkSec(20);
                setRestSec(10);
                setTotalSets(8);
                setTimeLeft(20);
                setPhase("work");
              }}
              className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-2 hover:bg-surface-3 border border-line"
            >
              Tabata Sprints (20s/10s × 8)
            </button>
          </div>
        </Card>
      </div>
    </Sheet>
  );
}
