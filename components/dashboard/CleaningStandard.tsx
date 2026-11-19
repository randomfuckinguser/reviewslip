"use client";

import { useRef, useState, useTransition } from "react";

import { shrink } from "@/lib/photo";

export interface ChecklistItem {
  id: number;
  groupId: number | null;
  groupName: string | null;
  /** The area it is under — Bedroom, Bathroom — or null for the whole room. */
  areaId: number | null;
  areaName: string | null;
  label: string;
  /**
   * Whether a reference photograph is attached, not the photograph.
   *
   * A standard runs to two dozen lines and each picture is up to 250kB;
   * carrying them in this payload would make opening this page a six megabyte
   * download for pictures most visits never look at. They come from
   * /api/checklist-photo instead, one request each, cached by the browser.
   */
  hasPhoto: boolean;
  /** Ticked by the housekeeper taking a photo of it, not by a tap. */
  needsPhoto?: boolean;
}

/** A part of a room the list is grouped into, with its own photograph. */
export interface CleaningArea {
  id: number;
  name: string;
  hasPhoto: boolean;
}

/** One of the usual lines the venue does not have yet. */
export interface StarterLine {
  area: string;
  label: string;
}

export interface RoomState {
  id: string;
  label: string;
  note: string;
}

type Result = { ok: boolean; error?: string };

/**
 * What has to be done in a room, area by area.
 *
 * An area — Bedroom, Bathroom — is a card with a photograph of how it should
 * be left and the lines that belong to it, so the picture and the words that
 * describe it sit together. Housekeepers see the same grouping on their
 * phone, tick the lines, and photograph each area when it is done; those
 * photographs are on this page under Today's Photos.
 *
 * Lines can still carry a room type: "Sofa bed made up" is a Bedroom line
 * that only exists in a Family Suite.
 */
export default function CleaningStandard({
  items,
  areas,
  groups,
  starter,
  slug,
  addItem,
  removeItem,
  setNeedsPhoto,
  setPhoto,
  addArea,
  removeArea,
  setAreaPhoto,
  addStarter,
}: {
  slug: string;
  items: ChecklistItem[];
  areas: CleaningArea[];
  groups: { id: number; name: string }[];
  starter: StarterLine[];
  addItem: (label: string, groupId: number | null, areaId: number | null, needsPhoto?: boolean) => Promise<Result>;
  removeItem: (id: number) => Promise<Result>;
  setNeedsPhoto: (id: number, needsPhoto: boolean) => Promise<Result>;
  /** A data URI to attach one, or null to take it off. */
  setPhoto: (id: number, dataUri: string | null) => Promise<Result>;
  addArea: (name: string) => Promise<Result>;
  removeArea: (id: number) => Promise<Result>;
  setAreaPhoto: (id: number, dataUri: string | null) => Promise<Result>;
  addStarter: () => Promise<Result>;
}) {
  const [problem, setProblem] = useState("");
  const [pending, start] = useTransition();
  const [areaName, setAreaName] = useState("");

  /** Runs one change, and says so if it did not work. */
  function run(action: () => Promise<Result>, fallback: string, then?: () => void) {
    setProblem("");
    start(async () => {
      const result = await action().catch((): Result => ({ ok: false }));
      if (result.ok) then?.();
      else setProblem(result.error ?? fallback);
    });
  }

  function newArea(event: React.FormEvent) {
    event.preventDefault();
    if (!areaName.trim()) return;
    run(() => addArea(areaName.trim()), "That area could not be added.", () =>
      setAreaName("")
    );
  }

  const loose = items.filter((i) => i.areaId === null || !areas.some((a) => a.id === i.areaId));

  const lineProps = {
    slug,
    groups,
    busy: pending,
    // Says whether it saved, so the box keeps what was typed when it did not.
    onAdd: async (label: string, groupId: number | null, areaId: number | null, needsPhoto: boolean) => {
      setProblem("");
      const result = await addItem(label, groupId, areaId, needsPhoto).catch(
        (): Result => ({ ok: false })
      );
      if (!result.ok) setProblem(result.error ?? "That could not be saved.");
      return result.ok;
    },
    onDrop: (id: number) => run(() => removeItem(id), "That could not be removed."),
    onNeedsPhoto: (id: number, on: boolean) => setNeedsPhoto(id, on),
    onPhoto: setPhoto,
  };

  return (
    <section style={card} className="wide" data-tour="rooms-cleaning">
      <div style={headRow}>
        <div style={{ minWidth: 0 }}>
          <h2 style={heading}>What Cleaning a Room Means</h2>
          <p style={lede}>
            Housekeepers see this on their phone under each room, tick it off,
            and photograph each area when it is done. Add a photo of how an area
            should look so nobody has to guess.
          </p>
        </div>
      </div>

      {starter.length > 0 && (
        <div style={starterBand}>
          <span style={{ flex: "1 1 16rem", minWidth: 0 }}>
            <strong style={{ fontWeight: 600 }}>Start with the usual:</strong>{" "}
            {starter.map((s) => s.label).join(" · ")}
          </span>
          <button
            type="button"
            className="btn btn-go"
            disabled={pending}
            onClick={() => run(addStarter, "Those could not be added.")}
          >
            Add {starter.length === 1 ? "It" : "These"}
          </button>
        </div>
      )}

      {problem && (
        <p role="status" style={{ margin: "0.6rem 0 0", fontSize: "0.82rem", color: "var(--warning)" }}>
          {problem}
        </p>
      )}

      <div className="cols-grid" style={grid}>
        {areas.map((area) => (
          <AreaCard
            key={area.id}
            area={area}
            items={items.filter((i) => i.areaId === area.id)}
            onRemove={() =>
              run(() => removeArea(area.id), "That area could not be removed.")
            }
            onAreaPhoto={(uri) => setAreaPhoto(area.id, uri)}
            {...lineProps}
          />
        ))}

        {/* Lines for the room as a whole: everything written before areas
            existed, and anything that is not in one. Shown when there are
            any, or when there are no areas yet and this is where lines go. */}
        {(loose.length > 0 || areas.length === 0) && (
          <AreaCard area={null} items={loose} {...lineProps} />
        )}

        <form onSubmit={newArea} style={{ ...box, ...addBox }}>
          <h3 style={areaTitle}>Add an Area</h3>
          <p style={{ ...hint, margin: "0 0 0.6rem" }}>
            A part of the room with its own photo: Bedroom, Bathroom, Balcony.
          </p>
          <div style={formRow}>
            <input
              value={areaName}
              onChange={(e) => setAreaName(e.target.value)}
              placeholder="Balcony"
              maxLength={40}
              aria-label="Area name"
              style={input}
            />
            <button type="submit" className="btn btn-quiet" disabled={pending || !areaName.trim()}>
              Add Area
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

/**
 * One area: its picture of how it should be left, its lines, and a box to add
 * a line to it. `area` null is the whole room.
 */
function AreaCard({
  area,
  items,
  slug,
  groups,
  busy,
  onAdd,
  onDrop,
  onNeedsPhoto,
  onPhoto,
  onRemove,
  onAreaPhoto,
}: {
  area: CleaningArea | null;
  items: ChecklistItem[];
  slug: string;
  groups: { id: number; name: string }[];
  busy: boolean;
  onAdd: (label: string, groupId: number | null, areaId: number | null, needsPhoto: boolean) => Promise<boolean>;
  onDrop: (id: number) => void;
  onNeedsPhoto: (id: number, on: boolean) => Promise<Result>;
  onPhoto: (id: number, dataUri: string | null) => Promise<Result>;
  onRemove?: () => void;
  onAreaPhoto?: (dataUri: string | null) => Promise<Result>;
}) {
  const [label, setLabel] = useState("");
  const [group, setGroup] = useState("");
  const [needsPhoto, setNeedsPhotoNew] = useState(false);
  const name = area?.name ?? "Whole Room";

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!label.trim()) return;
    const saved = await onAdd(label.trim(), group === "" ? null : Number(group), area?.id ?? null, needsPhoto);
    if (saved) {
      setLabel("");
      setNeedsPhotoNew(false);
    }
  }

  return (
    <div style={box}>
      <div style={areaHead}>
        <h3 style={areaTitle}>{name}</h3>
        {onRemove && (
          <button
            type="button"
            className="btn btn-quiet"
            style={tiny}
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  `Remove ${name}? Its lines stay, under Whole Room. Its photos go.`
                )
              ) {
                onRemove();
              }
            }}
          >
            Remove Area
          </button>
        )}
      </div>

      {area && onAreaPhoto && (
        <Photo
          wide
          label={`how ${name} should look`}
          has={area.hasPhoto}
          src={`/api/checklist-photo/${encodeURIComponent(slug)}/area/${area.id}`}
          busy={busy}
          onPhoto={onAreaPhoto}
        />
      )}

      {items.length === 0 ? (
        <p style={{ ...hint, margin: "0.7rem 0 0" }}>Nothing to check here yet.</p>
      ) : (
        <ul style={list}>
          {items.map((item) => (
            <li key={item.id} style={row}>
              <Photo
                label={item.label}
                has={item.hasPhoto}
                src={`/api/checklist-photo/${encodeURIComponent(slug)}/${item.id}`}
                busy={busy}
                onPhoto={(uri) => onPhoto(item.id, uri)}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                {item.label}
                {item.groupName && (
                  <span style={typeTag}>{item.groupName} only</span>
                )}
              </span>
              <NeedsPhoto
                initial={Boolean(item.needsPhoto)}
                busy={busy}
                onChange={(on) => onNeedsPhoto(item.id, on)}
              />
              <button
                type="button"
                className="btn btn-quiet"
                style={tiny}
                disabled={busy}
                onClick={() => onDrop(item.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} style={{ ...formRow, marginTop: "0.75rem" }}>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={area ? `Add to ${name}` : "Floors mopped"}
          maxLength={80}
          aria-label={`What needs doing in ${name}`}
          style={input}
        />
        {groups.length > 0 && (
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            aria-label="Which room type"
            style={select}
          >
            <option value="">Every Room</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} only
              </option>
            ))}
          </select>
        )}
        <label style={needsBox} data-tip="The housekeeper ticks this line by taking a photo of it, not by a tap.">
          <input
            type="checkbox"
            checked={needsPhoto}
            onChange={(e) => setNeedsPhotoNew(e.target.checked)}
          />
          Needs a photo
        </label>
        <button type="submit" className="btn btn-quiet" disabled={busy || !label.trim()}>
          Add
        </button>
      </form>
    </div>
  );
}

/**
 * Whether a line is ticked by a photo: one press, saved straight away, and
 * put back if the save fails.
 *
 * Its own state rather than a page reload, as the photos are: turning it on
 * for half a dozen lines in a row should not re-render the Rooms page six
 * times.
 */
function NeedsPhoto({
  initial,
  busy,
  onChange,
}: {
  initial: boolean;
  busy: boolean;
  onChange: (on: boolean) => Promise<Result>;
}) {
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !on;
    setOn(next);
    setSaving(true);
    const saved = await onChange(next).catch((): Result => ({ ok: false }));
    setSaving(false);
    if (!saved.ok) setOn(!next);
  }

  return (
    <button
      type="button"
      className="btn btn-quiet"
      aria-pressed={on}
      disabled={busy || saving}
      onClick={toggle}
      data-tip={
        on
          ? "Ticked by a photo: the housekeeper has to take one. Press to let a tap tick it."
          : "Ticked by a tap. Press so the housekeeper has to take a photo instead."
      }
      style={{
        ...tiny,
        whiteSpace: "nowrap",
        ...(on
          ? { background: "color-mix(in srgb, var(--warning) 18%, transparent)", color: "var(--ink)" }
          : {}),
      }}
    >
      {on ? "📷 Photo to tick" : "Tap to tick"}
    </button>
  );
}

/**
 * A reference photograph: a small square beside a line, or the wide picture
 * at the top of an area.
 *
 * Its own state rather than a page reload after each change: adding pictures
 * to a standard is a dozen of them in a row, and a round trip through the
 * whole Rooms page between each one would make that unbearable.
 */
function Photo({
  label,
  has: initial,
  src,
  busy,
  onPhoto,
  wide = false,
}: {
  label: string;
  has: boolean;
  src: string;
  busy: boolean;
  onPhoto: (dataUri: string | null) => Promise<Result>;
  wide?: boolean;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [has, setHas] = useState(initial);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState("");
  /*
   * Bumped on every change, and added to the address. The picture is served
   * with five minutes of cache, so replacing one and leaving the URL alone
   * shows the old photograph until the cache expires — which reads as the
   * upload having silently failed.
   */
  const [version, setVersion] = useState(0);

  async function chosen(file: File | undefined) {
    if (!file) return;
    setProblem("");
    setWorking(true);

    const made = await shrink(file);
    if ("error" in made) {
      setProblem(made.error);
      setWorking(false);
      return;
    }

    const saved = await onPhoto(made.dataUri);
    setWorking(false);
    if (!saved.ok) return setProblem(saved.error ?? "That photo could not be saved.");

    setHas(true);
    setVersion((v) => v + 1);
  }

  async function clear() {
    setProblem("");
    setWorking(true);
    const saved = await onPhoto(null);
    setWorking(false);
    if (!saved.ok) return setProblem(saved.error ?? "That photo could not be removed.");
    setHas(false);
  }

  return (
    <div style={wide ? { display: "grid", gap: "0.4rem" } : { display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <input
        ref={picker}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void chosen(e.target.files?.[0]);
          // Cleared, or choosing the same file twice in a row fires nothing
          // the second time and looks like the button stopped working.
          e.target.value = "";
        }}
      />

      <button
        type="button"
        onClick={() => picker.current?.click()}
        disabled={busy || working}
        style={wide ? wideWell : well}
        title={has ? "Replace This Photo" : "Add a Photo"}
        aria-label={has ? `Replace the photo of ${label}` : `Add a photo of ${label}`}
      >
        {has ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${src}?v=${version}`}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : wide ? (
          <span style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>
            + Photo of {label}
          </span>
        ) : (
          <span style={{ fontSize: "1.1rem", opacity: 0.55 }}>+</span>
        )}
      </button>

      {(has || working || problem) && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          {has && wide && (
            <button
              type="button"
              className="btn btn-quiet"
              style={tiny}
              disabled={busy || working}
              onClick={() => picker.current?.click()}
            >
              Replace
            </button>
          )}
          {has && (
            <button
              type="button"
              className="btn btn-quiet"
              style={tiny}
              disabled={busy || working}
              onClick={() => void clear()}
            >
              Clear
            </button>
          )}
          {/* Beside the picture rather than in the page's own notice, so a
              failure sits with the line it happened on. */}
          {(working || problem) && (
            <span style={{ ...tinyNote, color: problem ? "var(--warn, #b4423a)" : undefined }}>
              {problem || "Working…"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* Square, and the size of a thumbnail somebody can actually judge a photo by.
   Smaller than this and it is a coloured dot. */
const well: React.CSSProperties = {
  flex: "0 0 auto",
  width: "2.6rem",
  height: "2.6rem",
  padding: 0,
  display: "grid",
  placeItems: "center",
  overflow: "hidden",
  borderRadius: 8,
  border: "1px dashed var(--ink-soft, #7b8a82)",
  background: "color-mix(in srgb, var(--ink) 4%, transparent)",
  cursor: "pointer",
};

/* The area's own picture: wide enough to see the room in. */
const wideWell: React.CSSProperties = {
  ...well,
  width: "100%",
  height: "9.5rem",
  borderRadius: 10,
};

const tiny: React.CSSProperties = { fontSize: "0.72rem", padding: "0.15rem 0.45rem" };

const tinyNote: React.CSSProperties = {
  fontSize: "0.72rem",
  lineHeight: 1.35,
  maxWidth: "14rem",
  color: "var(--ink-soft)",
};

const card: React.CSSProperties = {
  background: "var(--paper)",
  color: "var(--ink)",
  borderRadius: 14,
  padding: "1.4rem",
  marginTop: "1.5rem",
};

const headRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "start",
  gap: "1rem",
};

const heading: React.CSSProperties = { fontSize: "1.1rem", margin: "0 0 0.35rem" };

const lede: React.CSSProperties = {
  margin: "0 0 1rem",
  fontSize: "0.85rem",
  lineHeight: 1.6,
  color: "var(--ink-soft)",
};

const hint: React.CSSProperties = {
  fontSize: "0.8rem",
  lineHeight: 1.5,
  color: "var(--ink-soft)",
};

const starterBand: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "0.75rem",
  padding: "0.75rem 1rem",
  borderRadius: 10,
  fontSize: "0.88rem",
  background: "color-mix(in srgb, var(--ink) 6%, transparent)",
};

/* Areas two to a row on a computer, one on a narrow screen: the app's own
   .cols-grid, so it folds at the same width as the rest of the page. */
const grid: React.CSSProperties = {
  marginTop: "1rem",
};

const box: React.CSSProperties = {
  border: "1px solid color-mix(in srgb, var(--ink) 14%, transparent)",
  borderRadius: 12,
  padding: "1rem",
  minWidth: 0,
};

const addBox: React.CSSProperties = {
  borderStyle: "dashed",
};

const areaHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "0.5rem",
  marginBottom: "0.6rem",
};

const areaTitle: React.CSSProperties = {
  fontSize: "0.95rem",
  fontWeight: 600,
  margin: 0,
};

const needsBox: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  fontSize: "0.8rem",
  whiteSpace: "nowrap",
  color: "var(--ink-soft)",
};

const typeTag: React.CSSProperties = {
  display: "inline-block",
  marginLeft: "0.4rem",
  padding: "0 0.4rem",
  borderRadius: 6,
  fontSize: "0.72rem",
  color: "var(--ink-soft)",
  border: "1px solid color-mix(in srgb, var(--ink) 18%, transparent)",
};

const formRow: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  flexWrap: "wrap",
  alignItems: "center",
};

const input: React.CSSProperties = {
  font: "inherit",
  fontSize: "0.9rem",
  flex: "1 1 10rem",
  minWidth: 0,
  padding: "0.45rem 0.6rem",
  borderRadius: 8,
  border: "1px solid color-mix(in srgb, var(--ink) 20%, transparent)",
  background: "var(--paper)",
  color: "var(--ink)",
};

const select: React.CSSProperties = {
  font: "inherit",
  fontSize: "0.85rem",
  padding: "0.4rem 0.5rem",
  borderRadius: 8,
  border: "1px solid color-mix(in srgb, var(--ink) 20%, transparent)",
  background: "var(--paper)",
  color: "var(--ink)",
};

const list: React.CSSProperties = {
  listStyle: "none",
  margin: "0.7rem 0 0",
  padding: 0,
  display: "grid",
  gap: "0.2rem",
};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  padding: "0.35rem 0",
  fontSize: "0.9rem",
  borderTop: "1px solid color-mix(in srgb, var(--ink) 10%, transparent)",
};
