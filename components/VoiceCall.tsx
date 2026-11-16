"use client";

import { useEffect } from "react";

import { VOICE_URL } from "@/lib/site";

import styles from "./VoiceCall.module.css";

/**
 * A call button through Reviewslip's own softphone: an in-browser call to a
 * venue's desk, or to Reviewslip's Sales or Support, and a voice message when
 * nobody is free. Whoever answers does so on the phone beside the dashboard
 * (/phone/), signed in as they are on the dashboard.
 *
 * The widget (the review app's public/voice-call.js) binds every
 * [data-rs-call] element by one click listener on the document and shows a
 * button only once its line answers the status check — so the phone link,
 * when there is one, stays beside it as the fallback, and CSS hides the link
 * the moment the button appears. Each button names its own line, and the
 * widget notices buttons added later, so one script serves every page this
 * site navigates to without reloading.
 */

declare global {
  interface Window {
    ReviewslipVoice?: { refresh: () => void };
  }
}

const SCRIPT_ID = "rs-voice-call";

function useWidget() {
  useEffect(() => {
    if (document.getElementById(SCRIPT_ID)) {
      window.ReviewslipVoice?.refresh();
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `${VOICE_URL}/voice-call.js`;
    script.defer = true;
    script.dataset.voiceApi = VOICE_URL;
    document.body.appendChild(script);
  }, []);
}

export default function VoiceCall({
  line,
  team,
  label,
  leaveLabel,
  fallbackHref,
  fallbackLabel,
  phone,
  className,
  caller,
  icon,
}: {
  /** A venue's address, or "reviewslip" for Sales and Support. */
  line: string;
  team: "sales" | "support";
  /** The button while someone can answer: "Call Reservations". */
  label: string;
  /** The button when only a message can be left. */
  leaveLabel?: string;
  /** A tel: link shown until (and unless) the call button appears. */
  fallbackHref?: string | null;
  fallbackLabel?: string;
  /** The number as written, offered in the panel if the browser cannot call. */
  phone?: string | null;
  className?: string;
  /** Who is calling, shown to the person who answers. */
  caller?: string;
  icon?: React.ReactNode;
}) {
  useWidget();

  return (
    <span className={styles.pair}>
      <button
        type="button"
        className={`${className ?? ""} ${styles.call}`}
        data-rs-call
        data-voice-line={line}
        data-voice-team={team}
        data-voice-leave={leaveLabel}
        data-voice-caller={caller}
        data-voice-phone={phone || undefined}
        hidden
      >
        {icon} <span data-voice-label>{label}</span>
      </button>
      {fallbackHref ? (
        <a className={`${className ?? ""} ${styles.fallback}`} href={fallbackHref}>
          {icon} {fallbackLabel ?? label}
        </a>
      ) : null}
    </span>
  );
}
