"use client";

import { usePathname, useRouter } from "next/navigation";

/**
 * Take the Tour, in a screen's header: starts the dashboard's one tour at this
 * screen. It goes on through the screens after it, in the sidebar's order;
 * the sidebar's own Take the Tour starts it from the top.
 *
 * It only puts `tour=all` in the address. GrandTour, in the shell, sees that
 * and runs it, which is what lets the tour carry on after moving screen.
 */
export default function TourButton() {
  const router = useRouter();
  const pathname = usePathname();

  function start() {
    // Read at the press rather than through useSearchParams, so a header that
    // is otherwise drawn on the server needs no Suspense boundary for this.
    const query = new URLSearchParams(window.location.search);
    query.set("tour", "all");
    query.delete("at");
    router.replace(`${pathname}?${query}`, { scroll: false });
  }

  return (
    <button
      type="button"
      className="btn btn-quiet"
      onClick={start}
      data-tip="A guided tour of the dashboard, starting on this screen"
    >
      Take the Tour
    </button>
  );
}
