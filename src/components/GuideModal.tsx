import { useState } from "react";
import { BookOpen, HelpCircle } from "lucide-react";
import { Button, Card, Sheet } from "./ui";

export function GuideButton({ variant = "ghost" }: { variant?: "ghost" | "secondary" | "primary" }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        size="sm"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5"
        aria-label="Camp rules & quick guide"
      >
        <HelpCircle size={16} />
        <span>Guide</span>
      </Button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Camp Rules & Courtside Guide">
        <div className="space-y-4 text-sm text-ink leading-relaxed">
          <Card className="bg-brand/5 border-brand/20">
            <div className="flex items-center gap-2 font-bold text-brand mb-1">
              <BookOpen size={16} />
              <span>IISc Badminton Training Camp</span>
            </div>
            <p className="text-xs text-ink-soft">
              Courtside reference for match recording, ratings, attendance, and player assessments.
            </p>
          </Card>

          <section className="space-y-2">
            <h3 className="font-bold text-base text-ink">1. Match Recording & Disputes</h3>
            <ul className="list-disc pl-5 space-y-1 text-xs text-ink-soft">
              <li><strong className="text-ink">Categories:</strong> MS, WS (2 players), MD, WD, XD (4 players). In XD, each side must have 1 male and 1 female.</li>
              <li><strong className="text-ink">Scores:</strong> Entering scores (e.g. 21-17, 19-21, 21-18) is optional. Marking the winner alone is accepted.</li>
              <li><strong className="text-ink">24-Hour Edit Window:</strong> The person who logged the match can edit it for up to 24 hours.</li>
              <li><strong className="text-ink">24-Hour Dispute Window:</strong> Any participant in the match can dispute the result within 24 hours. Disputed matches don't count towards ratings until a coach resolves or voids them.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="font-bold text-base text-ink">2. Camp rating</h3>
            <ul className="list-disc pl-5 space-y-1 text-xs text-ink-soft">
              <li>Everyone starts at <strong className="text-ink">1200</strong>. Each confirmed match moves it up or down (the Elo system): beating a stronger side gains more than beating a weaker one, and losing to a weaker side costs more.</li>
              <li>In doubles, each pair counts as the average of its two players.</li>
              <li>Standings also show separate <strong className="text-ink">Singles, Doubles and Mixed</strong> ratings, each moved only by that kind of match. Overall counts every match.</li>
              <li>The dot under a rating shows how <strong className="text-ink">settled</strong> it is: red means too few matches to trust it yet, green means it has settled. Coaches see a likely strength range under Insights → Compare.</li>
              <li>Rank is by rating, then wins. Form shows your last 5 results (<span className="text-emerald-600 font-bold">W</span> / <span className="text-red-500 font-bold">L</span>), newest first.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="font-bold text-base text-ink">3. Daily Effort (RPE Scale)</h3>
            <p className="text-xs text-ink-soft">
              Log your exertion at the end of each session on a 1–10 scale:
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded bg-surface-2 border border-line">
                <span className="font-bold text-emerald-600">1–3: Light</span>
                <p className="text-[11px] text-ink-soft">Warmup, easy footwork, normal breathing.</p>
              </div>
              <div className="p-2 rounded bg-surface-2 border border-line">
                <span className="font-bold text-blue-600">4–6: Moderate</span>
                <p className="text-[11px] text-ink-soft">Challenging rallies, heavy sweat, talking in short phrases.</p>
              </div>
              <div className="p-2 rounded bg-surface-2 border border-line">
                <span className="font-bold text-amber-600">7–8: Very Hard</span>
                <p className="text-[11px] text-ink-soft">Intense multi-shuttle, anaerobic fatigue, panting.</p>
              </div>
              <div className="p-2 rounded bg-surface-2 border border-line">
                <span className="font-bold text-red-600">9–10: Maximal</span>
                <p className="text-[11px] text-ink-soft">Exhaustion, match-point tournament pressure, near limit.</p>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="font-bold text-base text-ink">4. Players &amp; assessments</h3>
            <ul className="list-disc pl-5 space-y-1 text-xs text-ink-soft">
              <li>Coaches and the admin see every player on the <strong>Players</strong> tab: rating, wins, attendance, drill minutes, effort and coach score. Tap a name for the full record.</li>
              <li>Tap <strong>Assess</strong> to score technique, fitness, tactics and attitude on a 1–5 scale.</li>
              <li>Players never see coach scores.</li>
            </ul>
          </section>

          <Button className="w-full mt-4" variant="secondary" onClick={() => setOpen(false)}>
            Close Guide
          </Button>
        </div>
      </Sheet>
    </>
  );
}
