"use client";

import { useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import BookingPanel, {
  type CreateResult,
  type EditResult,
} from "./BookingPanel";
import type {
  Booking,
  BookingList,
  BookingStatus,
  RatePlan,
  Room,
  RoomGroup,
} from "@/lib/customer";

/** The dot's colour for each booking state. */
const STATUS_TONE: Record<string, string> = {
  confirmed: "is-info",
  in_house: "is-ok",
  checked_out: "is-off",
  cancelled: "is-error",
  no_show: "is-warn",
};

const STATUSES: { id: BookingStatus; label: string }[] = [
  { id: "confirmed", label: "Confirmed" },
  { id: "in_house", label: "In House" },
  { id: "checked_out", label: "Checked Out" },
  { id: "cancelled", label: "Cancelled" },
  { id: "no_show", label: "No Show" },
];

const MODES: { id: string; label: string }[] = [
  { id: "stay", label: "staying" },
  { id: "arrival", label: "arriving" },
  { id: "departure", label: "leaving" },
];

/**
 * Bookings as a list, the way an issue tracker does it.
 *
 * The calendar answers "what does that week look like". This answers "where is
 * that booking" — the one under a name, the ones cancelled, the ones still
 * without a room. Neither is a worse version of the other.
 *
 * Every filter is a link, and every filter is in the URL. Nothing is held in
 * component state, so a filtered list can be reloaded, bookmarked and sent to
 * a colleague, the back button walks back through the questions somebody asked,
 * and there is no second copy of the filters here to fall out of step with the
 * server's. The chips are drawn from `data.filters` — what the server actually
 * applied — so a filter it discarded as unreadable cannot show as active.
 */
export default function BookingListView({
  data,
  groups,
  rooms,
  plans,
  slug,
  create,
  save,
  assign,
  setStatus,
}: {
  data: BookingList;
  groups: RoomGroup[];
  rooms: Room[];
  plans: RatePlan[];
  slug: string;
  create: (values: Record<string, unknown>) => Promise<CreateResult>;
  save: (id: number, patch: Record<string, unknown>) => Promise<EditResult>;
  assign: (id: number, roomId: number | null) => Promise<EditResult>;
  setStatus: (id: number, status: string) => Promise<EditResult>;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();

  const [open, setOpen] = useState<Booking | "new" | null>(null);
  const { filters } = data;

  /** This list with one thing changed, always back at page one. */
  function href(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    // A cursor belongs to the list it was issued for. Keeping it across a
    // filter change lands somebody in the middle of a list that no longer
    // exists, looking at a page that starts nowhere in particular.
    next.delete("cursor");
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  /** Toggling one status keeps the others, the way issue labels do. */
  function statusHref(id: BookingStatus) {
    const on = filters.statuses ?? [];
    const next = on.includes(id) ? on.filter((s) => s !== id) : [...on, id];
    return href({ status: next.length ? next.join(",") : null });
  }

  const roomsForType = filters.groupId
    ? rooms.filter((r) => r.groupId === filters.groupId)
    : rooms;

  function go(changes: Record<string, string | null>) {
    router.push(href(changes));
  }

  return (
    <>
      {/* The console's table container: the list's name and count with its
          actions, then the filters, then the rows, all in one card. */}
      <section className="container is-table" aria-labelledby="bl-h">
      <div className="container-head">
        <div>
          <h2 id="bl-h">
            Bookings{" "}
            <span className="count">({data.total.toLocaleString()})</span>
          </h2>
          <p className="container-desc">Every stay at the venue. A row opens its booking.</p>
        </div>
        <div className="container-actions">
          <Link className="icon-btn is-outlined" href={href({})} aria-label="Refresh" data-tip="Refresh">
            <RefreshCw size={16} aria-hidden="true" />
          </Link>
          <button type="button" className="btn btn-go" onClick={() => setOpen("new")} data-tour="bl-take">
            Take a Booking
          </button>
        </div>
      </div>
      <div className="bl-bar" data-tour="bl-filters">
        <div className="bl-statuses">
          {STATUSES.map((s) => {
            const on = filters.statuses?.includes(s.id) ?? false;
            return (
              <Link
                key={s.id}
                href={statusHref(s.id)}
                className="rt-chip"
                aria-pressed={on}
                aria-current={on ? "true" : undefined}
              >
                {s.label}
              </Link>
            );
          })}
          {filters.statuses ? (
            <Link href={href({ status: null })} className="bl-clear">
              Show Every Status
            </Link>
          ) : null}
        </div>

        <div className="bl-controls">
          <label className="bl-control">
            <span>Room Type</span>
            <select
              value={filters.groupId ? String(filters.groupId) : ""}
              onChange={(e) =>
                // The room belongs to the old type, so it goes with it.
                go({ type: e.target.value || null, room: null })
              }
            >
              <option value="">Any</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>

          <label className="bl-control">
            <span>Room</span>
            <select
              value={filters.roomId === null ? "" : String(filters.roomId)}
              onChange={(e) => go({ room: e.target.value || null })}
            >
              <option value="">Any</option>
              <option value="0">No Room Yet</option>
              {roomsForType.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>

          <label className="bl-control">
            <span>Dates</span>
            <select
              value={filters.on}
              onChange={(e) => go({ on: e.target.value })}
            >
              {MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="bl-control">
            <span>From</span>
            <input
              type="date"
              value={filters.from ?? ""}
              onChange={(e) => go({ from: e.target.value || null })}
            />
          </label>

          <label className="bl-control">
            <span>To</span>
            <input
              type="date"
              value={filters.to ?? ""}
              onChange={(e) => go({ to: e.target.value || null })}
            />
          </label>

          {/* A form rather than onChange: search fires on Enter, because a
              navigation per keystroke would be a page load per letter. */}
          <form
            className="bl-control bl-search"
            data-tour="bl-search"
            action={(fd) => go({ q: String(fd.get("q") ?? "") || null })}
          >
            <span>Search</span>
            <input
              name="q"
              type="search"
              defaultValue={filters.q}
              placeholder="Name or email"
            />
          </form>
        </div>
      </div>


      {data.bookings.length === 0 ? (
        // Named, not "nothing yet". A property with forty bookings being told
        // its list is empty reads as a broken product rather than a filter that
        // matched nothing, and sends people looking in the wrong place.
        <p className="admin-empty">
          No bookings {describe(filters, groups, rooms)}.{" "}
          <Link href={pathname} style={{ color: "var(--jade)" }}>
            Clear the filters
          </Link>{" "}
          to see everything.
        </p>
      ) : (
        <div className="admin-scroll" data-tour="bl-table">
          <table className="admin-table bl-table">
            <thead>
              <tr>
                {/* Status first, as a dot and its name: the standard's list. */}
                <th>Status</th>
                <th>Guest</th>
                <th>Stay</th>
                <th>Room</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.bookings.map((b) => (
                <tr key={b.id} className="bl-row" onClick={() => setOpen(b)}>
                  <td>
                    <span className={`status ${STATUS_TONE[b.status] ?? "is-off"}`}>
                      {STATUSES.find((s) => s.id === b.status)?.label ?? b.status}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="bl-who">
                      {b.guestName}
                    </button>
                    {b.guestEmail ? <span className="sub">{b.guestEmail}</span> : null}
                  </td>
                  <td>
                    {b.arrival} → {b.departure}
                    <span className="sub">
                      {b.nights} night{b.nights === 1 ? "" : "s"}
                      {b.adults ? ` · ${b.adults} adult${b.adults === 1 ? "" : "s"}` : ""}
                      {b.children ? ` · ${b.children} child${b.children === 1 ? "" : "ren"}` : ""}
                    </span>
                  </td>
                  <td>
                    {b.roomName ?? <span className="bl-noroom">No room yet</span>}
                    <span className="sub">{b.groupName}</span>
                  </td>
                  <td className="num">{b.total ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.nextCursor ? (
        <div className="bl-pager">
          <Link
            className="btn btn-quiet"
            href={(() => {
              const next = new URLSearchParams(params.toString());
              next.set("cursor", data.nextCursor);
              return `${pathname}?${next.toString()}`;
            })()}
          >
            Older
          </Link>
        </div>
      ) : null}
      </section>

      <BookingPanel
        booking={open}
        rooms={rooms}
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        plans={plans}
        slug={slug}
        onClose={() => setOpen(null)}
        onCreated={(made) => setOpen(made)}
        create={create}
        save={save}
        assign={assign}
        setStatus={setStatus}
      />
    </>
  );
}

/** The filters, in words, for the empty state. */
function describe(
  filters: BookingList["filters"],
  groups: RoomGroup[],
  rooms: Room[]
): string {
  const parts: string[] = [];

  if (filters.statuses?.length) {
    parts.push(
      filters.statuses
        .map((s) => STATUSES.find((x) => x.id === s)?.label.toLowerCase() ?? s)
        .join(" or ")
    );
  }
  if (filters.groupId) {
    const group = groups.find((g) => g.id === filters.groupId);
    if (group) parts.push(`in ${group.name}`);
  }
  if (filters.roomId === 0) parts.push("without a room");
  else if (filters.roomId) {
    const room = rooms.find((r) => r.id === filters.roomId);
    if (room) parts.push(`in ${room.name}`);
  }
  if (filters.from || filters.to) {
    const mode = MODES.find((m) => m.id === filters.on)?.label ?? "staying";
    if (filters.from && filters.to) parts.push(`${mode} between ${filters.from} and ${filters.to}`);
    else if (filters.from) parts.push(`${mode} on or after ${filters.from}`);
    else parts.push(`${mode} on or before ${filters.to}`);
  }
  if (filters.q) parts.push(`matching “${filters.q}”`);

  return parts.length ? parts.join(", ") : "here yet";
}
