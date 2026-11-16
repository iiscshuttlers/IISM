import { useState, useRef, useEffect } from "react";
import { Pen, Eraser } from "lucide-react";
import { Button, Sheet } from "./ui";

interface Token {
  id: string;
  label: string;
  x: number; // percentage 0 - 100
  y: number; // percentage 0 - 100
  color: string;
}

const DEFAULT_TOKENS: Token[] = [
  { id: "A1", label: "A1", x: 50, y: 68, color: "#0f766e" },
  { id: "A2", label: "A2", x: 50, y: 85, color: "#0f766e" },
  { id: "B1", label: "B1", x: 35, y: 25, color: "#3b82f6" },
  { id: "B2", label: "B2", x: 65, y: 25, color: "#3b82f6" },
  { id: "SHUTTLE", label: "🏸", x: 50, y: 48, color: "#eab308" },
];

export function TacticalBoardModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [tokens, setTokens] = useState<Token[]>(DEFAULT_TOKENS);
  const [draggedToken, setDraggedToken] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState<"move" | "pen">("move");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const courtRef = useRef<HTMLDivElement | null>(null);

  // Clear Canvas
  const clearDrawings = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // Resize canvas to match court element
  useEffect(() => {
    if (!open) return;
    const updateCanvasSize = () => {
      const canvas = canvasRef.current;
      const court = courtRef.current;
      if (canvas && court) {
        canvas.width = court.clientWidth;
        canvas.height = court.clientHeight;
      }
    };
    const timer = setTimeout(updateCanvasSize, 100);
    window.addEventListener("resize", updateCanvasSize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateCanvasSize);
    };
  }, [open]);

  // Canvas Drawing
  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (drawMode !== "pen") return;
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    ctx.strokeStyle = "#eab308";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || drawMode !== "pen") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  // Drag tokens
  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!draggedToken || drawMode === "pen") return;
    const court = courtRef.current;
    if (!court) return;
    const rect = court.getBoundingClientRect();

    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const x = Math.min(95, Math.max(5, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.min(95, Math.max(5, ((clientY - rect.top) / rect.height) * 100));

    setTokens((prev) =>
      prev.map((t) => (t.id === draggedToken ? { ...t, x, y } : t))
    );
  };

  // Tactics Presets
  const applyPreset = (preset: "attack" | "defence" | "singles") => {
    clearDrawings();
    if (preset === "attack") {
      // Front & Back Attack for Team A, Side-by-Side Defence for Team B
      setTokens([
        { id: "A1", label: "A1", x: 50, y: 65, color: "#0f766e" }, // Front net
        { id: "A2", label: "A2", x: 50, y: 88, color: "#0f766e" }, // Rear smash
        { id: "B1", label: "B1", x: 30, y: 25, color: "#3b82f6" }, // Left defence
        { id: "B2", label: "B2", x: 70, y: 25, color: "#3b82f6" }, // Right defence
        { id: "SHUTTLE", label: "🏸", x: 50, y: 82, color: "#eab308" },
      ]);
    } else if (preset === "defence") {
      // Side-by-side Defence for Team A
      setTokens([
        { id: "A1", label: "A1", x: 30, y: 75, color: "#0f766e" },
        { id: "A2", label: "A2", x: 70, y: 75, color: "#0f766e" },
        { id: "B1", label: "B1", x: 50, y: 35, color: "#3b82f6" },
        { id: "B2", label: "B2", x: 50, y: 12, color: "#3b82f6" },
        { id: "SHUTTLE", label: "🏸", x: 50, y: 18, color: "#eab308" },
      ]);
    } else {
      // Singles Base
      setTokens([
        { id: "A1", label: "A", x: 50, y: 72, color: "#0f766e" },
        { id: "A2", label: "—", x: -20, y: -20, color: "#0f766e" },
        { id: "B1", label: "B", x: 50, y: 28, color: "#3b82f6" },
        { id: "B2", label: "—", x: -20, y: -20, color: "#3b82f6" },
        { id: "SHUTTLE", label: "🏸", x: 45, y: 55, color: "#eab308" },
      ]);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Tactical Whiteboard">
      <div className="space-y-3">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant={drawMode === "move" ? "primary" : "secondary"}
              onClick={() => setDrawMode("move")}
            >
              Move Players
            </Button>
            <Button
              size="sm"
              variant={drawMode === "pen" ? "primary" : "secondary"}
              onClick={() => setDrawMode("pen")}
            >
              <Pen size={13} className="mr-1" />
              Draw Arrows
            </Button>
          </div>

          <Button size="sm" variant="ghost" onClick={clearDrawings} title="Clear drawings">
            <Eraser size={14} className="mr-1" />
            Clear
          </Button>
        </div>

        {/* Formation Presets */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-ink-soft uppercase font-bold text-[10px] mr-1">Formations:</span>
          <button
            type="button"
            onClick={() => applyPreset("attack")}
            className="px-2 py-0.5 rounded bg-surface-2 hover:bg-surface-3 font-semibold text-ink border border-line"
          >
            Doubles Attack
          </button>
          <button
            type="button"
            onClick={() => applyPreset("defence")}
            className="px-2 py-0.5 rounded bg-surface-2 hover:bg-surface-3 font-semibold text-ink border border-line"
          >
            Doubles Defence
          </button>
          <button
            type="button"
            onClick={() => applyPreset("singles")}
            className="px-2 py-0.5 rounded bg-surface-2 hover:bg-surface-3 font-semibold text-ink border border-line"
          >
            Singles Base
          </button>
          <button
            type="button"
            onClick={() => setTokens(DEFAULT_TOKENS)}
            className="px-1.5 py-0.5 text-ink-soft hover:text-ink text-[11px]"
          >
            Reset
          </button>
        </div>

        {/* Interactive Badminton Court Container */}
        <div
          ref={courtRef}
          onMouseMove={handleTouchMove}
          onTouchMove={handleTouchMove}
          onMouseUp={() => setDraggedToken(null)}
          onTouchEnd={() => setDraggedToken(null)}
          className="relative w-full aspect-[9/16] max-h-[580px] bg-emerald-800 rounded-xl overflow-hidden shadow-inner border-4 border-emerald-900 select-none cursor-crosshair touch-none"
        >
          {/* Drawing Canvas Overlay */}
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={(e) => {
              draw(e);
              handleTouchMove(e);
            }}
            onMouseUp={() => {
              stopDrawing();
              setDraggedToken(null);
            }}
            onTouchStart={startDrawing}
            onTouchMove={(e) => {
              draw(e);
              handleTouchMove(e);
            }}
            onTouchEnd={() => {
              stopDrawing();
              setDraggedToken(null);
            }}
            className="absolute inset-0 z-20 pointer-events-auto"
          />

          {/* Badminton Court Markings (White Lines) */}
          <div className="absolute inset-2 border-2 border-white/90">
            {/* Singles Sidelines (Inner) */}
            <div className="absolute inset-y-0 left-[8%] right-[8%] border-x-2 border-white/80" />

            {/* Back Doubles Long Service Lines */}
            <div className="absolute top-[8%] inset-x-0 border-b-2 border-white/80" />
            <div className="absolute bottom-[8%] inset-x-0 border-t-2 border-white/80" />

            {/* Short Service Lines (Front) */}
            <div className="absolute top-[38%] inset-x-0 border-b-2 border-white/90" />
            <div className="absolute bottom-[38%] inset-x-0 border-t-2 border-white/90" />

            {/* Center Service Line (Top Court) */}
            <div className="absolute top-0 bottom-[62%] left-1/2 -translate-x-1/2 border-l-2 border-white/80" />

            {/* Center Service Line (Bottom Court) */}
            <div className="absolute bottom-0 top-[62%] left-1/2 -translate-x-1/2 border-l-2 border-white/80" />

            {/* NET (Center of Court) */}
            <div className="absolute top-1/2 -translate-y-1/2 inset-x-0 border-t-2 border-dashed border-yellow-300 z-10 flex items-center justify-between px-2">
              <span className="text-[9px] font-black uppercase text-yellow-300 bg-emerald-950/80 px-1 rounded">
                NET
              </span>
              <span className="text-[9px] font-black uppercase text-yellow-300 bg-emerald-950/80 px-1 rounded">
                NET
              </span>
            </div>
          </div>

          {/* Draggable Player Tokens */}
          {tokens.map((t) => {
            if (t.x < 0) return null;
            return (
              <div
                key={t.id}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDraggedToken(t.id);
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  setDraggedToken(t.id);
                }}
                style={{
                  left: `${t.x}%`,
                  top: `${t.y}%`,
                  backgroundColor: t.color,
                }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 z-30 w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center font-extrabold text-xs text-white cursor-grab active:cursor-grabbing active:scale-125 transition-transform ${
                  draggedToken === t.id ? "scale-125 ring-2 ring-yellow-400" : ""
                }`}
              >
                {t.label}
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-ink-soft text-center">
          Tap <strong>Move Players</strong> to reposition tokens, or <strong>Draw Arrows</strong> to sketch tactics & rally rotations.
        </p>
      </div>
    </Sheet>
  );
}
