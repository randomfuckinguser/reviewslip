"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

import { GRAND, GRAND_SCREENS } from "./tours";

/** The screen an address is on, under the venue's dashboard; null if elsewhere. */
function screenOf(pathname: string, base: string): string | null {
  const path = pathname.replace(/\/$/, "");
  const root = base.replace(/\/$/, "");
  if (path === root) return "";
  return path.startsWith(`${root}/`) ? path.slice(root.length) : null;
}

/**
 * The dashboard's one tour, across every screen (tours.ts, `GRAND`).
 *
 * Mounted once in the shell and driven by the address: `?tour=all` runs it on
 * whatever screen is showing, from that screen's first step (`&at=end`: its
 * last, when coming Back from the screen after). The last step on a screen
 * says where it goes next and goes there; the first step's Back goes to the
 * screen before. That is the whole of the hand-over between screens, so a
 * reload mid-tour picks up on the same screen.
 *
 * Closing it (×, Esc, or Done at the very end) takes `tour` out of the
 * address, so nothing restarts it.
 */
export default function GrandTour({ base }: { base: string }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const on = params.get("tour") === "all";
  const fromEnd = params.get("at") === "end";

  useEffect(() => {
    if (!on) return;
    const screen = screenOf(pathname, base);
    if (screen === null) return;

    const index = GRAND_SCREENS.indexOf(screen);
    // A screen the tour does not visit: it starts from the top instead.
    if (index < 0) {
      router.replace(`${base}?tour=all`);
      return;
    }
    const last = index === GRAND_SCREENS.length - 1;
    const sectionOf = (i: number) => GRAND.find((s) => s.screen === GRAND_SCREENS[i])?.section ?? "";

    const goTo = (i: number, back = false) =>
      router.push(`${base}${GRAND_SCREENS[i]}?tour=all${back ? "&at=end" : ""}`);
    const end = () => {
      const query = new URLSearchParams(window.location.search);
      query.delete("tour");
      query.delete("at");
      const rest = query.toString();
      router.replace(`${pathname}${rest ? `?${rest}` : ""}`, { scroll: false });
    };

    let tour: ReturnType<typeof driver> | null = null;
    let cancelled = false;
    let timer = 0;
    const began = Date.now();

    const start = () => {
      if (cancelled) return;
      const present = GRAND.filter(
        (s) => s.screen === screen && document.querySelector(`[data-tour="${s.id}"]`)
      );
      // The screen may still be drawing: give its marks a moment to appear.
      if (!present.length && Date.now() - began < 2500) {
        timer = window.setTimeout(start, 120);
        return;
      }
      // Nothing to show here (a screen with nothing set up yet): carry on.
      if (!present.length) {
        if (last) end();
        else goTo(index + 1);
        return;
      }

      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const steps: DriveStep[] = present.map((s, i) => {
        const first = i === 0;
        const final = i === present.length - 1;
        return {
          element: `[data-tour="${s.id}"]`,
          popover: {
            title: s.title,
            description: s.body,
            side: "bottom",
            align: "start",
            progressText: `${s.section} · ${index + 1} of ${GRAND_SCREENS.length}`,
            ...(final
              ? {
                  doneBtnText: last ? "Done" : `Next: ${sectionOf(index + 1)}`,
                  onNextClick: () => {
                    tour?.destroy();
                    if (last) end();
                    else goTo(index + 1);
                  },
                }
              : {}),
            ...(first && index > 0
              ? {
                  // driver.js greys Back out on a first step; this one has a
                  // screen before it to go back to.
                  disableButtons: [],
                  onPrevClick: () => {
                    tour?.destroy();
                    goTo(index - 1, true);
                  },
                }
              : {}),
          },
        };
      });

      tour = driver({
        steps,
        showProgress: true,
        showButtons: ["next", "previous", "close"],
        nextBtnText: "Next",
        prevBtnText: "Back",
        allowClose: true,
        allowKeyboardControl: true,
        disableActiveInteraction: true,
        animate: !still,
        smoothScroll: !still,
        overlayOpacity: 0.55,
        stagePadding: 6,
        stageRadius: 8,
        popoverClass: "rs-tour",
        // Closed by the person (×, Esc, a click outside). driver.js leaves the
        // closing to this hook, and calls no other on the way: its destroyed
        // hook does not fire for a close. Moving screen and finishing go
        // through destroy() directly, which skips this.
        onDestroyStarted: () => {
          tour?.destroy();
          if (!cancelled) end();
        },
      });
      tour.drive(fromEnd ? steps.length - 1 : 0);
    };

    // A moment later, so the screen has drawn before anything is measured. A
    // timer, not an animation frame: a tab opened in the background gets no
    // frames until it is looked at, and the tour should be waiting when it is.
    timer = window.setTimeout(start, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (tour?.isActive()) tour.destroy();
    };
  }, [on, fromEnd, pathname, base, router]);

  return null;
}
