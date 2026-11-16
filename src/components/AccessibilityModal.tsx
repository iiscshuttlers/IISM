import { useState, useEffect } from "react";
import { Eye, Sun, Sparkles, SlidersHorizontal, Vibrate } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, Sheet, Segmented, Toggle } from "./ui";
import { getA11yPrefs, saveA11yPrefs, type AccessibilityPrefs } from "../lib/campExtended";
import { hapticsEnabled, setHapticsEnabled } from "../lib/haptics";

export function AccessibilityModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [prefs, setPrefs] = useState<AccessibilityPrefs>(getA11yPrefs);
  const [haptics, setHaptics] = useState(hapticsEnabled);

  useEffect(() => {
    if (open) {
      setPrefs(getA11yPrefs());
    }
  }, [open]);

  const update = (patch: Partial<AccessibilityPrefs>) => {
    const next = saveA11yPrefs(patch);
    setPrefs(next);
    toast.success("Accessibility updated", { duration: 1500 });
  };

  return (
    <Sheet open={open} onClose={onClose} title="Accessibility & Display">
      <div className="space-y-4">
        <p className="text-xs text-ink-soft">
          Customize your text size, visual contrast, and motion for your device and courtside conditions.
        </p>

        {/* Text size selector */}
        <Card className="space-y-2">
          <div className="flex items-center gap-2">
            <Eye size={16} className="text-brand" />
            <h4 className="text-xs font-bold text-ink">Text Size</h4>
          </div>
          <p className="text-[11px] text-ink-soft">
            Enlarge typography for easier readability from the sidelines.
          </p>
          <Segmented<AccessibilityPrefs["textSize"]>
            value={prefs.textSize}
            onChange={(val) => update({ textSize: val })}
            options={[
              { value: "normal", label: "Standard (100%)" },
              { value: "large", label: "Large (112%)" },
              { value: "xlarge", label: "Extra (125%)" },
            ]}
          />
        </Card>

        {/* High contrast outdoor mode */}
        <Card className="space-y-2">
          <div className="flex items-center gap-2">
            <Sun size={16} className="text-amber-500" />
            <h4 className="text-xs font-bold text-ink">High Contrast / Outdoor Mode</h4>
          </div>
          <p className="text-[11px] text-ink-soft">
            Sharp black borders and maximum ink contrast designed for sunlight and glare.
          </p>
          <Toggle
            label="Enable high-contrast mode"
            checked={prefs.highContrast}
            onChange={(val) => update({ highContrast: val })}
          />
        </Card>

        {/* Reduced motion */}
        <Card className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-brand" />
            <h4 className="text-xs font-bold text-ink">Reduced Motion</h4>
          </div>
          <p className="text-[11px] text-ink-soft">
            Disables non-essential animations, slide-overs, and transitions.
          </p>
          <Toggle
            label="Minimize animations"
            checked={prefs.reducedMotion}
            onChange={(val) => update({ reducedMotion: val })}
          />
        </Card>

        {/* Haptics (this phone only) */}
        <Card className="space-y-2">
          <div className="flex items-center gap-2">
            <Vibrate size={16} className="text-brand" />
            <h4 className="text-xs font-bold text-ink">Vibration</h4>
          </div>
          <p className="text-[11px] text-ink-soft">
            A light tick when you tap, and a short buzz when something saves or fails. iPhones need iOS 18 or later.
          </p>
          <Toggle
            label="Vibrate on taps and results"
            checked={haptics}
            onChange={(val) => {
              setHapticsEnabled(val);
              setHaptics(val);
            }}
          />
        </Card>

        {/* Live Preview Box */}
        <div className="p-3 rounded-xl border border-line bg-surface-2 text-center space-y-1">
          <p className="text-xs font-bold text-ink">Live Preview</p>
          <p className="text-sm text-ink-soft">
            The quick brown fox jumps over the net. (21–19, 21–17)
          </p>
        </div>

        <div className="pt-2 flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Sheet>
  );
}

export function AccessibilityButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Accessibility & display preferences"
        title="Accessibility (Text size, contrast, motion)"
        className="p-1.5 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <SlidersHorizontal size={18} />
      </button>
      <AccessibilityModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
