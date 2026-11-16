"use client";

import { useState, useTransition } from "react";
import { ImagePlus } from "lucide-react";

import { shrink } from "@/lib/photo";

import styles from "./MarketListing.module.css";

/**
 * Photos of the venue, or of one room type. The first is the cover: the
 * picture on the search result, or the room's main photo.
 *
 * Shrunk in the browser before upload, as checklist photos are — a phone's
 * five megabytes never leave the machine.
 */
export default function MarketPhotos({
  slug,
  photos,
  max,
  label,
  add,
  remove,
  cover,
}: {
  slug: string;
  photos: number[];
  max: number;
  label: string;
  add: (dataUri: string) => Promise<{ error?: string }>;
  remove: (id: number) => Promise<{ error?: string }>;
  cover: (id: number) => Promise<{ error?: string }>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(task: () => Promise<{ error?: string }>) {
    setError(null);
    start(async () => {
      const result = await task();
      if (result.error) setError(result.error);
    });
  }

  async function onFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files).slice(0, max - photos.length)) {
      const shrunk = await shrink(file);
      if ("error" in shrunk) {
        setError(shrunk.error);
        return;
      }
      run(() => add(shrunk.dataUri));
    }
  }

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      <div className={styles.photos} aria-busy={pending}>
        {photos.map((id, index) => (
          <div key={id} className={styles.photo}>
            {/* eslint-disable-next-line @next/next/no-img-element -- proxied, behind the session */}
            <img src={`/api/market-photo/${encodeURIComponent(slug)}/${id}`} alt={`${label} photo ${index + 1}`} />
            {index === 0 && <span className={styles.cover}>Cover</span>}
            <div className={styles.photoTools}>
              {index > 0 ? (
                <button type="button" disabled={pending} onClick={() => run(() => cover(id))}>
                  Make Cover
                </button>
              ) : (
                <span />
              )}
              <button type="button" disabled={pending} onClick={() => run(() => remove(id))}>
                Remove
              </button>
            </div>
          </div>
        ))}
        {photos.length < max && (
          <label className={styles.add} style={{ position: "relative" }}>
            <ImagePlus size={20} aria-hidden />
            Add Photos
            <input type="file" accept="image/*" multiple disabled={pending} onChange={(e) => onFiles(e.target.files)} />
          </label>
        )}
      </div>
      {error && (
        <p className={styles.error} role="alert" style={{ margin: 0, fontSize: "0.875rem" }}>
          {error}
        </p>
      )}
    </div>
  );
}
