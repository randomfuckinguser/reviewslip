"use client";

import { useEffect } from "react";
import { GraduationCap } from "lucide-react";

import { tourById } from "./tours";
import { useTour } from "./useTour";

/**
 * Take the Tour: runs this screen's tour when pressed, and only then (a tour
 * is always started by the person, never by the app).
 *
 * `fromLink` lets the Tutorials page start it: its Start opens the screen with
 * `?tour=<id>`, and the button on that screen starts its own tour once, then
 * takes the word out of the address so a reload doesn't start it again.
 */
export default function TourButton({ tour: id, fromLink = true }: { tour: string; fromLink?: boolean }) {
  const tour = tourById(id);
  const start = useTour(id, tour?.version ?? 0, tour?.steps ?? []);

  useEffect(() => {
    if (!fromLink || !tour) return;
    if (new URL(window.location.href).searchParams.get("tour") !== id) return;
    // A frame later, once the screen has drawn; and the address is tidied
    // only as it starts, since React may run this twice in a row.
    const frame = requestAnimationFrame(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete("tour");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      start();
    });
    return () => cancelAnimationFrame(frame);
  }, [fromLink, tour, id, start]);

  if (!tour) return null;
  return (
    <button
      type="button"
      className="btn btn-quiet"
      onClick={start}
      data-tip={`A ${tour.steps.length}-step tour of this screen`}
    >
      <GraduationCap size={15} aria-hidden="true" />
      Take the Tour
    </button>
  );
}
