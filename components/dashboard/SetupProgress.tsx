import Link from "next/link";
import type { SetupProgress as Progress } from "@/lib/customer";

/**
 * What is left before this venue's review page works.
 *
 * On the hub, above everything, and gone entirely once it is finished — a
 * checklist that stays on screen saying "all done" is a permanent congratulation
 * nobody reads, and it costs the top of the page every day thereafter.
 *
 * It exists because the failure it describes is invisible from every direction.
 * A venue with no listing link draws no Proceed button on the guest page, so no
 * review is ever recorded as taken, so the review list here is permanently
 * empty — and an owner reading "nothing yet" concludes the product is broken
 * rather than unfinished. Three screens, one missing field, and not one of them
 * said so.
 */
export default function SetupProgress({
  setup,
  settings,
}: {
  setup: Progress;
  /** This venue's settings page, where every one of these is fixed. */
  settings: string;
}) {
  /*
   * Their side is done and the writing key is ours to fit. Said plainly, with
   * nothing to click: the alternative is the panel vanishing on `complete` while
   * the guest page still refuses, which is the same invisible failure this
   * component exists to prevent — only now with the venue certain they had
   * finished.
   */
  if (setup.waitingOnUs) {
    return (
      <div className="setup">
        <div className="setup-head">
          <h2>Nearly there</h2>
        </div>
        <p className="setup-note">
          Everything on your side is done. We are fitting the last piece and your review page
          will start working shortly — there is nothing else for you to do.
        </p>
      </div>
    );
  }

  if (setup.complete) return null;

  const blocked = !setup.canTakeReviews;

  return (
    <div className={blocked ? "setup setup-blocked" : "setup"}>
      <div className="setup-head">
        <h2>{blocked ? "Your review page is not working yet" : "Finish setting up"}</h2>
        <span className="setup-count">
          {setup.done} of {setup.total}
        </span>
      </div>

      {/* The bar is the only thing here somebody reads at a glance, and it is
          worth nothing on its own — so it is labelled, not decorative. */}
      <div
        className="setup-bar"
        role="progressbar"
        aria-valuenow={setup.done}
        aria-valuemin={0}
        aria-valuemax={setup.total}
        aria-label="Setup progress"
      >
        <span style={{ width: `${(setup.done / setup.total) * 100}%` }} />
      </div>

      <ul className="setup-steps">
        {setup.steps.map((step) => (
          <li key={step.id} className={step.done ? "done" : step.blocks ? "blocking" : ""}>
            <span className="setup-tick" aria-hidden="true">
              {step.done ? "✓" : step.blocks ? "!" : "○"}
            </span>
            <span>
              <strong>{step.label}</strong>
              <span className="setup-note">{step.note}</span>
            </span>
          </li>
        ))}
      </ul>

      <Link className="btn btn-go" href={settings}>
        {blocked ? "Fix This Now" : "Finish Setup"}
      </Link>
    </div>
  );
}
