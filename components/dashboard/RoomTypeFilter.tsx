"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import type { RoomGroup } from "@/lib/customer";

/**
 * Narrow a month to one room type.
 *
 * Links rather than buttons, carrying `?type=` in the URL, so the filtered view
 * survives a reload, goes in a bookmark, and can be sent to somebody else. A
 * front desk asking "what is happening in the lofts in December" wants to hand
 * that question to a colleague, not describe how to reproduce it.
 *
 * Every other search parameter is preserved — the month being looked at, most
 * of all. A filter that silently sends you back to today is a filter people
 * stop using.
 */
export default function RoomTypeFilter({
  groups,
  label = "Room type",
}: {
  groups: RoomGroup[];
  label?: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  // Nothing to narrow. One type is the same view either way, and a filter with
  // a single option is a control that only takes up room.
  if (groups.length < 2) return null;

  const active = params.get("type") ?? "";

  function href(type: string) {
    const next = new URLSearchParams(params.toString());
    if (type) next.set("type", type);
    else next.delete("type");
    // Paging is per-view; a cursor from the unfiltered list means nothing once
    // the filter changes, and keeping it would show a page from the middle of
    // a list nobody is looking at any more.
    next.delete("cursor");
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  return (
    <nav className="rt-filter" aria-label={label} data-tour="cal-types">
      <Link
        href={href("")}
        className="rt-chip"
        aria-current={active === "" ? "true" : undefined}
      >
        All Types
      </Link>
      {groups.map((g) => (
        <Link
          key={g.id}
          href={href(String(g.id))}
          className="rt-chip"
          aria-current={active === String(g.id) ? "true" : undefined}
        >
          {g.name}
          <span className="rt-count">{g.rooms}</span>
        </Link>
      ))}
    </nav>
  );
}
