"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import type { Room, RoomGroup } from "@/lib/customer";

export interface RoomsState {
  error?: string;
  ok?: boolean;
  values?: Record<string, string>;
}

const EMPTY: RoomsState = {};

const field: React.CSSProperties = {
  padding: "0.6rem 0.8rem",
  borderRadius: 10,
  border: "1px solid var(--jade-line)",
  background: "var(--shade-soft)",
  color: "var(--cream)",
  fontFamily: "inherit",
  fontSize: "0.95rem",
};

function Problem({ error }: { error?: string }) {
  return (
    <p
      role="status"
      style={{
        margin: error ? "0.6rem 0 0" : 0,
        fontSize: "0.9rem",
        color: "var(--marigold)",
      }}
    >
      {error ?? ""}
    </p>
  );
}

/**
 * Room types and their rooms.
 *
 * Two forms rather than one wizard, because they are two different jobs done at
 * different times: the types are decided once when a property is set up, and
 * rooms get added to them for years afterwards.
 *
 * A room type with no rooms is shown as a problem rather than hidden. It is a
 * thing you can sell and cannot deliver, and the moment to say so is here,
 * before somebody books into it.
 */
export default function RoomsSetup({
  groups,
  rooms,
  addGroup,
  addRoom,
  remove,
  states = [],
  setStatus,
}: {
  groups: RoomGroup[];
  rooms: Room[];
  /** Selling, not selling, renovating: what each room can be set to. */
  states?: { id: string; label: string; note: string }[];
  setStatus?: (id: number, status: string) => Promise<{ ok: boolean; error?: string }>;
  addGroup: (state: RoomsState, formData: FormData) => Promise<RoomsState>;
  addRoom: (state: RoomsState, formData: FormData) => Promise<RoomsState>;
  /** Takes `kind` ("group" | "room") and `id` from the form. */
  remove: (formData: FormData) => Promise<void>;
}) {
  const [groupState, groupAction, groupPending] = useActionState(addGroup, EMPTY);
  const [roomState, roomAction, roomPending] = useActionState(addRoom, EMPTY);

  const [statusPending, startStatus] = useTransition();
  const [statusProblem, setStatusProblem] = useState("");

  function changeStatus(id: number, status: string) {
    if (!setStatus) return;
    setStatusProblem("");
    startStatus(async () => {
      const result = await setStatus(id, status).catch(
        (): { ok: boolean; error?: string } => ({ ok: false })
      );
      if (!result.ok) setStatusProblem(result.error ?? "That could not be changed.");
    });
  }

  const groupName = useRef<HTMLInputElement>(null);
  const roomName = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (groupState.error && groupState.values?.name && groupName.current) {
      groupName.current.value = groupState.values.name;
    }
  }, [groupState]);

  useEffect(() => {
    if (roomState.error && roomState.values?.name && roomName.current) {
      roomName.current.value = roomState.values.name;
    }
  }, [roomState]);

  return (
    <>
      {/* ------------------------------------------------------ room types */}

      <div className="admin-card" data-tour="rooms-types">
        <h2>Room Types</h2>
        <p className="admin-sub" style={{ marginBottom: "1rem" }}>
          What a guest books — a Deluxe Double, a Family Suite. Which room they
          get is decided later, on the calendar.
        </p>

        {groups.length === 0 ? (
          <p className="admin-empty" style={{ padding: "1.25rem", marginBottom: "1rem" }}>
            None yet. Add the first one below.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: "0 0 1.25rem", padding: 0 }}>
            {groups.map((g) => (
              <li key={g.id} className="referral-row">
                <span>
                  <strong style={{ color: "var(--cream)" }}>{g.name}</strong>
                  <span
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      color: "var(--admin-muted)",
                    }}
                  >
                    sleeps {g.capacity} ·{" "}
                    {g.rooms === 0 ? (
                      <span style={{ color: "var(--marigold)" }}>no rooms yet</span>
                    ) : (
                      `${g.rooms} room${g.rooms === 1 ? "" : "s"}`
                    )}
                  </span>
                </span>
                <span />
                <form action={remove}>
                  <input type="hidden" name="kind" value="group" />
                  <input type="hidden" name="id" value={g.id} />
                  <button type="submit" className="btn btn-quiet">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form
          action={groupAction}
          style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "start" }}
        >
          <input
            ref={groupName}
            name="name"
            required
            maxLength={60}
            disabled={groupPending}
            placeholder="Deluxe Double"
            aria-label="Room type name"
            style={{ ...field, flex: "1 1 14rem" }}
          />
          <input
            name="capacity"
            type="number"
            min={1}
            max={20}
            defaultValue={2}
            disabled={groupPending}
            aria-label="How many guests it sleeps"
            style={{ ...field, width: "6rem" }}
          />
          <button type="submit" className="btn btn-quiet" disabled={groupPending}>
            {groupPending ? "Adding…" : "Add Type"}
          </button>
        </form>
        <Problem error={groupState.error} />
      </div>

      {/* ---------------------------------------------------------- rooms */}

      <div className="admin-card" data-tour="rooms-list">
        <h2>Rooms</h2>
        <p className="admin-sub" style={{ marginBottom: "1rem" }}>
          The actual rooms. These are the lines down the side of the calendar.
          {states.map((s) => (
            <span key={s.id} style={{ display: "block", marginTop: "0.25rem" }}>
              <strong style={{ fontWeight: 600 }}>{s.label}</strong> &mdash; {s.note}
            </span>
          ))}
        </p>

        {rooms.length === 0 ? (
          <p className="admin-empty" style={{ padding: "1.25rem", marginBottom: "1rem" }}>
            None yet.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: "0 0 1.25rem", padding: 0 }}>
            {rooms.map((r) => (
              <li key={r.id} className="referral-row">
                <span>
                  <strong style={{ color: "var(--cream)" }}>{r.name}</strong>
                  <span
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      color: "var(--admin-muted)",
                    }}
                  >
                    {r.groupName ?? "—"}
                  </span>
                </span>
                {setStatus && states.length > 0 ? (
                  <select
                    value={r.status === "out_of_service" ? "renovating" : r.status}
                    onChange={(e) => changeStatus(r.id, e.target.value)}
                    disabled={statusPending}
                    aria-label={`State of ${r.name}`}
                    style={{ ...field, padding: "0.35rem 0.5rem", fontSize: "0.85rem", appearance: "auto", justifySelf: "end" }}
                  >
                    {states.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span />
                )}
                <form action={remove}>
                  <input type="hidden" name="kind" value="room" />
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="btn btn-quiet">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <Problem error={statusProblem || undefined} />

        {groups.length === 0 ? (
          <p style={{ color: "var(--admin-muted)", fontSize: "0.9rem", margin: 0 }}>
            Add a room type first — every room belongs to one.
          </p>
        ) : (
          <>
            <form
              action={roomAction}
              style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}
            >
              <input
                ref={roomName}
                name="name"
                required
                maxLength={60}
                disabled={roomPending}
                placeholder="201"
                aria-label="Room name or number"
                style={{ ...field, flex: "1 1 10rem" }}
              />
              <select
                name="groupId"
                disabled={roomPending}
                aria-label="Room type"
                style={{ ...field, flex: "1 1 12rem", appearance: "auto" }}
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-quiet" disabled={roomPending}>
                {roomPending ? "Adding…" : "Add Room"}
              </button>
            </form>
            <Problem error={roomState.error} />
          </>
        )}
      </div>
    </>
  );
}
