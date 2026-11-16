import { useEffect, useMemo, useState } from "react";
import { BellRing, Send, Share } from "lucide-react";
import { toast } from "sonner";
import {
  currentPushEnv, isIosDevice, pushSupport, readPushState, sendTestAlert, testAlertMessage, turnOffPush, turnOnPush,
  type PushState,
} from "../lib/push";
import { errorText } from "../lib/supabase";
import { Button, Toggle, cx } from "./ui";

/** "Phone alerts" switch for the Me page. Asks for notification permission only when tapped. */
export function PhoneAlertsRow({ personId, campId, muted, campActivityOn }: {
  personId: string;
  campId: string;
  /** This person turned camp activity off (Notifications page). */
  muted: boolean;
  /** The admin's camp-wide activity switch. */
  campActivityOn: boolean;
}) {
  const env = useMemo(currentPushEnv, []);
  const support = pushSupport(env);
  const ios = isIosDevice(env.userAgent, env.maxTouchPoints);
  const [state, setState] = useState<PushState | "checking">(support === "ok" ? "checking" : "off");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (support !== "ok") return;
    let live = true;
    readPushState(personId).then((s) => live && setState(s), () => live && setState("off"));
    return () => { live = false; };
  }, [support, personId]);

  if (support === "not-configured") return null;

  const change = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) {
        const next = await turnOnPush(personId, campId);
        setState(next);
        if (next === "on") toast.success("Phone alerts are on", { description: "This phone will buzz for your matches, announcements and the squad." });
        if (next === "blocked") toast.error("Notifications are blocked for this app", { description: "Allow them in your phone or browser settings, then try again." });
      } else {
        await turnOffPush();
        setState("off");
        toast.success("Phone alerts are off on this phone");
      }
    } catch (e) {
      toast.error("Couldn't turn on phone alerts", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  // One alert to this person's phones, through the same path real alerts take.
  const sendTest = async () => {
    setTesting(true);
    try {
      const m = testAlertMessage(await sendTestAlert());
      if (m.ok) toast.success(m.title, { description: m.hint });
      else toast.warning(m.title, { description: m.hint });
    } catch (e) {
      toast.error("Couldn't send a test alert", { description: errorText(e) });
    } finally {
      setTesting(false);
    }
  };

  // needs-install is explained separately, with the Share icon.
  let note: string | null = null;
  let warn = false;
  if (support === "unsupported") {
    note = ios ? "Update this iPhone to iOS 16.4 or later to get alerts." : "This browser can't show phone alerts. Try Chrome, Edge, Firefox or Safari.";
  } else if (state === "blocked") {
    note = "Notifications are blocked for this app. Allow them in your phone's settings, then turn this on again.";
    warn = true;
  } else if (state === "on" && !campActivityOn) {
    note = "The camp admin has turned activity off for everyone, so no alerts will arrive for now.";
    warn = true;
  } else if (state === "on" && muted) {
    note = "You've turned camp activity off, so no alerts will arrive. Turn it back on under Notifications.";
    warn = true;
  }

  return (
    <div className="flex items-start gap-3 px-4 py-1.5">
      <BellRing size={17} className="mt-3 shrink-0 text-brand" />
      <div className="min-w-0 flex-1">
        <Toggle
          label="Phone alerts"
          hint={state === "checking" ? "Checking this phone…" : state === "on" ? "On for this phone: your matches, disputes, announcements and the squad." : "Get a buzz on this phone for your matches, announcements and the squad."}
          checked={state === "on"}
          disabled={busy || state === "checking" || support !== "ok"}
          onChange={change}
        />
        {support === "needs-install" && (
          <p className="pb-2 text-[11px] text-ink-soft">
            On iPhone and iPad, add this app to your Home Screen first: in Safari tap{" "}
            <Share size={11} className="inline align-text-top" /> Share, then <b>Add to Home Screen</b>, and open it from
            there. Needs iOS 16.4 or later.
          </p>
        )}
        {note && <p className={cx("pb-2 text-[11px]", warn ? "text-status-warn-text" : "text-ink-soft")}>{note}</p>}
        {state === "on" && (
          <div className="pb-2.5">
            <Button size="sm" variant="secondary" onClick={sendTest} disabled={testing}>
              <Send size={14} className="text-brand" /> {testing ? "Sending…" : "Send a test alert"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
