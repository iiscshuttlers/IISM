import { useState } from "react";
import { Calendar, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button, Sheet } from "./ui";
import { generateCampIcs, generateGoogleCalendarUrl, downloadIcsFile } from "../lib/calendarExport";
import type { Session, Match, Member } from "../lib/types";

export function CampCalendarExportModal({
  open,
  onClose,
  campName,
  sessions,
  matches = [],
  members = [],
}: {
  open: boolean;
  onClose: () => void;
  campName: string;
  sessions: Session[];
  matches?: Match[];
  members?: Member[];
}) {
  const [downloading, setDownloading] = useState(false);

  const handleDownloadFullIcs = () => {
    setDownloading(true);
    try {
      const ics = generateCampIcs({
        campName,
        sessions,
        matches,
        members,
      });
      const safeCamp = campName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      downloadIcsFile(`${safeCamp}-calendar.ics`, ics);
      toast.success("Camp calendar (.ics) downloaded! Open to add to Apple/Outlook/Google Calendar.");
      onClose();
    } catch {
      toast.error("Failed to export calendar.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add Camp to Your Calendar">
      <div className="space-y-4">
        <p className="text-xs text-ink-soft">
          Sync training camp sessions and match schedules directly to your personal phone or desktop calendar (Apple Calendar, Google Calendar, Outlook).
        </p>

        <div className="p-4 rounded-xl bg-surface-2 border border-line space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand/10 text-brand flex items-center justify-center shrink-0">
              <Calendar size={20} />
            </div>
            <div>
              <h4 className="font-bold text-sm text-ink">{campName}</h4>
              <p className="text-xs text-ink-soft">
                {sessions.length} training sessions · {matches.length} matches
              </p>
            </div>
          </div>

          <Button onClick={handleDownloadFullIcs} disabled={downloading} className="w-full">
            <Download size={14} className="mr-1.5" />
            <span>{downloading ? "Exporting…" : "Download Full Calendar (.ics)"}</span>
          </Button>
        </div>

        {sessions.length > 0 && (
          <div className="space-y-2 pt-2">
            <h4 className="text-xs font-bold text-ink-soft uppercase tracking-wider">
              Add Individual Session to Google Calendar
            </h4>

            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-surface border border-line text-xs"
                >
                  <div>
                    <p className="font-semibold text-ink">{s.title}</p>
                    <p className="text-[11px] text-ink-soft">
                      {s.session_date} {s.duration_min ? `(${s.duration_min}m)` : ""}
                    </p>
                  </div>

                  <a
                    href={generateGoogleCalendarUrl(s, campName)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline px-2 py-1 rounded bg-brand/5 border border-brand/20"
                  >
                    <span>Google Cal</span>
                    <ExternalLink size={11} />
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

export function CalendarExportButton({
  onClick,
  className = "",
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick} className={className}>
      <Calendar size={14} className="mr-1.5 text-brand" />
      <span>Add to Calendar</span>
    </Button>
  );
}
