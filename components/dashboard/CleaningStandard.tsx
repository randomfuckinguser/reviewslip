"use client";

import { useRef, useState, useTransition } from "react";

import { shrink } from "@/lib/photo";

export interface ChecklistItem {
  id: number;
  groupId: number | null;
  groupName: string | null;
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
}

export interface RoomState {
  id: string;
  label: string;
  note: string;
}

/**
 * What has to be done in a room, and what state each room is in.
 *
 * Both on the Rooms page because both are properties of rooms, and because
 * somebody setting a property up does the two together: these are the types,
 * this is what cleaning one means, and that one is being retiled.
 *
 * The list is per type. An item with no type belongs to every room, which is
 * where most of them end up — the bathroom gets cleaned whatever the room is
 * called — so that is the default the form offers.
 */
export default function CleaningStandard({
  items,
  groups,
  rooms,
  states,
  slug,
  addItem,
  removeItem,
  setPhoto,
  setStatus,
}: {
  slug: string;
  items: ChecklistItem[];
  groups: { id: number; name: string }[];
  rooms: { id: number; name: string; groupName: string | null; status: string }[];
  states: RoomState[];
  addItem: (
    label: string,
    groupId: number | null
  ) => Promise<{ ok: boolean; error?: string }>;
  removeItem: (id: number) => Promise<{ ok: boolean; error?: string }>;
  /** A data URI to attach one, or null to take it off. */
  setPhoto: (
    id: number,
    dataUri: string | null
  ) => Promise<{ ok: boolean; error?: string }>;
  setStatus: (id: number, status: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [label, setLabel] = useState("");
  const [group, setGroup] = useState<string>("");
  const [problem, setProblem] = useState("");
  const [pending, start] = useTransition();

  function add(event: React.FormEvent) {
    event.preventDefault();
    if (!label.trim()) return;
    setProblem("");
    start(async () => {
      const result = await addItem(
        label.trim(),
        group === "" ? null : Number(group)
      ).catch((): { ok: boolean; error?: string } => ({ ok: false }));
      if (result.ok) setLabel("");
      else setProblem(result.error ?? "That could not be saved.");
    });
  }

  function drop(id: number) {
    setProblem("");
    start(async () => {
      const result = await removeItem(id).catch(
        (): { ok: boolean; error?: string } => ({ ok: false })
      );
      if (!result.ok) setProblem(result.error ?? "That could not be removed.");
    });
  }

  function change(id: number, status: string) {
    setProblem("");
    start(async () => {
      const result = await setStatus(id, status).catch(
        (): { ok: boolean; error?: string } => ({ ok: false })
      );
      if (!result.ok) setProblem(result.error ?? "That could not be changed.");
    });
  }

  const general = items.filter((i) => i.groupId === null);
  const byType = groups
    .map((g) => ({ group: g, mine: items.filter((i) => i.groupId === g.id) }))
    .filter((t) => t.mine.length > 0);

  return (
    <>
      <section style={card} data-tour="rooms-cleaning">
        <h2 style={heading}>What Cleaning a Room Means</h2>
        <p style={lede}>
          Housekeepers see this on their phone, under each room, and tick it off
          as they go. Lines with no room type apply to every room; put a type on
          one when the job only exists there &mdash; a staircase, a sofa bed.
        </p>

        <form onSubmit={add} style={form}>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Bathroom clean"
            maxLength={80}
            aria-label="What needs doing"
            style={input}
          />
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
          <button type="submit" className="btn btn-quiet" disabled={pending || !label.trim()}>
            Add
          </button>
        </form>

        {problem && (
          <p role="status" style={{ margin: "0.6rem 0 0", fontSize: "0.82rem", color: "var(--warning)" }}>
            {problem}
          </p>
        )}

        {items.length === 0 ? (
          <p style={empty}>
            Nothing yet. Until there is, the board shows the room and the job
            and leaves the standard to whoever is holding the mop.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "1.2rem", marginTop: "1.2rem" }}>
            {general.length > 0 && (
              <Block
                title="Every room"
                items={general}
                slug={slug}
                onDrop={drop}
                onPhoto={setPhoto}
                busy={pending}
              />
            )}
            {byType.map(({ group: g, mine }) => (
              <Block
                key={g.id}
                title={`${g.name} only`}
                items={mine}
                slug={slug}
                onDrop={drop}
                onPhoto={setPhoto}
                busy={pending}
              />
            ))}
          </div>
        )}
      </section>

      <section style={card} data-tour="rooms-states">
        <h2 style={heading}>Rooms Out of Use</h2>
        <p style={lede}>
          {states.map((s) => (
            <span key={s.id} style={{ display: "block" }}>
              <strong style={{ fontWeight: 500 }}>{s.label}</strong> &mdash; {s.note}
            </span>
          ))}
        </p>

        <ul style={list}>
          {rooms.map((room) => (
            <li key={room.id} style={row}>
              <span>
                <strong style={{ fontWeight: 600 }}>{room.name}</strong>{" "}
                <span style={{ color: "var(--ink-soft)", fontSize: "0.82rem" }}>
                  {room.groupName}
                </span>
              </span>
              <select
                value={room.status === "out_of_service" ? "renovating" : room.status}
                onChange={(e) => change(room.id, e.target.value)}
                disabled={pending}
                aria-label={`State of ${room.name}`}
                style={select}
              >
                {states.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Block({
  title,
  items,
  slug,
  onDrop,
  onPhoto,
  busy,
}: {
  title: string;
  items: ChecklistItem[];
  slug: string;
  onDrop: (id: number) => void;
  onPhoto: (
    id: number,
    dataUri: string | null
  ) => Promise<{ ok: boolean; error?: string }>;
  busy: boolean;
}) {
  return (
    <div>
      <h3 style={blockHead}>{title}</h3>
      <ul style={list}>
        {items.map((item) => (
          <li key={item.id} style={row}>
            <Photo item={item} slug={slug} onPhoto={onPhoto} busy={busy} />
            <span style={{ flex: 1, minWidth: 0 }}>{item.label}</span>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={busy}
              onClick={() => onDrop(item.id)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The picture of what the line means.
 *
 * "Bathroom clean" is not an instruction. It is a word that everybody reading
 * it fills in differently, and the people reading it are often working in
 * their second or third language at seven in the morning. A photograph of the
 * shelf as it should be left settles in a glance what the sentence cannot.
 *
 * Its own state rather than a page reload after each change: adding pictures
 * to a standard is a dozen of them in a row, and a round trip through the
 * whole Rooms page between each one would make that unbearable.
 */
function Photo({
  item,
  slug,
  onPhoto,
  busy,
}: {
  item: ChecklistItem;
  slug: string;
  onPhoto: (
    id: number,
    dataUri: string | null
  ) => Promise<{ ok: boolean; error?: string }>;
  busy: boolean;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [has, setHas] = useState(item.hasPhoto);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState("");
  /*
   * Bumped on every change, and added to the address.
   *
   * The picture is served with five minutes of cache, so replacing one and
   * leaving the URL alone shows the old photograph until the cache expires —
   * which reads as the upload having silently failed.
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

    const saved = await onPhoto(item.id, made.dataUri);
    setWorking(false);
    if (!saved.ok) return setProblem(saved.error ?? "That photo could not be saved.");

    setHas(true);
    setVersion((v) => v + 1);
  }

  async function clear() {
    setProblem("");
    setWorking(true);
    const saved = await onPhoto(item.id, null);
    setWorking(false);
    if (!saved.ok) return setProblem(saved.error ?? "That photo could not be removed.");
    setHas(false);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
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
        style={well}
        title={has ? "Replace This Photo" : "Add a Photo"}
        aria-label={
          has ? `Replace the photo for ${item.label}` : `Add a photo for ${item.label}`
        }
      >
        {has ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/checklist-photo/${encodeURIComponent(slug)}/${item.id}?v=${version}`}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{ fontSize: "1.1rem", opacity: 0.55 }}>+</span>
        )}
      </button>

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

      {/* Beside the picture rather than in the page's own notice, so a failure
          sits with the line it happened on — there are two dozen of these and
          a message at the top would not say which. */}
      {(working || problem) && (
        <span style={{ ...tinyNote, color: problem ? "var(--warn, #b4423a)" : undefined }}>
          {problem || "Working…"}
        </span>
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

const tiny: React.CSSProperties = { fontSize: "0.72rem", padding: "0.15rem 0.45rem" };

const tinyNote: React.CSSProperties = {
  fontSize: "0.72rem",
  lineHeight: 1.35,
  maxWidth: "12rem",
  color: "var(--ink-soft)",
};

const card: React.CSSProperties = {
  background: "var(--paper)",
  color: "var(--ink)",
  borderRadius: 14,
  padding: "1.4rem",
  marginTop: "1.5rem",
};

const heading: React.CSSProperties = { fontSize: "1.1rem", margin: "0 0 0.35rem" };

const lede: React.CSSProperties = {
  margin: "0 0 1rem",
  fontSize: "0.85rem",
  lineHeight: 1.6,
  color: "var(--ink-soft)",
};

const form: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  flexWrap: "wrap",
  alignItems: "center",
};

const input: React.CSSProperties = {
  font: "inherit",
  fontSize: "0.9rem",
  flex: "1 1 14rem",
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

const blockHead: React.CSSProperties = {
  fontSize: "0.78rem",
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--ink-soft)",
  margin: "0 0 0.4rem",
};

const list: React.CSSProperties = { listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.3rem" };

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  padding: "0.4rem 0",
  fontSize: "0.9rem",
  borderTop: "1px solid color-mix(in srgb, var(--ink) 10%, transparent)",
};

const empty: React.CSSProperties = {
  margin: "1rem 0 0",
  fontSize: "0.85rem",
  color: "var(--ink-soft)",
};
