import "server-only";

import { cookies } from "next/headers";

import type {
  BackgroundSummary,
  Derived,
  FontSummary,
  Palette,
} from "./theme";

/**
 * The review app's customer API, and the browser's half of a session.
 *
 * The review app owns the database — accounts, businesses, usage — and this site is
 * a client of it. Nothing here talks to Postgres: two codebases writing one
 * schema is how schemas rot.
 *
 * Calls go over loopback on the same box, so there is no TLS and no latency to
 * cache around. The session token lives only in an httpOnly cookie and is
 * forwarded as a bearer, which means the review app verifies who the caller is
 * rather than taking this site's word for it.
 */

const BASE = process.env.REVIEW_API_URL ?? "http://127.0.0.1:3000";

/** The review app's address, for the other server-side clients of it. */
export const REVIEW_API = BASE;

export const SESSION_COOKIE = "rs_session";

/**
 * A readable companion to the session cookie. Holds no secret — just "someone is
 * signed in" — so the nav can swap Sign in for Dashboard without the layout
 * reading cookies, which would opt every marketing page out of static rendering.
 *
 * It can lie: a session revoked server-side leaves this behind until the next
 * sign-out. The cost of that is a Dashboard link that bounces to /login, which is
 * the same thing that happens if you visit /dashboard directly.
 */
export const SIGNED_IN_COOKIE = "rs_signed_in";

/**
 * Matches the review app's own session lifetime, so the two expire together.
 *
 * SESSION_HOURS in accounts.js is the authority; this is the browser half of
 * the same decision and has to move with it. A cookie outliving its row means a
 * token sent on every request that the server has already forgotten, and a row
 * outliving its cookie means a session nobody can reach still in the table.
 */
const MAX_AGE_SECONDS = 24 * 60 * 60;

export interface ApiError extends Error {
  status: number;
}

function apiError(status: number, message: string): ApiError {
  return Object.assign(new Error(message), { status });
}

export async function call<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {}
): Promise<T> {
  const { method = "GET", body, token } = options;

  let res: Response;
  try {
    res = await fetch(`${BASE}/api/customer${path}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      // Account and usage data changes under us; a cached dashboard is a wrong
      // dashboard.
      cache: "no-store",
    });
  } catch {
    throw apiError(503, "Could not reach the service. Try again in a moment.");
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw apiError(
      res.status,
      typeof data?.error === "string" ? data.error : "Something went wrong."
    );
  }

  return data as T;
}

/**
 * The same, for a route that answers with text rather than JSON.
 *
 * Separate rather than a flag on `call`, because the two differ in how they
 * report failure as well as how they parse: a failing text route still answers
 * JSON, so the error path has to try that before giving up.
 */
export async function callText(
  path: string,
  options: { token?: string } = {}
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/customer${path}`, {
      headers: options.token ? { Authorization: `Bearer ${options.token}` } : {},
      cache: "no-store",
    });
  } catch {
    throw apiError(503, "Could not reach the service. Try again in a moment.");
  }

  const body = await res.text();

  if (!res.ok) {
    let message = "Something went wrong.";
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed?.error === "string") message = parsed.error;
    } catch {
      // A non-JSON error body is not worth showing raw.
    }
    throw apiError(res.status, message);
  }

  return body;
}

/**
 * A file from the review app, passed straight through.
 *
 * Unlike `callText` this does not read the body: the caller streams it on to
 * the browser, so nothing here buffers a picture in memory only to hand it
 * over. The whole response comes back rather than the body alone, because the
 * headers the review app set on it — the content type, and the ones that stop
 * a browser treating uploaded bytes as a document — are the part that must
 * survive the hop.
 *
 * Here rather than in the route so the base address stays in one file. The
 * first version of that route carried its own copy and named the wrong
 * environment variable, which would have worked in production by coincidence
 * and nowhere else.
 */
export async function callFile(
  path: string,
  options: { token?: string } = {}
): Promise<Response> {
  try {
    return await fetch(`${BASE}/api/customer${path}`, {
      headers: options.token ? { Authorization: `Bearer ${options.token}` } : {},
      cache: "no-store",
    });
  } catch {
    throw apiError(503, "Could not reach the service. Try again in a moment.");
  }
}

/* ---------------------------------------------------------------- sessions */

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Off in development, where the dev server is plain http and a secure
    // cookie would never be stored at all.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });

  store.set(SIGNED_IN_COOKIE, "1", {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(SIGNED_IN_COOKIE);
}

export async function sessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

/* ------------------------------------------------------------------ shapes */

export interface Account {
  id: number;
  email: string;
  username: string;
  plan: string;
  status: string;
  isAdmin?: boolean;
  /** Staff a venue invited to answer its calls: the phone, and nothing else. */
  phoneOnly?: boolean;
  createdAt: string;
}

export interface Session {
  account: Account;
  token: string;
  expiresAt: string;
}

export interface BusinessSummary {
  slug: string;
  name: string;
  status: string;
  url: string;
  createdAt: string;
  usage: { reviews: number; tokens: number; tokenLimit: number };
  ready: boolean;
  plan: string;
}

export interface Me {
  account: Account;
  plan: {
    id: string;
    name: string;
    businesses: number | null;
    /** The advertised total: the per-business limit times the plan's businesses. */
    reviewAllowance: number;
    /** What each business is actually held to, which is the meter that matters. */
    reviewsPerBusiness: number;
    tokensPerMonthPerBusiness: number;
  };
  usage: { reviewsThisMonth: number; businesses: number };
  canAddBusiness: boolean;
  businesses: BusinessSummary[];
}

/**
 * One invitation, as the review app describes it.
 *
 * `state` is a word rather than three dates because three nullable timestamps
 * have eight combinations and only these are real. Derived on the review app's
 * side so both ends agree on which one a given row is in.
 */
export interface Referral {
  id: number;
  /** The address the referrer named. A label — signing up with another still counts. */
  email: string;
  code: string;
  state: "invited" | "signed up" | "joined";
  invitedAt: string;
  signedUpAt: string | null;
  qualifiedAt: string | null;
}

/**
 * How far along the discount is.
 *
 * `percent` is 0 until `earned`, deliberately — the offer is all-or-nothing and
 * a number that grew with each referral would read as a promise.
 */
export interface ReferralProgress {
  qualified: number;
  needed: number;
  remaining: number;
  earned: boolean;
  /** What this account has now: zero until `earned`. */
  percent: number;
  /** What the offer is worth, so neither end hard-codes "20". */
  worth: number;
}

export interface Referrals {
  referrals: Referral[];
  progress: ReferralProgress;
  /**
   * Whether this deployment can actually send an invitation.
   *
   * False when the review app has no SES configured, which is how referrals
   * shipped. The page must describe the button by what it will really do —
   * promising an email from a box that cannot send one is a lie the customer
   * has no way to check until somebody tells them nothing arrived.
   *
   * Optional so a dashboard running ahead of the review app does not crash on
   * a field that deploy has not got yet.
   */
  mail?: { enabled: boolean };
}

/* ------------------------------------------------------------ reservations */

/**
 * Dates here are calendar dates, always 'YYYY-MM-DD', never Date objects.
 *
 * The review app stores them as Postgres `date` and hands them over as strings
 * deliberately — a night is a day at the property, not an instant, and turning
 * one into a Date at local midnight is how it becomes the day before. Keep them
 * strings; format for display, never for storage.
 */
export type NightDate = string;

/** A room type: the thing that is sold. */
export interface RoomGroup {
  id: number;
  name: string;
  capacity: number;
  sort: number;
  /** How many physical rooms are in it. */
  rooms: number;
}

/** A physical room. */
export interface Room {
  id: number;
  groupId: number;
  groupName: string | null;
  name: string;
  /**
   * What state the room is in: active, not_selling or renovating.
   *
   * `out_of_service` is the old second state and still reads as renovating —
   * see roomstatus.js in the review app, which owns what each one stops.
   */
  status: string;
  /**
   * Whether it can be given to somebody today: clean or dirty.
   *
   * Separate from `status` on purpose. A room being refurbished is out of
   * service; a room somebody left this morning is dirty. One is a decision, the
   * other is a chore.
   */
  housekeeping: "clean" | "dirty";
  sort: number;
}

export type BookingStatus =
  | "confirmed"
  | "in_house"
  | "checked_out"
  | "cancelled"
  | "no_show";

export interface Booking {
  id: number;
  groupId: number;
  groupName: string | null;
  /** Null while nobody has assigned it — which is normal, not an error. */
  roomId: number | null;
  roomName: string | null;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  adults: number;
  children: number;
  arrival: NightDate;
  departure: NightDate;
  nights: number;
  status: BookingStatus;
  source: string;
  notes: string | null;
  ratePlanId: number | null;
  /** What it was quoted, frozen at the time. Null means unpriced, not free. */
  totalMinor: number | null;
  total: string | null;
  createdAt: string;
}

/** One room-night that is spoken for. */
export interface TakenNight {
  roomId: number;
  night: NightDate;
  bookingId: number;
  guestName: string;
  status: BookingStatus;
  arrival: NightDate;
  departure: NightDate;
  source: string;
}

/**
 * A window of the diary.
 *
 * `taken` is a flat list rather than a grid: the API sends one row per
 * room-night, and the page builds the grid. Sending it pre-shaped would repeat
 * each booking once per night it covers.
 */
/** Which date a range asks about. "stay" overlaps the window. */
export type BookingDateMode = "stay" | "arrival" | "departure";

/**
 * The filters the server actually applied.
 *
 * Echoed back rather than assumed, so the chips on screen are drawn from what
 * was used. A page that keeps its own copy will eventually show a filter as
 * active that the server discarded as unreadable — and then the rows and the
 * chips are telling two different stories.
 */
export interface BookingFilters {
  statuses: BookingStatus[] | null;
  groupId: number | null;
  /** Zero means "no room yet". */
  roomId: number | null;
  from: NightDate | null;
  to: NightDate | null;
  on: BookingDateMode;
  q: string;
  limit: number;
}

export interface BookingList {
  bookings: Booking[];
  total: number;
  /** Null on the last page. Opaque: 'YYYY-MM-DD:id'. */
  nextCursor: string | null;
  filters: BookingFilters;
}

export interface CalendarWindow {
  start: NightDate;
  nights: NightDate[];
  rooms: Room[];
  taken: TakenNight[];
  unassigned: Booking[];
}

/** A room as the day view lists it — identity and state, no group id. */
export interface DeskRoom {
  id: number;
  name: string;
  groupName: string | null;
  status: string;
  housekeeping: "clean" | "dirty";
}

export interface DayView {
  date: NightDate;
  arrivals: Booking[];
  departures: Booking[];
  inHouse: Booking[];
  rooms: DeskRoom[];
  /**
   * The numbers a morning is actually run from.
   *
   * `toCheckIn` and `toCheckOut` count what is still outstanding, not what
   * exists — an arrivals list of eight with seven already in is a quiet
   * morning, and a count that said eight would not say so.
   */
  counts: {
    arrivals: number;
    departures: number;
    inHouse: number;
    toCheckIn: number;
    toCheckOut: number;
    dirty: number;
    unassignedArrivals: number;
  };
}

/* ----------------------------------------------------------------- support */

export interface TicketMessage {
  id: number;
  body: string;
  fromStaff: boolean;
  createdAt: string;
}

export interface Ticket {
  id: number;
  title: string;
  body: string;
  status: "open" | "answered" | "closed";
  /** open or answered. `answered` is still active — it is not finished. */
  active: boolean;
  venue: { slug: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketList {
  tickets: Ticket[];
  /** The one that is going, if any. At most one by design. */
  active: Ticket | null;
  canOpen: boolean;
}

export interface TicketThread {
  ticket: Ticket;
  messages: TicketMessage[];
}

/** A queue row: the ticket plus who it is from. */
export interface StaffTicket extends Ticket {
  account: { id: number; email: string };
  messages: number;
  lastMessage: string | null;
}

export interface StaffTicketThread extends TicketThread {
  account: { id: number; email: string };
}

/**
 * Today's rooms, for the widget on the venue page.
 *
 * A summary, not a screen — every number here has a page behind it. The last
 * three are the ones that need somebody: a stay with no room, a room that needs
 * cleaning, a guest not yet notified to Immigration.
 */
export interface BookingSummary {
  date: NightDate;
  rooms: number;
  /** Rooms sold tonight as a percentage. Zero when no rooms are set up. */
  occupancy: number;
  staying: number;
  arrivals: number;
  toCheckIn: number;
  departures: number;
  toCheckOut: number;
  unassigned: number;
  dirty: number;
  tm30Pending: number;
}

/* ------------------------------------------------------------------ guests */

/**
 * Somebody on a booking, for Thailand's TM30 notification.
 *
 * The passport number is never in this shape. `passportTail` is the last four
 * characters — enough to confirm the right document is in hand at a desk, and
 * enough for nobody to do anything else with. The whole number exists only
 * inside the export file, which is a download somebody deliberately asks for.
 */
export interface BookingGuest {
  id: number;
  bookingId: number;
  familyName: string;
  firstName: string;
  middleName: string | null;
  nationality: string | null;
  dateOfBirth: NightDate | null;
  phone: string | null;
  /** When they entered Thailand, which is not when they reached this property. */
  arrivedInThailand: NightDate | null;
  passportTail: string | null;
  hasPassport: boolean;
  notifiedAt: string | null;
  /**
   * Whether somebody has overruled the nationality rule for this guest.
   *
   * Null is the ordinary case and means "decide from nationality" — not
   * "exempt". True reports them regardless, false leaves them out. Three states
   * because the rule has no way to know about a Thai-passport holder the
   * immigration office asked to be reported, or a resident who was not.
   */
  tm30Required: boolean | null;
  /**
   * Whether this guest goes on the notification, after the override.
   *
   * Thai nationals are out — section 38 is a foreigner notification — and a
   * guest with no nationality recorded is in, because omitting somebody is a
   * fine and including somebody is a line Immigration ignores.
   */
  reportable: boolean;
  /** Whether the record has everything the notification asks for. */
  ready: boolean;
  missing: string[];
}

export interface GuestList {
  guests: BookingGuest[];
  /** False when the server has no encryption key, so passports are refused. */
  canStorePassports: boolean;
}

export interface Tm30Pending {
  pending: (BookingGuest & {
    arrival: NightDate;
    departure: NightDate;
    roomName: string | null;
  })[];
  ready: number;
  incomplete: number;
}

/* ------------------------------------------------------------------- rates */

/**
 * Money crosses the wire twice: `*Minor` as a whole number of satang for
 * arithmetic, and a formatted string for display.
 *
 * Never a float in either direction. The minor value is the truth; the string
 * is what a person reads. Doing the formatting once, on the side that owns the
 * currency, is also what stops two screens disagreeing about whether to show
 * the decimals.
 */
export interface RatePlan {
  id: number;
  groupId: number;
  groupName: string | null;
  name: string;
  /** Null when nobody has priced it yet — which is not the same as free. */
  baseMinor: number | null;
  base: string | null;
}

export interface RateNight {
  night: NightDate;
  amountMinor: number | null;
  amount: string | null;
  minNights: number | null;
  closed: boolean;
  closedToArrival: boolean;
  /** True when this night is priced differently from the plan's base. */
  override: boolean;
}

export interface RateCalendar {
  nights: NightDate[];
  plans: (RatePlan & { byNight: RateNight[] })[];
}

export interface Quote {
  planId: number;
  planName: string;
  nights: number;
  totalMinor: number | null;
  total: string | null;
  perNight: { night: NightDate; amountMinor: number | null; amount: string | null }[];
  /** False when a restriction forbids it — closed, closed to arrival, min stay. */
  sellable: boolean;
  reason: string | null;
}

export interface Availability {
  arrival: NightDate;
  departure: NightDate;
  nights: number;
  groups: { groupId: number; name: string; rooms: number; free: number }[];
}

/* ------------------------------------------------------------------- staff */

/** An account as the staff list shows it. */
export interface StaffAccount extends Account {
  venues: number;
  referrals: { total: number; qualified: number };
  progress: ReferralProgress;
}

export interface StaffVenue {
  slug: string;
  name: string;
  status: string;
  url: string;
  createdAt: string;
  /** Null when the owning account was deleted — the venue keeps serving. */
  owner: { id: number; email: string } | null;
  reviews: number;
  lastReview: string | null;
}

/** One account's venue, with the numbers the staff view cares about. */
export interface StaffAccountVenue {
  slug: string;
  name: string;
  status: string;
  url: string;
  createdAt: string;
  ready: boolean;
  reviews: number;
  taken: number;
  lastReview: string | null;
}

export interface StaffReferral extends Referral {
  /** The address they actually signed up with, when it differs from `email`. */
  joinedAs: string | null;
}

export interface StaffAccountDetail {
  account: Account;
  plan: {
    id: string;
    name: string;
    venues: number | null;
    reviewsPerBusiness: number;
    tokensPerMonthPerBusiness: number;
  };
  venues: StaffAccountVenue[];
  referrals: { invited: StaffReferral[]; progress: ReferralProgress };
  referredBy: { id: number; email: string; qualified: boolean } | null;
}

/**
 * The signed-in account, but only if it is staff.
 *
 * Returns null for a stranger, a signed-in customer, and a review app too old
 * to send `isAdmin` — three situations the caller must not tell apart, because
 * every one of them has to produce the same not-found page. A 403 anywhere here
 * would confirm the pages exist.
 */
export async function currentStaff(): Promise<Me | null> {
  const me = await currentUser();
  return me?.account.isAdmin === true ? me : null;
}

/** A setting as the review app describes it: the value, and where it came from. */
export interface Setting<T> {
  value: T;
  source: "subscriber" | "env" | "default";
}

export interface BusinessSettings {
  apiKey: { set: boolean; hint: string; source: string };
  model: Setting<string>;
  googleUrl: Setting<string>;
  tripadvisorUrl: Setting<string>;
  websiteUrl: Setting<string>;
  /**
   * Topics, in the dashboard's words. `categories` is the field the API uses.
   *
   * `focus` is the topic's description, and it is now the only thing the writer
   * is ever told about the business — the separate description, location and
   * verified-detail fields it used to sit beside are gone.
   */
  /**
   * `locked` is absent rather than false on an unlocked topic — the review app
   * stores it only when true, to keep a column read on every guest page load
   * from carrying fifty `false`s.
   */
  categories: Setting<
    { id: string; label: string; focus: string; locked?: boolean }[]
  >;
  /**
   * Review sites this venue has said it is not on, by platform id.
   *
   * Optional because the review app deploys separately — a dashboard running
   * ahead of it gets nothing here and must not fall over on that.
   *
   * It exists so "no Tripadvisor link yet" and "we are not on Tripadvisor" stop
   * looking identical. Without the distinction a venue that only uses Google
   * can never finish its setup checklist, so the checklist nags forever and
   * people stop reading it.
   */
  platformsOff?: Setting<string[]>;
  /**
   * The four colours the guest page and the table card are built from, plus what
   * they derive to. `derived` is the palette actually served — the contrast
   * checks in the review app's theme.js may have moved a colour, and `adjusted`
   * says in words which ones and why.
   */
  theme: Setting<Palette> & {
    derived: Derived;
    adjusted: string[];
    /**
     * The typefaces actually taken off the site, described without the file.
     *
     * Optional because the review app deploys separately: a dashboard running
     * ahead of it will not get this, and must not fall over on that.
     */
    fonts?: { display: FontSummary | null; ui: FontSummary | null };
    /** The hero photograph, described without the file. */
    background?: BackgroundSummary | null;
    /**
     * Whether the venue's name is printed under its logo.
     *
     * Worked out by the review app rather than by each screen, because three
     * of them ask and the rule is not obvious: a logo hides the name unless
     * somebody asked for both, and no logo always shows it. Optional for the
     * usual reason — a dashboard running ahead of the review app reads the
     * absence as true, which is the card exactly as it was.
     */
    showName?: boolean;
  };
  limits: { categories: number; description: number };
}

// Re-exported as types only. The shape lives in lib/theme.ts because the theme
// editor is a client component and this module is server-only; a value imported
// from here would drag cookies() into the browser bundle.
export type {
  Palette,
  Derived,
  StoredFont,
  FontSummary,
  StoredBackground,
  BackgroundSummary,
} from "./theme";

/** One line of the setup checklist. */
export interface SetupStep {
  id: string;
  label: string;
  done: boolean;
  /** Whether not doing it stops a review being written or posted at all. */
  blocks: boolean;
  note: string;
}

/** What a venue has decided about one review site. */
export interface SetupSite {
  id: string;
  label: string;
  url: string;
  linked: boolean;
  /** Explicitly marked as not used, so the checklist can finish without it. */
  off: boolean;
}

export interface SetupProgress {
  steps: SetupStep[];
  sites: SetupSite[];
  done: number;
  total: number;
  complete: boolean;
  /** Whether the guest page can do its job at all. */
  canTakeReviews: boolean;
  /** What the venue still has to do. Never the writing key, which is ours. */
  blocking: string[];
  /** The venue has finished its side and is waiting on us to fit the key. */
  waitingOnUs: boolean;
}

export interface BusinessDetail {
  setup: SetupProgress;
  business: {
    slug: string;
    name: string;
    status: string;
    url: string;
    createdAt: string;
  };
  settings: BusinessSettings;
  stats: {
    month: { reviews: number; tokens: number; tokenLimit: number };
    lifetime: { reviews: number; tokens: number; lastAt: string | null };
    daily: { day: string; reviews: number; tokens: number }[];
    byCategory: { category: string; reviews: number }[];
  };
}

/**
 * The signed-in account and its businesses, or null.
 *
 * Null covers both "no cookie" and "the token was rejected" — to a caller those
 * are the same thing: sign in again. Anything else, such as the service being
 * unreachable, is thrown: showing a signed-out page when the truth is "we
 * cannot tell" would log people out on every blip.
 */
/**
 * A venue's name, for a page header's second line.
 *
 * Falls back to the slug rather than failing: the header is a label, and the
 * page beneath it does its own ownership check and will refuse on its own
 * terms if this account has no such venue.
 */
export async function venueName(slug: string): Promise<string> {
  const me = await currentUser();
  return me?.businesses.find((b) => b.slug === slug)?.name ?? slug;
}

export async function currentUser(): Promise<Me | null> {
  const token = await sessionToken();
  if (!token) return null;

  try {
    return await call<Me>("/me", { token });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) return null;
    throw err;
  }
}

/* ------------------------------------------------------------ welcome page */

export interface WelcomeLink {
  label: string;
  url: string;
}

/** A guest who signed up on the welcome page. */
export interface WelcomeSignup {
  id: number;
  name: string;
  email: string;
  /** Agreed to marketing email. Only these are in the mailing list. */
  consent: boolean;
  consentedAt: string | null;
  createdAt: string;
}

export interface WelcomeData {
  /** The page the QR code opens, on the venue's own address. */
  url: string;
  links: WelcomeLink[];
  limits: { links: number; label: number };
  signups: WelcomeSignup[];
}
