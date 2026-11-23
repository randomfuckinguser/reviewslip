"use client";

import { useState } from "react";
import { weeksOf } from "@/lib/nights";
import type { RateCalendar, RateNight, RoomGroup } from "@/lib/customer";

export interface RateResult {
  error?: string;
}

/**
 * What a restriction is being asked for.
 *
 * Three states, not two, and this is a real bug fixed rather than a nicety. A
 * checkbox has an "off" that means both "leave whatever is there" and "take it
 * off", so once a night was marked not-selling there was no way back — and
 * because a closed cell is drawn before its price, a night you had just priced
 * still showed a dash. A form editing a *range* cannot show the current state
 * of those nights either, since they may each differ, so every control states
 * its intention instead.
 */
type Wish = "keep" | "on" | "off";

const field: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.7rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--jade-line)",
  background: "var(--shade-soft)",
  color: "var(--cream)",
  fontFamily: "inherit",
  fontSize: "var(--fs14)",
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: "var(--fs12)",
  marginBottom: "0.25rem",
  color: "var(--admin-muted)",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** What a night's cell says, in one place so the grid and the legend agree. */
function cellOf(n: RateNight) {
  if (n.closed) return { text: "Not selling", title: "Not selling", tone: "closed" };
  if (n.amount === null) {
    return { text: "No price", title: "No price set", tone: "unpriced" };
  }
  const marks: string[] = [];
  if (n.closedToArrival) marks.push("no arrivals");
  if (n.minNights && n.minNights > 1) marks.push(`min ${n.minNights}`);
  return {
    text: n.amount,
    title: marks.length ? marks.join(" · ") : n.night,
    tone: n.override ? "override" : "base",
    note: marks.join(" · "),
  };
}

/** Every night between two, inclusive, as the calendar knows them. */
function span(nights: string[], a: string, b: string): string[] {
  const from = a < b ? a : b;
  const to = a < b ? b : a;
  return nights.filter((n) => n >= from && n <= to);
}

/**
 * A month of rates, for one plan at a time.
 *
 * The price somebody enters when they add a rate is what every night costs, for
 * all time — the grid below is the exceptions, not the prices. That was always
 * how it worked and the screen never said so, which is why it read as though
 * prices had to be painted on day by day.
 *
 * One plan at a time, in seven columns. The alternative — every plan as a row
 * against thirty-one night columns — is seventeen hundred pixels of sideways
 * scrolling with prices too narrow to print, and a month laid out as a month is
 * the shape people already know a season in.
 *
 * Cells select; they do not edit in place. A spreadsheet of editable cells
 * looks powerful and is how somebody changes March by accident while aiming at
 * May. Clicking picks a night, shift-clicking picks a run, and the form below
 * says in words what is about to happen to them.
 */
export default function RateMonth({
  calendar,
  groups,
  monthName,
  createPlan,
  setBase,
  setRange,
  deletePlan,
}: {
  calendar: RateCalendar;
  groups: RoomGroup[];
  /** "February 2026", worked out on the server where the locale is known. */
  monthName: string;
  createPlan: (groupId: number, name: string, base: string) => Promise<RateResult>;
  setBase: (planId: number, base: string) => Promise<RateResult>;
  setRange: (planId: number, patch: Record<string, unknown>) => Promise<RateResult>;
  deletePlan: (planId: number) => Promise<RateResult>;
}) {
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  /*
   * The chosen plan, corrected during render.
   *
   * Adding the first rate refreshes this page through a Server Action, which
   * re-renders without remounting — so an initialiser alone leaves `planId` at
   * zero while the select shows a plan, because a controlled select whose value
   * matches no option displays the first one. Then everything below silently
   * does nothing.
   */
  const planIds = calendar.plans.map((p) => p.id);
  const [planId, setPlanId] = useState<number>(planIds[0] ?? 0);
  if (planIds.length > 0 && !planIds.includes(planId)) setPlanId(planIds[0]);

  const plan = calendar.plans.find((p) => p.id === planId) ?? calendar.plans[0];

  // The everyday price, re-seeded when the plan or the month changes. Same
  // reason as the dates below: paging does not remount this component.
  const [base, setBaseField] = useState(plan?.base ?? "");
  const [seenPlan, setSeenPlan] = useState<number | null>(plan?.id ?? null);
  if (plan && plan.id !== seenPlan) {
    setSeenPlan(plan.id);
    setBaseField(plan.base ?? "");
  }

  const nights = calendar.nights;
  const first = nights[0] ?? "";
  const last = nights[nights.length - 1] ?? "";

  const [from, setFrom] = useState(first);
  const [to, setTo] = useState(last);
  const [anchor, setAnchor] = useState<string | null>(null);

  const [seenMonth, setSeenMonth] = useState(first);
  if (first !== seenMonth) {
    setSeenMonth(first);
    setFrom(first);
    setTo(last);
    setAnchor(null);
  }

  const [amount, setAmount] = useState("");
  const [stay, setStay] = useState<Wish>("keep");
  const [minNights, setMinNights] = useState("");
  const [closed, setClosed] = useState<Wish>("keep");
  const [cta, setCta] = useState<Wish>("keep");

  const [newGroup, setNewGroup] = useState<number>(groups[0]?.id ?? 0);
  const groupIds = groups.map((g) => g.id);
  if (groupIds.length > 0 && !groupIds.includes(newGroup)) setNewGroup(groupIds[0]);
  const [newName, setNewName] = useState("Standard");
  const [newBase, setNewBase] = useState("");

  const selected = from && to ? span(nights, from, to) : [];
  const chosen = new Set(selected);

  function pick(night: string, extend: boolean) {
    if (extend && anchor) {
      setFrom(anchor < night ? anchor : night);
      setTo(anchor < night ? night : anchor);
      return;
    }
    setAnchor(night);
    setFrom(night);
    setTo(night);
  }

  async function saveBase() {
    if (busy || !plan) return;
    setBusy(true);
    setProblem("");
    try {
      const result = await setBase(plan.id, base.trim());
      if (result.error) setProblem(result.error);
    } catch {
      setProblem("Could not reach the server. Reload the page and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (busy) return;
    if (!planId) {
      setProblem("Pick a rate first — reload the page if the list looks empty.");
      return;
    }
    if (stay === "on" && minNights.trim() === "") {
      setProblem("How many nights is the minimum?");
      return;
    }

    setBusy(true);
    setProblem("");

    // Only what was asked for. An empty price means "leave the price alone",
    // not "set it to nothing" — the difference between adjusting a season and
    // wiping one — and the API reads an absent key the same way.
    const patch: Record<string, unknown> = { from, to };
    if (amount.trim() !== "") patch.amount = amount.trim();
    if (stay === "off") patch.minNights = null;
    if (stay === "on") patch.minNights = Number(minNights);
    if (closed !== "keep") patch.closed = closed === "on";
    if (cta !== "keep") patch.closedToArrival = cta === "on";

    if (Object.keys(patch).length === 2) {
      setBusy(false);
      setProblem("Nothing to apply — set a price, a minimum stay, or a closure.");
      return;
    }

    try {
      const result = await setRange(planId, patch);
      if (result.error) setProblem(result.error);
      else {
        setAmount("");
        setStay("keep");
        setMinNights("");
        setClosed("keep");
        setCta("keep");
      }
    } catch {
      // A rejected action rather than a refused one — a tab left open across a
      // deploy, most often. Without this, `busy` stayed true and every field on
      // the card was disabled for good.
      setProblem("Could not reach the server. Reload the page and try again.");
    } finally {
      setBusy(false);
    }
  }

  /*
   * Deleting a rate, asked once and plainly. What it costs is said in the
   * question: the rate's own prices go, guests can no longer book it, and
   * bookings already taken keep the price they were given.
   */
  async function removePlan(id: number, label: string) {
    if (busy) return;
    const sure = window.confirm(
      `Delete the rate "${label}"?\n\nIts prices and closed nights go with it, and guests can no longer book it. Bookings already taken keep the price they were given.`
    );
    if (!sure) return;
    setBusy(true);
    setProblem("");
    try {
      const result = await deletePlan(id);
      if (result.error) setProblem(result.error);
    } catch {
      setProblem("Could not reach the server. Reload the page and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function addPlan() {
    if (busy) return;
    if (!newGroup) {
      setProblem("Add a room type on the Rooms page first — a rate belongs to one.");
      return;
    }
    setBusy(true);
    setProblem("");
    try {
      const result = await createPlan(newGroup, newName.trim(), newBase.trim());
      if (result.error) setProblem(result.error);
      else setNewBase("");
    } catch {
      setProblem("Could not reach the server. Reload the page and try again.");
    } finally {
      setBusy(false);
    }
  }

  const byNight = new Map(plan?.byNight.map((n) => [n.night, n]) ?? []);
  const weeks = weeksOf(nights);

  return (
    <>
      {problem ? (
        <p className="cal-problem" role="alert">
          {problem}
        </p>
      ) : null}

      {calendar.plans.length === 0 ? (
        <p className="admin-empty" style={{ marginBottom: "1.5rem" }}>
          No rates yet. Add one below and the calendar will fill in.
        </p>
      ) : (
        <>
          {/* ------------------------------------------- the everyday price */}
          <div className="admin-card rm-head wide" data-tour="rates-plan">
            <div style={{ minWidth: "12rem", flex: "1 1 14rem" }}>
              <label htmlFor="rm-plan" style={label}>
                Rate
              </label>
              <select
                id="rm-plan"
                value={planId}
                disabled={busy}
                onChange={(e) => setPlanId(Number(e.target.value))}
                style={{ ...field, appearance: "auto" }}
              >
                {calendar.plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.groupName} — {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* In the row, beside what it deletes, not under it: under the
                dropdown it made that column taller than its neighbours, and
                the fields beside it no longer lined up. */}
            {plan ? (
              // A 36px slot, so the 32px button sits on the fields' centre line.
              <div style={{ height: 36, display: "flex", alignItems: "center" }}>
                <button
                  type="button"
                  className="btn-link-danger"
                  style={{ marginTop: 0 }}
                  disabled={busy}
                  onClick={() => void removePlan(plan.id, `${plan.groupName} — ${plan.name}`)}
                >
                  Delete This Rate
                </button>
              </div>
            ) : null}

            <div style={{ flex: "1 1 10rem" }}>
              <label htmlFor="rm-base" style={label}>
                Every Night
              </label>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                <input
                  id="rm-base"
                  inputMode="decimal"
                  value={base}
                  disabled={busy}
                  placeholder="1,200"
                  onChange={(e) => setBaseField(e.target.value)}
                  style={{ ...field, flex: "1 1 0", minWidth: 0 }}
                />
                <button
                  type="button"
                  className="btn btn-quiet"
                  disabled={busy || base === (plan?.base ?? "")}
                  onClick={() => void saveBase()}
                >
                  Save
                </button>
              </div>
            </div>

            <p className="rm-note">
              This is the price of every night, for all time. Nights you set by
              hand below keep their own price until you clear them.
              {plan && plan.base === null ? (
                <strong className="rm-warn">
                  {" "}
                  There is no everyday price, so any night you have not set by
                  hand cannot be quoted at all.
                </strong>
              ) : null}
            </p>
          </div>

          {/* --------------------------------------------------- the month */}
          <div className="rm-grid" data-tour="rates-month" role="grid" aria-label={`${plan?.name ?? "Rate"}, ${monthName}`}>
            <div className="rm-weekdays" role="row">
              {WEEKDAYS.map((d) => (
                <span key={d} role="columnheader">
                  {d}
                </span>
              ))}
            </div>

            {weeks.map((week, w) => (
              <div className="rm-week" role="row" key={w}>
                {week.map((night, d) =>
                  night === null ? (
                    <span key={`b${d}`} className="rm-day rm-blank" role="gridcell" />
                  ) : (
                    <button
                      key={night}
                      type="button"
                      role="gridcell"
                      className={`rm-day ${cellOf(byNight.get(night)!).tone}${
                        chosen.has(night) ? " selected" : ""
                      }`}
                      title={`${night} · ${cellOf(byNight.get(night)!).title}`}
                      onClick={(e) => pick(night, e.shiftKey)}
                    >
                      <span className="rm-num">{Number(night.slice(8, 10))}</span>
                      <span className="rm-price">
                        {cellOf(byNight.get(night)!).text}
                      </span>
                      {cellOf(byNight.get(night)!).note ? (
                        <span className="rm-mark">
                          {cellOf(byNight.get(night)!).note}
                        </span>
                      ) : null}
                    </button>
                  )
                )}
              </div>
            ))}
          </div>

          {/* Each colour with its own word, held together, so the key reads
              as four pairs rather than eight things evenly spaced. */}
          <div className="rate-legend">
            <span className="rate-key"><span className="swatch base" />Everyday Price</span>
            <span className="rate-key"><span className="swatch override" />Set by Hand</span>
            <span className="rate-key"><span className="swatch closed" />Not Selling</span>
            <span className="rate-key"><span className="swatch unpriced" />No Price</span>
          </div>

          {/* ------------------------------------------ what to do to them */}
          <div className="admin-card" data-tour="rates-range">
            <h2>Price These Nights</h2>
            <p className="admin-sub" style={{ marginBottom: "1rem" }}>
              {selected.length > 0
                ? `${selected.length} night${selected.length === 1 ? "" : "s"} · ${from}${
                    from === to ? "" : ` to ${to}`
                  }. `
                : ""}
              Click a night above, or shift-click a second to take a run of them.
              Both dates are nights and the last one is included — a season to
              the 31st means the 31st. Leave the price blank to keep what is
              there, and the rest on &ldquo;Leave as it is&rdquo; to change
              nothing but the price.
            </p>

            <div
              style={{
                display: "grid",
                gap: "0.75rem",
                gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))",
              }}
            >
              <div>
                <label htmlFor="rm-from" style={label}>
                  First Night
                </label>
                <input
                  id="rm-from"
                  type="date"
                  value={from}
                  disabled={busy}
                  onChange={(e) => setFrom(e.target.value)}
                  style={field}
                />
              </div>

              <div>
                <label htmlFor="rm-to" style={label}>
                  Last Night
                </label>
                <input
                  id="rm-to"
                  type="date"
                  value={to}
                  disabled={busy}
                  onChange={(e) => setTo(e.target.value)}
                  style={field}
                />
              </div>

              <div>
                <label htmlFor="rm-amount" style={label}>
                  Price a Night
                </label>
                <input
                  id="rm-amount"
                  inputMode="decimal"
                  value={amount}
                  disabled={busy}
                  placeholder="leave as it is"
                  onChange={(e) => setAmount(e.target.value)}
                  style={field}
                />
              </div>

              <div>
                <label htmlFor="rm-min-wish" style={label}>
                  Minimum Stay
                </label>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <select
                    id="rm-min-wish"
                    value={stay}
                    disabled={busy}
                    onChange={(e) => setStay(e.target.value as Wish)}
                    style={{ ...field, flex: "1 1 0", minWidth: 0, appearance: "auto" }}
                  >
                    <option value="keep">Leave as It Is</option>
                    <option value="on">At Least</option>
                    <option value="off">No Minimum</option>
                  </select>
                  {stay === "on" ? (
                    <input
                      id="rm-min"
                      type="number"
                      min={1}
                      max={90}
                      value={minNights}
                      disabled={busy}
                      aria-label="Nights"
                      onChange={(e) => setMinNights(e.target.value)}
                      style={{ ...field, width: "4.5rem" }}
                    />
                  ) : null}
                </div>
              </div>

              <div>
                <label htmlFor="rm-closed" style={label}>
                  Selling
                </label>
                <select
                  id="rm-closed"
                  value={closed}
                  disabled={busy}
                  onChange={(e) => setClosed(e.target.value as Wish)}
                  style={{ ...field, appearance: "auto" }}
                >
                  <option value="keep">Leave as It Is</option>
                  <option value="on">Not Selling These Nights</option>
                  <option value="off">Selling These Nights</option>
                </select>
              </div>

              <div>
                <label htmlFor="rm-cta" style={label}>
                  Arrivals
                </label>
                <select
                  id="rm-cta"
                  value={cta}
                  disabled={busy}
                  onChange={(e) => setCta(e.target.value as Wish)}
                  style={{ ...field, appearance: "auto" }}
                >
                  <option value="keep">Leave as It Is</option>
                  <option value="on">No Arrivals on These Nights</option>
                  <option value="off">Arrivals Allowed</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-go"
              disabled={busy}
              style={{ marginTop: "1rem" }}
              onClick={() => void apply()}
            >
              {busy ? "Applying…" : "Apply"}
            </button>
          </div>
        </>
      )}

      {/* ------------------------------------------------------- every rate */}
      {calendar.plans.length > 0 ? (
        <div className="admin-card wide rates-all" data-tour="rates-all">
          <h2>All Rates</h2>
          <p className="admin-sub" style={{ marginBottom: "0.75rem" }}>
            Every rate on every room type. Delete one you no longer sell; bookings already taken keep
            their price.
          </p>
          <div className="admin-scroll">
          <table className="admin-table rates-table">
            <thead>
              <tr>
                <th>Room Type</th>
                <th>Rate</th>
                <th>Every Night</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {calendar.plans.map((p) => (
                <tr key={p.id}>
                  <td>{p.groupName}</td>
                  <td>
                    {p.name}
                    {p.id === plan?.id ? <span className="admin-sub"> · showing above</span> : null}
                  </td>
                  <td>{p.base ?? <span className="rm-warn">No price</span>}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button
                      type="button"
                      className="btn btn-quiet"
                      disabled={busy || p.id === plan?.id}
                      onClick={() => setPlanId(p.id)}
                    >
                      Edit
                    </button>{" "}
                    {/* Outlined: red is only ever the confirming button of a
                        delete's own question. */}
                    <button
                      type="button"
                      className="btn btn-quiet"
                      disabled={busy}
                      onClick={() => void removePlan(p.id, `${p.groupName} — ${p.name}`)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ) : null}

      {/* --------------------------------------------------------- a new rate */}
      <div className="admin-card">
        <h2>Add a Rate</h2>
        <p className="admin-sub" style={{ marginBottom: "1rem" }}>
          One per room type is enough to start. The price you give is what every
          night costs; seasons are the exceptions you set afterwards.
        </p>

        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <select
            aria-label="Room type"
            value={newGroup}
            disabled={busy}
            onChange={(e) => setNewGroup(Number(e.target.value))}
            style={{ ...field, flex: "1 1 12rem", appearance: "auto" }}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>

          <input
            aria-label="Rate name"
            value={newName}
            disabled={busy}
            onChange={(e) => setNewName(e.target.value)}
            style={{ ...field, flex: "1 1 10rem" }}
          />

          <input
            aria-label="Price a night"
            inputMode="decimal"
            value={newBase}
            disabled={busy}
            placeholder="Price a night"
            onChange={(e) => setNewBase(e.target.value)}
            style={{ ...field, flex: "1 1 8rem" }}
          />

          <button
            type="button"
            className="btn btn-quiet"
            disabled={busy}
            onClick={() => void addPlan()}
          >
            Add
          </button>
        </div>
      </div>
    </>
  );
}
