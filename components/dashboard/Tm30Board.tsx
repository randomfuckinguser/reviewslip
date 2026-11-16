"use client";

import { useState } from "react";
import type { Tm30Pending } from "@/lib/customer";

export interface Tm30Result {
  error?: string;
}

/**
 * What still needs notifying, and the file to do it with.
 *
 * Three steps in the order they happen: download, upload at the portal, mark
 * done here. Marking is separate from downloading on purpose — somebody can
 * download a file and never upload it, and a system that ticked them off at
 * download would hide exactly the arrivals that were missed, which is the thing
 * the fine is for.
 *
 * Incomplete records are listed above the ready ones. A guest missing a
 * passport number cannot be notified at all, so they are the work; the ready
 * ones are already in the file.
 */
export default function Tm30Board({
  data,
  from,
  to,
  downloadUrl,
  markNotified,
}: {
  data: Tm30Pending;
  from: string;
  to: string;
  downloadUrl: string;
  markNotified: (ids: number[]) => Promise<Tm30Result>;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [downloaded, setDownloaded] = useState(false);

  const ready = data.pending.filter((g) => g.ready);
  const incomplete = data.pending.filter((g) => !g.ready);

  async function markAll() {
    if (busy || ready.length === 0) return;
    setBusy(true);
    setProblem("");
    const result = await markNotified(ready.map((g) => g.id));
    setBusy(false);
    if (result.error) setProblem(result.error);
  }

  return (
    <>
      {problem ? (
        <p className="cal-problem" role="alert">
          {problem}
        </p>
      ) : null}

      <div className="admin-tiles" data-tour="tm-tiles">
        <div className="admin-tile">
          <span className="admin-tile-label">Ready to notify</span>
          <span className="admin-tile-value">{ready.length}</span>
          <span className="admin-tile-note">
            arrivals {from} to {to}
          </span>
        </div>
        <div
          className={`admin-tile${incomplete.length ? " admin-tile-attention" : ""}`}
        >
          <span className="admin-tile-label">Missing details</span>
          <span className="admin-tile-value">{incomplete.length}</span>
          <span className="admin-tile-note">
            {incomplete.length ? "cannot be notified yet" : "nothing outstanding"}
          </span>
        </div>
      </div>

      {incomplete.length > 0 ? (
        <div className="admin-card" data-tour="tm-missing">
          <h2>Cannot Be Notified Yet</h2>
          <p className="admin-sub" style={{ marginBottom: "0.9rem" }}>
            These are missing something Immigration asks for. Open the booking on
            the calendar to fill it in.
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {incomplete.map((g) => (
              <li
                key={g.id}
                style={{
                  padding: "0.5rem 0",
                  borderBottom: "1px solid color-mix(in srgb, var(--wash) 12%, transparent)",
                  fontSize: "0.9rem",
                }}
              >
                {g.firstName} {g.familyName}
                <span
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    color: "var(--marigold)",
                  }}
                >
                  arriving {g.arrival}
                  {g.roomName ? ` · ${g.roomName}` : ""} · needs{" "}
                  {g.missing.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="admin-card" data-tour="tm-notify">
        <h2>Notify</h2>

        {ready.length === 0 ? (
          <p className="admin-sub" style={{ margin: 0 }}>
            Nobody waiting. Anyone arriving in this window has either been
            notified or is Thai.
          </p>
        ) : (
          <>
            <ol
              style={{
                margin: "0 0 1.1rem",
                paddingLeft: "1.2rem",
                fontSize: "0.9rem",
                lineHeight: 1.8,
                color: "var(--admin-muted)",
              }}
            >
              <li>Download the file — it holds {ready.length} guest
                {ready.length === 1 ? "" : "s"}.</li>
              <li>
                Upload it at{" "}
                <a
                  href="https://tm30.immigration.go.th"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--jade)" }}
                >
                  tm30.immigration.go.th
                </a>
                , signed in as the property.
              </li>
              <li>Come back and mark them done.</li>
            </ol>

            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              {/* A plain link, not a fetch. The file never enters the page —
                  the browser saves it straight from the response, so the only
                  copy of those passport numbers is the one on disk that
                  somebody asked for. */}
              <a
                className="btn btn-go"
                href={downloadUrl}
                onClick={() => setDownloaded(true)}
                data-tip="The first time, check the columns against the portal's own template: the field names come from the published form, but the order it expects is not documented."
              >
                Download the File
              </a>

              <button
                type="button"
                className="btn btn-quiet"
                disabled={busy}
                onClick={() => void markAll()}
              >
                {busy ? "Marking…" : `Mark ${ready.length} Notified`}
              </button>
            </div>

            {downloaded ? (
              <p
                style={{
                  margin: "0.9rem 0 0",
                  fontSize: "0.85rem",
                  color: "var(--marigold)",
                }}
              >
                Downloading is not notifying — upload it at the portal before
                marking these done.
              </p>
            ) : null}

          </>
        )}
      </div>
    </>
  );
}
