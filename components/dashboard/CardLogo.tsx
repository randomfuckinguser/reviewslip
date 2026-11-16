"use client";

import { useEffect, useState } from "react";

/**
 * The venue's mark on the printed card, with a white plate behind it only if
 * it needs one.
 *
 * The plate exists because a great many logos are dark type on a transparent
 * background, drawn for a white page — and on the block of ground colour at
 * the top of the card those vanish entirely. But a logo that already carries
 * its own white background gets plated twice: a white slab inside a navy
 * block, with the real mark floating somewhere in the middle of it. That is
 * what this decides between.
 *
 * Measured rather than guessed, because nothing about the stored data URI says
 * which kind it is. The image goes onto a small canvas and the alpha channel
 * is read: a logo with no transparency brought its own background and needs
 * nothing from us. A data URI is same-origin, so the canvas is not tainted and
 * the pixels can actually be read.
 *
 * A client component for one reason — canvas — and it starts out assuming the
 * plate is needed. That is the safe way round: the first paint of an unknown
 * logo is legible, and the only thing that changes on measurement is a plate
 * disappearing. Printing happens long after.
 */
export default function CardLogo({
  src,
  alt,
  plateClass,
  logoClass,
}: {
  src: string;
  alt: string;
  plateClass: string;
  logoClass: string;
}) {
  const [plate, setPlate] = useState(true);

  useEffect(() => {
    let dropped = false;

    const img = new Image();
    img.onload = () => {
      try {
        // Small on purpose. This is one yes-or-no question about the alpha
        // channel, and a 64px thumbnail answers it as well as the original.
        const side = 64;
        const canvas = document.createElement("canvas");
        canvas.width = side;
        canvas.height = side;

        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        context.drawImage(img, 0, 0, side, side);

        const { data } = context.getImageData(0, 0, side, side);
        let clear = 0;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] < 250) clear++;
        }

        /*
         * A tenth of the image. Anti-aliased edges leave a fringe of
         * part-transparent pixels on any logo, so "any transparency at all"
         * would keep the plate on every mark ever drawn; a logo that is
         * genuinely transparent is mostly transparent, because a wordmark is
         * thin strokes on a lot of nothing.
         */
        const transparent = clear / (data.length / 4) > 0.1;
        if (!dropped) setPlate(transparent);
      } catch {
        // Keep the plate. An unreadable canvas is not a reason to print a
        // card with an invisible logo on it.
      }
    };

    img.src = src;
    return () => {
      dropped = true;
    };
  }, [src]);

  return (
    <span className={plate ? plateClass : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={logoClass} src={src} alt={alt} />
    </span>
  );
}
