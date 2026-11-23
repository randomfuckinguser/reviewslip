"use client";

import { useState, useTransition } from "react";

export interface ResultRoom {
  roomId: number;
  room: string;
  type: string | null;
  areas: { areaId: number; area: string; takenAt: string }[];
  /** Lines ticked by a photo: the towels, the bath plug. */
  lines?: { itemId: number; label: string; area: string | null; takenAt: string }[];
}

export interface Results {
  date: string;
  /** The venue's own, for the time each was taken. */
  timezone?: string;
  keepDays: number;
  rooms: ResultRoom[];
}

/**
 * The housekeepers' photographs: each area of each room as it was left.
 *
 * The point of the photographs is that the owner can see the result without
 * walking the corridor, so they are here, beside the board's PIN, rather than
 * on a page of their own. Thumbnails a room to a row; a tap opens one full
 * size. Earlier days are a date away, as far back as they are kept.
 */
export default function CleaningResults({
  slug,
  initial,
  load,
}: {
  slug: string;
  initial: Results;
  load: (date: string) => Promise<Results | null>;
}) {
  const [data, setData] = useState(initial);
  const [open, setOpen] = useState<{ src: string; caption: string } | null>(null);
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState("");

  const today = initial.date;
  const timezone = initial.timezone ?? "Asia/Bangkok";
  const earliest = shift(today, -(initial.keepDays - 1));

  function pick(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    setProblem("");
    start(async () => {
      const next = await load(date).catch(() => null);
      if (next) setData(next);
      else setProblem("Those photos could not be loaded.");
    });
  }

  const src = (roomId: number, areaId: number) =>
    `/api/checklist-photo/${encodeURIComponent(slug)}/result/${roomId}/${areaId}?date=${data.date}`;
  const lineSrc = (roomId: number, itemId: number) =>
    `/api/checklist-photo/${encodeURIComponent(slug)}/result-line/${roomId}/${itemId}?date=${data.date}`;

  return (
    <section className="admin-card" data-tour="rooms-results">
      <div style={headRow}>
        <h2 className="card-title" style={heading}>{data.date === today ? "Today’s Photos" : "Photos"}</h2>
        <input
          type="date"
          value={data.date}
          min={earliest}
          max={today}
          onChange={(e) => pick(e.target.value)}
          aria-label="Which day"
          style={dateInput}
        />
      </div>
      <p style={lede}>
        Each area of each room as the housekeeper left it, and the lines ticked
        with a photo. Kept for{" "}
        {initial.keepDays} days.
      </p>

      {problem && (
        <p role="status" style={{ margin: "0 0 0.6rem", fontSize: "var(--fs14)", color: "var(--warning)" }}>
          {problem}
        </p>
      )}

      {data.rooms.length === 0 ? (
        <p style={empty}>
          {pending
            ? "Loading…"
            : `No photos ${data.date === today ? "yet today" : "that day"}. Housekeepers take one of each area when it is done, on the Housekeeping Board.`}
        </p>
      ) : (
        <ul style={{ ...list, opacity: pending ? 0.6 : 1 }}>
          {data.rooms.map((room) => (
            <li key={room.roomId} style={roomRow}>
              <div style={{ minWidth: "4.5rem" }}>
                <strong style={{ fontWeight: 600 }}>{room.room}</strong>
                {room.type && <span style={sub}>{room.type}</span>}
              </div>
              <div style={thumbs}>
                {room.areas.map((a) => (
                  <button
                    key={a.areaId}
                    type="button"
                    style={thumb}
                    onClick={() =>
                      setOpen({
                        src: src(room.roomId, a.areaId),
                        caption: `${room.room} · ${a.area} · ${time(a.takenAt, timezone)}`,
                      })
                    }
                    aria-label={`${a.area} in ${room.room}, taken ${time(a.takenAt, timezone)}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src(room.roomId, a.areaId)} alt="" style={thumbImg} loading="lazy" />
                    <span style={thumbLabel}>
                      {a.area} · {time(a.takenAt, timezone)}
                    </span>
                  </button>
                ))}
                {(room.lines ?? []).map((l) => (
                  <button
                    key={`i${l.itemId}`}
                    type="button"
                    style={thumb}
                    onClick={() =>
                      setOpen({
                        src: lineSrc(room.roomId, l.itemId),
                        caption: `${room.room} · ${l.label} · ${time(l.takenAt, timezone)}`,
                      })
                    }
                    aria-label={`${l.label} in ${room.room}, taken ${time(l.takenAt, timezone)}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={lineSrc(room.roomId, l.itemId)} alt="" style={thumbImg} loading="lazy" />
                    <span style={thumbLabel}>
                      {l.label} · {time(l.takenAt, timezone)}
                    </span>
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div
          role="dialog"
          aria-label={open.caption}
          style={viewer}
          onClick={() => setOpen(null)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(null)}
          tabIndex={-1}
        >
          <figure style={{ margin: 0, maxWidth: "min(92vw, 70rem)", textAlign: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={open.src} alt={open.caption} style={{ maxWidth: "100%", maxHeight: "82vh", borderRadius: "var(--radius)" }} />
            <figcaption style={{ color: "#fff", marginTop: "0.6rem", fontSize: "var(--fs14)" }}>
              {open.caption}
            </figcaption>
          </figure>
        </div>
      )}
    </section>
  );
}

/** The time a photo was taken, in the venue's own clock. */
function time(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function shift(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}


const headRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "0.75rem",
  flexWrap: "wrap",
};

const heading: React.CSSProperties = { fontSize: "var(--fs16)", fontWeight: 600, margin: 0 };

const lede: React.CSSProperties = {
  margin: "0.35rem 0 1rem",
  fontSize: "var(--fs14)",
  lineHeight: 1.6,
  color: "var(--ink-soft)",
};

const dateInput: React.CSSProperties = {
  font: "inherit",
  fontSize: "var(--fs14)",
  padding: "0.3rem 0.5rem",
  borderRadius: "var(--radius)",
  border: "1px solid color-mix(in srgb, var(--ink) 20%, transparent)",
  background: "var(--paper)",
  color: "var(--ink)",
  colorScheme: "light dark",
};

const empty: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--fs14)",
  color: "var(--ink-soft)",
};

const list: React.CSSProperties = { listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.5rem" };

const roomRow: React.CSSProperties = {
  display: "flex",
  gap: "0.9rem",
  alignItems: "start",
  padding: "0.6rem 0",
  borderTop: "1px solid color-mix(in srgb, var(--ink) 10%, transparent)",
};

const sub: React.CSSProperties = {
  display: "block",
  fontSize: "var(--fs12)",
  color: "var(--ink-soft)",
};

const thumbs: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
  minWidth: 0,
};

const thumb: React.CSSProperties = {
  display: "grid",
  gap: "0.25rem",
  padding: 0,
  border: 0,
  background: "none",
  color: "inherit",
  cursor: "zoom-in",
  textAlign: "left",
  font: "inherit",
};

const thumbImg: React.CSSProperties = {
  width: "6.5rem",
  height: "4.9rem",
  objectFit: "cover",
  borderRadius: "var(--radius)",
  background: "color-mix(in srgb, var(--ink) 6%, transparent)",
};

const thumbLabel: React.CSSProperties = {
  fontSize: "var(--fs12)",
  color: "var(--ink-soft)",
};

const viewer: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  background: "rgba(0, 0, 0, 0.85)",
  display: "grid",
  placeItems: "center",
  padding: "1rem",
  cursor: "zoom-out",
};
