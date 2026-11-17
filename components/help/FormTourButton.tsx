"use client";

import { GraduationCap } from "lucide-react";

import { tourById } from "./tours";
import { useTour } from "./useTour";

/**
 * The booking form's own Take the Tour. The form is a dialog over a screen,
 * which the dashboard's one tour cannot go to, so its steps run here, from
 * inside it, when pressed.
 */
export default function FormTourButton({ tour: id }: { tour: string }) {
  const tour = tourById(id);
  const start = useTour(id, tour?.version ?? 0, tour?.steps ?? []);

  if (!tour) return null;
  return (
    <button
      type="button"
      className="btn btn-quiet"
      onClick={start}
      data-tip={`A ${tour.steps.length}-step tour of this form`}
    >
      <GraduationCap size={15} aria-hidden="true" />
      Take the Tour
    </button>
  );
}
