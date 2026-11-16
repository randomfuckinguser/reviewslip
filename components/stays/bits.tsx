import { ImageOff, Star } from "lucide-react";

import type { Rating } from "@/lib/market";
import { count, photoSrc } from "@/lib/stays-format";
import type { StaysText } from "@/lib/stays-text";

import styles from "./stays.module.css";

/**
 * A marketplace photo, or a plain box saying there is none yet. The box is
 * honest rather than a stock picture: a guest booking on what they saw should
 * have seen this venue.
 */
export function Photo({
  id,
  alt,
  t,
  className = styles.photo,
  eager = false,
}: {
  id: number | null | undefined;
  alt: string;
  t: StaysText;
  className?: string;
  eager?: boolean;
}) {
  return (
    <div className={className}>
      {id ? (
        // eslint-disable-next-line @next/next/no-img-element -- proxied, already sized by the venue's upload
        <img src={photoSrc(id)} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" />
      ) : (
        <div className={styles.noPhoto}>
          <ImageOff size={22} aria-hidden />
          {t.photoMissing}
        </div>
      )}
    </div>
  );
}

/** The venue's average from its review sites, out of five, with the count. */
export function RatingBadge({ rating, t }: { rating: Rating | null; t: StaysText }) {
  if (!rating) return null;
  return (
    <span className={styles.rating}>
      <span className={styles.score}>{rating.average.toFixed(1)}</span>
      <Star size={13} aria-hidden fill="currentColor" />
      <span className={styles.muted}>{count(t, "review", rating.count)}</span>
    </span>
  );
}
