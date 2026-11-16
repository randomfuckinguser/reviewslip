"use client";

import { useEffect } from "react";

import type { Embed } from "@/lib/stays-format";

/**
 * Black or white text on the host's accent, whichever reads: a pale brand
 * colour with white text on it is a button nobody can read.
 */
function inkOn(hex: string): string {
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.179 ? "#111111" : "#ffffff";
}

/**
 * The Stays pages inside another website's iframe.
 *
 * Marks the page so the site's header and footer drop away (globals.css,
 * `body:has([data-embed])`), paints the host's accent onto the main buttons,
 * and tells the host page how tall the content is so its iframe can grow to
 * fit — an iframe with its own scrollbar inside a page is the thing every
 * booking embed gets wrong. public/embed.js listens for these messages.
 *
 * Messages are posted to any origin because the host can be any website; they
 * carry nothing but a height and "the page changed".
 */
export default function EmbedFrame({ embed, children }: { embed: Embed; children: React.ReactNode }) {
  useEffect(() => {
    if (!embed.on || window.parent === window) return;
    const post = (type: string, data: Record<string, unknown> = {}) =>
      window.parent.postMessage({ source: "reviewslip", type, ...data }, "*");

    // A new page inside the frame: the host scrolls the frame's top into view,
    // or the guest lands half way down a page they did not scroll.
    post("navigate", { path: window.location.pathname });

    let last = 0;
    const measure = () => {
      const height = Math.ceil(document.documentElement.scrollHeight);
      if (Math.abs(height - last) > 1) {
        last = height;
        post("height", { height });
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    measure();
    return () => observer.disconnect();
  }, [embed.on]);

  if (!embed.on) return <>{children}</>;

  const style = embed.accent
    ? ({ "--marigold": `#${embed.accent}`, "--marigold-ink": inkOn(embed.accent) } as React.CSSProperties)
    : undefined;

  return (
    <div data-embed="" data-embed-theme={embed.theme === "auto" ? undefined : embed.theme} style={style}>
      {children}
    </div>
  );
}
