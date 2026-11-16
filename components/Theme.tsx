"use client";

import { ThemeProvider } from "next-themes";

/**
 * One theme system for the whole site: marketing, sign-in and the app
 * (05-frontend.md). The OS decides until somebody presses a toggle, and then
 * their choice sticks, on every page.
 *
 * A client component of its own only because the root layout is a server
 * component and cannot render the provider directly.
 */
export default function Theme({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
