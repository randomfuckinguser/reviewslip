import {
  Activity,
  BedDouble,
  Building2,
  CalendarCheck,
  CalendarDays,
  Gift,
  HandHeart,
  LayoutDashboard,
  LifeBuoy,
  List,
  MessageSquareText,
  Phone,
  PhoneCall,
  QrCode,
  Settings,
  Stamp,
  Globe,
  GraduationCap,
  Tag,
  Ticket,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * The one nav config. The Sidebar reads it and nothing else lists the app's
 * screens, so a screen is added to the nav here only.
 *
 * Every row has an icon, because the icons are what is left when the Sidebar
 * collapses to its rail.
 */

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Active only on this exact path, not on the screens beneath it. */
  exact?: boolean;
  /** A second prefix that also belongs to this entry: a List at one address whose
   *  records open at another. */
  also?: string;
  /** Not a page of this site: the phone, which the review app serves beside
   *  it. A plain link, so the client router never tries to load it. */
  external?: boolean;
}

export interface NavGroup {
  /** Shown above the group. The first and last groups go without. */
  label?: string;
  items: NavItem[];
}

export interface Venue {
  slug: string;
  name: string;
}

/**
 * The customer dashboard's nav.
 *
 * `to` localises a path; it is passed in because only the caller knows the
 * language. `venue` is the one being worked on — from the address, or the
 * account's only one — and without it there is nothing venue-shaped to list.
 *
 * Bookings has its own group, in the order the front desk uses it through the
 * day, not alphabetical: who is arriving comes before what a night costs.
 */
export function customerNav(
  venue: Venue | null,
  to: (path: string) => string,
  isAdmin = false
): { modules: NavGroup[]; last: NavGroup } {
  const at = (path = "") => to(`/dashboard/${venue?.slug}${path}`);

  const modules: NavGroup[] = venue
    ? [
        {
          items: [
            { title: "Dashboard", href: at(), icon: LayoutDashboard, exact: true },
          ],
        },
        {
          // The venue's name heads the whole sidebar, so its group is named
          // for what is in it.
          label: "Guests",
          items: [
            { title: "Reviews", href: at("/reviews"), icon: MessageSquareText },
            { title: "Table Card", href: at("/poster"), icon: QrCode },
            { title: "Guest App", href: at("/welcome"), icon: HandHeart },
            { title: "Phone", href: "/phone/", icon: Phone, external: true },
            { title: "Calls", href: at("/calls"), icon: PhoneCall },
          ],
        },
        {
          label: "Bookings",
          items: [
            { title: "Today", href: at("/bookings"), icon: CalendarCheck, exact: true },
            { title: "Calendar", href: at("/bookings/calendar"), icon: CalendarDays },
            { title: "Bookings", href: at("/bookings/list"), icon: List },
            { title: "Rooms", href: at("/bookings/rooms"), icon: BedDouble },
            { title: "Rates", href: at("/bookings/rates"), icon: Tag },
            { title: "Online Booking", href: at("/bookings/online"), icon: Globe },
            { title: "TM30", href: at("/bookings/tm30"), icon: Stamp },
            { title: "Tutorials", href: at("/tutorials"), icon: GraduationCap },
          ],
        },
      ]
    : [];

  // Admin accounts see the server's health here too, without going to the
  // staff host, and answer Reviewslip's own Sales and Support on their phone.
  // Everybody else never sees the group.
  if (isAdmin) {
    modules.push({
      label: "Admin",
      items: [
        { title: "Server", href: to("/dashboard/server"), icon: Activity },
        { title: "Sales & Support Phone", href: "/phone/reviewslip/", icon: Phone, external: true },
      ],
    });
  }

  return {
    modules,
    last: {
      items: [
        { title: "Businesses", href: to("/dashboard"), icon: Building2, exact: true },
        { title: "Refer a Business", href: to("/dashboard/referrals"), icon: Gift },
        { title: "Support", href: to("/dashboard/support"), icon: LifeBuoy },
        ...(venue
          ? [{ title: "Settings", href: at("/settings"), icon: Settings }]
          : []),
      ],
    },
  };
}

/**
 * The staff host's nav. No locale and no /admin prefix: proxy.ts maps every
 * path on that host under /admin, so these are the addresses as staff see them.
 */
export function staffNav(): { modules: NavGroup[]; last: NavGroup } {
  return {
    modules: [
      {
        items: [{ title: "Accounts", href: "/", icon: Users, exact: true, also: "/accounts" }],
      },
      {
        items: [
          { title: "Tickets", href: "/tickets", icon: Ticket },
          { title: "Venues", href: "/venues", icon: Building2 },
          { title: "Server", href: "/server", icon: Activity },
        ],
      },
    ],
    last: { items: [] },
  };
}
