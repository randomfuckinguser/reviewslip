"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { LogOut, Menu, PanelLeft, UserRound, X } from "lucide-react";

import ThemeToggle from "@/components/ThemeToggle";
import type { Locale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";
import {
  customerNav,
  staffNav,
  type NavGroup,
  type NavItem,
  type Venue,
} from "./nav";

/**
 * The authenticated shell: one persistent Sidebar, and the page beside it.
 *
 * Shared by the customer dashboard and the staff host, which differ only in
 * what the nav lists. Laid out per the app standards (05-frontend.md,
 * Navigation): the collapse toggle alone in the header, Dashboard first, the
 * modules, a separator, the account-level entries, and a footer holding the
 * account menu and the theme toggle.
 *
 * On a phone (below 768px, app.css) the Sidebar is a drawer instead: the
 * Menu button at the top left opens it over the page, and choosing a screen,
 * the backdrop or Escape closes it. The same nav, so nothing is listed twice.
 */

const COLLAPSED_KEY = "rs:sidebar-collapsed";
const COLLAPSED_EVENT = "rs:sidebar";

/*
 * The collapsed choice lives in localStorage and is read as an external store,
 * not copied into state by an effect. The server snapshot is "expanded", so the
 * first paint matches the server's markup and the saved choice arrives with
 * hydration. `storage` covers a second tab; the custom event covers this one,
 * which the browser does not notify of its own writes.
 */
function watchCollapsed(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(COLLAPSED_EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(COLLAPSED_EVENT, notify);
  };
}

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

interface Props {
  kind: "customer" | "staff";
  /** Absent on the staff host, which has no locale routing. */
  lang?: Locale;
  email: string;
  venues?: Venue[];
  /** Adds the Admin group (Server) to the customer nav. */
  isAdmin?: boolean;
  children: React.ReactNode;
}

/* The theme itself is the site's (components/Theme.tsx, in the root layout):
   one system for the marketing pages and the app, so a choice made here holds
   on the public site too. */
export default function AppShell({ kind, lang, email, venues = [], isAdmin = false, children }: Props) {
  const pathname = usePathname();
  const params = useParams<{ slug?: string }>();

  const collapsed = useSyncExternalStore(watchCollapsed, readCollapsed, () => false);

  // The phone drawer is open for the screen it was opened on: moving to
  // another screen closes it with no effect to run.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const drawerOpen = openOn === pathname;
  const closeDrawer = () => setOpenOn(null);

  function toggle() {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "0" : "1");
    } catch {
      // Private mode: the choice lasts as long as the page.
    }
    window.dispatchEvent(new Event(COLLAPSED_EVENT));
  }

  const to = (path: string) => (lang ? localizedPath(lang, path) : path);

  /*
   * The venue being worked on: the one in the address, or the account's only
   * one. The second half matters on the screens with no venue in their address
   * (Businesses, Support, Refer a Business) — most accounts have exactly one
   * venue, and without it the nav would lose its modules every time one of
   * those was opened.
   */
  const venue =
    venues.find((v) => v.slug === params.slug) ??
    (venues.length === 1 ? venues[0] : null);

  const nav = kind === "staff" ? staffNav() : customerNav(venue, to, isAdmin);

  const isActive = (item: NavItem) =>
    pathname === item.href ||
    (!item.exact && pathname.startsWith(`${item.href}/`)) ||
    Boolean(item.also && pathname.startsWith(item.also));

  const group = (g: NavGroup, key: number) => (
    <div className="nav-group" key={key}>
      {g.label ? <div className="nav-label">{g.label}</div> : null}
      {g.items.map((item) =>
        item.external ? (
          // The phone: its own page, kept open on the desk, so a tab of its own.
          <a
            key={item.href}
            href={item.href}
            target="_blank"
            rel="noopener"
            className="nav-item"
            onClick={closeDrawer}
            title={collapsed ? item.title : undefined}
          >
            <item.icon size={16} aria-hidden="true" />
            <span>{item.title}</span>
          </a>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            className="nav-item"
            aria-current={isActive(item) ? "page" : undefined}
            onClick={closeDrawer}
            // The label is hidden in the rail, so the name has to come from here.
            title={collapsed ? item.title : undefined}
          >
            <item.icon size={16} aria-hidden="true" />
            <span>{item.title}</span>
          </Link>
        )
      )}
    </div>
  );

  return (
    <div
      className="app"
      data-collapsed={collapsed}
      data-drawer={drawerOpen ? "open" : undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape" && drawerOpen) closeDrawer();
      }}
    >
      {/* Phones only: opens the Sidebar as a drawer. */}
      <button
        type="button"
        className="icon-btn drawer-btn"
        onClick={() => setOpenOn(drawerOpen ? null : pathname)}
        aria-expanded={drawerOpen}
        aria-controls="app-sidebar"
        aria-label={drawerOpen ? "Close menu" : "Open menu"}
      >
        {drawerOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
      </button>
      <div className="drawer-backdrop" onClick={closeDrawer} aria-hidden="true" />

      <aside className="sidebar" id="app-sidebar" aria-label="Sidebar">
        <div className="sidebar-scroll">
          <div className="nav-group">
            <button
              type="button"
              className="nav-item sidebar-toggle"
              onClick={toggle}
              aria-expanded={!collapsed}
              title="Toggle Sidebar"
            >
              <PanelLeft size={16} aria-hidden="true" />
              <span>{kind === "staff" ? "Reviewslip Staff" : venue?.name ?? "Reviewslip"}</span>
            </button>
          </div>

          <nav aria-label="Primary" style={{ marginTop: "0.75rem" }}>
            {nav.modules.map(group)}
            {nav.last.items.length > 0 ? (
              <>
                {nav.modules.length > 0 ? <div className="nav-separator" /> : null}
                {group(nav.last, -1)}
              </>
            ) : null}
          </nav>
        </div>

        <div className="sidebar-footer">
          <AccountMenu email={email} login={to("/login")} collapsed={collapsed} />
          <ThemeToggle className="icon-btn theme-toggle" />
        </div>
      </aside>

      <div className="app-main">{children}</div>
    </div>
  );
}

/**
 * Who is signed in, and the way out.
 *
 * A <details>, so it opens and closes with no state of its own and works
 * before hydration.
 */
function AccountMenu({
  email,
  login,
  collapsed,
}: {
  email: string;
  login: string;
  collapsed: boolean;
}) {
  async function signOut() {
    // The cookie is httpOnly, so only the server can clear it. A full
    // navigation afterwards rather than a client one: everything cached for
    // this account should go with the session.
    await fetch("/api/auth", { method: "DELETE" }).catch(() => undefined);
    window.location.assign(login);
  }

  return (
    <details className="account">
      <summary className="nav-item" title={collapsed ? email : "Account"}>
        <UserRound size={16} aria-hidden="true" />
        <span className="account-name">{email}</span>
      </summary>
      <div className="account-menu">
        <p title={email}>{email}</p>
        <button type="button" className="nav-item" onClick={signOut}>
          <LogOut size={16} aria-hidden="true" />
          <span>Sign Out</span>
        </button>
      </div>
    </details>
  );
}
