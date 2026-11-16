"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

/** True once the client is running: false on the server and while hydrating. */
function useHydrated() {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );
}

/**
 * The Sun/Moon toggle, the same one in the app's Sidebar and the site's header.
 *
 * The theme is not known until the client has looked, so the label waits for
 * it. The icon does not: both glyphs are rendered and `.dark` shows one, which
 * is what keeps the button from flashing the wrong one on load. It shows where
 * a press will take you — the moon in light, the sun in dark.
 */
export default function ThemeToggle({ className }: { className: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = useHydrated() && resolvedTheme === "dark";
  const label = dark ? "Switch to Light Mode" : "Switch to Dark Mode";

  return (
    <button
      type="button"
      className={className}
      onClick={() => setTheme(dark ? "light" : "dark")}
      title={label}
      aria-label={label}
    >
      <Sun size={16} className="theme-sun" aria-hidden="true" />
      <Moon size={16} className="theme-moon" aria-hidden="true" />
    </button>
  );
}
