import "server-only";

import { REVIEW_API } from "@/lib/customer";

/**
 * The review app's marketplace API, as this site's server calls it.
 *
 * No session: these are the public pages a guest books from. Fetched fresh,
 * because availability and prices change under every page.
 */

export interface Contact {
  phone: string;
  email: string;
  line: string;
  whatsapp: string;
}

export interface MarketProfile {
  about: string;
  amenities: string[];
  contact: Contact;
  checkIn: string;
  checkOut: string;
  payment: { mode: "full" | "deposit"; depositPct: number | null };
}

export interface Rating {
  average: number;
  count: number;
}

export interface SearchResult {
  slug: string;
  name: string;
  place: string | null;
  currency: string;
  photo: number | null;
  rating: Rating | null;
  amenities: string[];
  from: {
    roomName: string;
    planName: string;
    totalMinor: number;
    perNightMinor: number;
    roomsLeft: number;
  } | null;
  breakfast: boolean;
  freeCancel: boolean;
}

export interface Offer {
  planId: number;
  name: string;
  breakfast: boolean;
  cancelDays: number | null;
  freeCancelUntil: string | null;
  totalMinor: number | null;
  perNightMinor: number | null;
  dueNowMinor: number | null;
  bookable: boolean;
  reason: string | null;
}

export interface RoomProfile {
  description: string;
  bed: string;
  sizeSqm: number | null;
  amenities: string[];
}

export interface VenueRoom {
  id: number;
  name: string;
  capacity: number;
  profile: RoomProfile;
  photos: number[];
  free: number | null;
  fits: boolean | null;
  offers: Offer[];
}

export interface Venue {
  slug: string;
  name: string;
  place: string | null;
  currency: string;
  reviewUrl: string;
  profile: MarketProfile;
  photos: number[];
  rating: Rating | null;
  stay: { arrival: string; departure: string; nights: number; adults: number; children: number; rooms: number } | null;
  rooms: VenueRoom[];
}

export interface BookingView {
  reference: string;
  status: "confirmed" | "cancelled";
  cancelledAt: string | null;
  cancelledBy: "guest" | "venue" | null;
  cancellable: boolean;
  /** Dates or guests can be changed online: inside the window, and the rate still exists. */
  changeable: boolean;
  /** Beds across the booking's rooms: the most guests a change can ask for. */
  maxGuests: number;
  venue: { slug: string; name: string; place: string | null; contact: Contact };
  checkIn: string;
  checkOut: string;
  currency: string;
  guestName: string;
  guestEmail: string;
  roomName: string;
  planName: string | null;
  breakfast: boolean;
  freeCancelUntil: string | null;
  arrival: string;
  departure: string;
  nights: number;
  rooms: number;
  adults: number;
  children: number;
  requests: string | null;
  totalMinor: number | null;
}

export interface MarketError extends Error {
  status: number;
  totalMinor?: number;
}

export async function market<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${REVIEW_API}/api/market${path}`, {
      method: options.method ?? "GET",
      headers: options.body ? { "Content-Type": "application/json" } : {},
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw Object.assign(new Error("Could not reach the booking service. Try again in a moment."), {
      status: 503,
    });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(
      new Error(typeof data?.error === "string" ? data.error : "Something went wrong."),
      { status: res.status, totalMinor: data?.totalMinor }
    );
  }
  return data as T;
}

/* ------------------------------------------------------- the venue's side */

export interface MarketPlan {
  id: number;
  name: string;
  baseMinor: number | null;
  breakfast: boolean;
  cancelDays: number | null;
}

export interface MarketRoom {
  id: number;
  name: string;
  capacity: number;
  profile: RoomProfile;
  photos: number[];
  plans: MarketPlan[];
}

/** What the dashboard's Online Booking screen edits. */
export interface MarketSettings {
  listed: boolean;
  place: string;
  currency: string;
  profile: MarketProfile;
  photos: number[];
  amenities: { venue: string[]; room: string[] };
  limits: { venuePhotos: number; roomPhotos: number };
  rooms: MarketRoom[];
}

/** What changing a booking would cost, before anything changes. */
export interface ChangeQuote {
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  totalMinor: number;
  oldTotalMinor: number | null;
  freeCancelUntil: string | null;
}
