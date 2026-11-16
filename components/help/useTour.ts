"use client";

import { useCallback } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

import type { TourStepDef } from "./tours";

/**
 * The one way to run a tour (app standards, help-and-onboarding §4): driver.js
 * inside this hook, so no screen calls driver.js itself.
 *
 * - Steps light up `[data-tour="<id>"]`, never a class.
 * - A step whose mark isn't on the screen is skipped (`skipMissingElement`,
 *   and left out of the count before it starts).
 * - The screen is inert while it runs; Esc or × closes it; the last step
 *   ends with Done; focus goes back to whatever started it.
 * - No animation for someone who has asked for reduced motion.
 * - Inside an open booking form (a modal dialog) driver.js puts its card in a
 *   layer of its own on top of the dialog, but still hangs the dimming on
 *   <body>, under the dialog. `dimInLayer` moves the dimming into that layer,
 *   just under the card, so the form's tour dims the form too.
 *
 * Not yet recorded: the standard keeps done / dismissed in
 * `core.guidance_state` in the tenant database, never in the browser, and
 * the review app has no such table yet. Until it does, a tour is never
 * remembered, which is safe: tours only ever start when someone asks.
 */
function dimInLayer(card: Element) {
  const layer = card.parentElement;
  if (!layer?.classList.contains("driver-layer")) return;
  const dim = document.querySelector(".driver-overlay");
  if (dim && dim.parentElement !== layer) layer.insertBefore(dim, card);
}

export function useTour(id: string, version: number, steps: TourStepDef[]) {
  return useCallback(() => {
    const present = steps.filter((s) => document.querySelector(`[data-tour="${s.id}"]`));
    if (!present.length) return;

    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const tour = driver({
      steps: present.map((s) => ({
        element: `[data-tour="${s.id}"]`,
        popover: { title: s.title, description: s.body, side: "bottom", align: "start" },
      })),
      showProgress: present.length > 1,
      progressText: "{{current}} of {{total}}",
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Done",
      allowClose: true,
      allowKeyboardControl: true,
      disableActiveInteraction: true,
      skipMissingElement: true,
      animate: !still,
      smoothScroll: !still,
      overlayOpacity: 0.55,
      stagePadding: 6,
      stageRadius: 8,
      popoverClass: "rs-tour",
      onPopoverRender: (popover) => {
        popover.wrapper.setAttribute("data-tour-id", `${id}@${version}`);
        // After this frame: the dimming is drawn once the card is.
        requestAnimationFrame(() => dimInLayer(popover.wrapper));
      },
      onHighlighted: () => {
        const card = document.querySelector(".driver-popover");
        if (card) dimInLayer(card);
      },
      onDestroyed: () => {
        trigger?.focus();
      },
    });
    tour.drive();
  }, [id, version, steps]);
}
