import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Search, Trophy, Swords, Calendar, Dumbbell, BookOpen, Settings, ArrowRight, X } from "lucide-react";
import { Sheet } from "./ui";
import { DEFAULT_SKILLS } from "../lib/campExtended";
import type { Member } from "../lib/types";
import { fuzzyFilter } from "../lib/fuzzy";

export function QuickCommandPalette({
  open,
  onClose,
  members = [],
  onSelectPlayer,
}: {
  open: boolean;
  onClose: () => void;
  members: Member[];
  onSelectPlayer?: (personId: string) => void;
}) {
  const [, setLoc] = useLocation();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  // Global keyboard shortcut: Ctrl+K or Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) onClose();
        else {
          // Open handled by parent or custom event
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const navPages = [
    { title: "Today Hub", path: "/", icon: Calendar, category: "Pages" },
    { title: "Matches & Live Scorer", path: "/matches", icon: Swords, category: "Pages" },
    { title: "Camp Standings & Elo", path: "/standings", icon: Trophy, category: "Pages" },
    { title: "Training Log & Drills", path: "/training", icon: Dumbbell, category: "Pages" },
    { title: "Settings & Backups", path: "/settings", icon: Settings, category: "Pages" },
  ];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return {
        pages: navPages,
        players: members.slice(0, 6),
        skills: DEFAULT_SKILLS.slice(0, 4),
      };
    }

    return {
      pages: navPages.filter((p) => p.title.toLowerCase().includes(q)),
      players: fuzzyFilter(members, q, (m) => m.full_name).slice(0, 8),
      skills: DEFAULT_SKILLS.filter(
        (s) => s.title.toLowerCase().includes(q) || s.category.toLowerCase().includes(q)
      ).slice(0, 6),
    };
  }, [query, members]);

  const handleNavigate = (path: string) => {
    setLoc(path);
    onClose();
  };

  const handlePickPlayer = (personId: string) => {
    if (onSelectPlayer) {
      onSelectPlayer(personId);
    } else {
      setLoc(`/standings`);
    }
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Quick Command & Search">
      <div className="space-y-4">
        {/* Search Input */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players, pages, skills, or drills…"
            className="w-full pl-9 pr-8 py-2.5 text-sm rounded-xl border border-line bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-brand"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-ink-soft hover:text-ink"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Pages */}
          {filtered.pages.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft mb-1.5 px-1">
                Screens &amp; Hubs
              </p>
              <div className="space-y-1">
                {filtered.pages.map((p) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.path}
                      type="button"
                      onClick={() => handleNavigate(p.path)}
                      className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-surface-2 text-left text-xs font-semibold text-ink transition group"
                    >
                      <div className="flex items-center gap-2">
                        <Icon size={14} className="text-brand" />
                        <span>{p.title}</span>
                      </div>
                      <ArrowRight size={12} className="text-ink-soft opacity-0 group-hover:opacity-100 transition" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Players */}
          {filtered.players.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft mb-1.5 px-1">
                Squad Members
              </p>
              <div className="space-y-1">
                {filtered.players.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handlePickPlayer(m.id)}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-surface-2 text-left text-xs text-ink transition group"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold text-[10px]">
                        {m.full_name.charAt(0)}
                      </div>
                      <span className="font-semibold">{m.full_name}</span>
                      <span className="text-[10px] text-ink-soft capitalize">({m.role})</span>
                    </div>
                    <span className="text-[11px] text-brand font-medium">Profile →</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Skill Library */}
          {filtered.skills.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft mb-1.5 px-1">
                Skill &amp; Technique Notes
              </p>
              <div className="space-y-1">
                {filtered.skills.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleNavigate("/training")}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-surface-2 text-left text-xs text-ink transition group"
                  >
                    <div className="flex items-center gap-2">
                      <BookOpen size={13} className="text-brand shrink-0" />
                      <span className="font-semibold truncate">{s.title}</span>
                      <span className="text-[10px] text-ink-soft capitalize px-1.5 py-0.2 rounded bg-surface-2">
                        {s.category}
                      </span>
                    </div>
                    <ArrowRight size={12} className="text-ink-soft opacity-0 group-hover:opacity-100 transition" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
