# Reviewslip booking on any website

Two ways to put Reviewslip's booking pages — search, venue, checkout, Manage Booking — on another
website: a hotel's own site, a partner, a travel blog, on any platform. Either way, every search, price
and booking comes from Reviewslip, and bookings land on the venue's Reviewslip calendar exactly as if
the guest had booked on reviewslip.com. The other site keeps no availability, prices or bookings.

| | 1. Embed | 2. Build your own |
|---|---|---|
| Who | Anyone who can paste HTML | A developer (or a coding assistant) |
| Works on | Any website: WordPress, Wix, Squarespace, Webflow, Shopify, plain HTML | Any stack |
| Looks like | Reviewslip's pages, in the host's button colour | Whatever the site wants |
| Effort | Two lines | A day or two with the prompt below |

## 1. Embed (two lines, any website)

Paste where the booking pages should appear:

```html
<div data-reviewslip-booking data-venue="baanponglodge"></div>
<script src="https://reviewslip.com/embed.js" async></script>
```

On WordPress, use a "Custom HTML" block; on Wix, an "Embed code" element; on Squarespace, a "Code"
block; elsewhere, wherever the platform takes raw HTML.

| Option on the div | Does |
|---|---|
| `data-venue="slug"` | One venue only (its Reviewslip address): search goes straight to it, no other venues shown. Leave it out for every listed venue. |
| `data-place="Chiang Mai"` | Every venue, starting with this search. |
| `data-lang="th"` | Language: en th zh ja ko es fr de it pt nl. Default: the page's own language, else English. |
| `data-accent="#1f4fa3"` | The host site's colour for the main buttons; text on them turns black or white to stay readable. |
| `data-theme="dark"` | `light` (default), `dark`, or `auto` to follow the visitor's setting. |
| `data-height="720"` | Starting height in pixels, before the page reports its own. |

The pages run in a frame on reviewslip.com without Reviewslip's header or footer. The frame grows to fit
its content — no scrollbar inside the page — and scrolls back into view when the guest moves on. Every
step, including Manage Booking, stays inside it. Several embeds on one page work independently. The
guest's confirmation email links to the booking on reviewslip.com.

The softphone Call button works inside the frame with no setup on the host site, because the frame is
reviewslip.com.

## 2. Build your own (the prompt)

For a site that wants its own design. Paste everything below the line into a coding assistant (Claude
Code, Cursor or similar) opened on the project the page goes into, after filling in the three lines
under "Your setup". Attach screenshots of reviewslip.com/stays if you have them.

Checked against the live API on 2026-10-08. The six "(demo)" venues listed there are test data and can
be used while building.

---

# Build a booking page that books Reviewslip venues

## Your setup

- Site and stack: [any — Next.js, Astro, WordPress theme, Laravel, plain HTML and JavaScript…]
- Which venues: [every listed Reviewslip venue — or one venue only: its slug, e.g. `baanponglodge`]
- Languages: [English — add any of th, zh, ja, ko, es, fr, de, it, pt, nl]

## What you are building

A guest-facing booking flow, trip.com style, for small independent hotels:

1. **Search bar** — where, check-in, check-out, guests and rooms, Search.
2. **Results** — the venues with a room for that party and those dates, cheapest offer on the right.
3. **Venue page** — photos, rooms, and each room's rates in rows with Reserve.
4. **Checkout** — the guest's details beside a summary of the stay; Confirm Booking.
5. **Booking page** — the confirmation, plus **Manage Booking**: change the dates or guests, or cancel.

If "Which venues" names one venue, skip the results page: the search bar goes straight to that venue's
page with the dates filled in.

**Reviewslip owns the data.** Every venue, room, price, availability count and booking lives in
Reviewslip and is read from its marketplace API on every page view. You never store, cache or compute
any of it. A booking made on this page is a real booking on the venue's Reviewslip calendar; the venue
sees it, gets the email, and manages it there. Guests have no accounts: a booking reopens by its
reference and a key.

## The API

Base URL: `https://api.reviewslip.com/api/market`

- **Call it from the browser or from your server** — it answers cross-origin requests from any website
  (CORS `*`, no cookies, no credentials). Plain `fetch` with `Content-Type: application/json` for POSTs.
  Photos are plain image URLs (`<img src="…/photos/85">`).
- **Never cache** a search, venue or booking response (`cache: "no-store"`): availability and prices
  change between page views.
- **Money** is an integer in the currency's smallest unit (`totalMinor: 1580000` = THB 15,800). Format
  with `Intl.NumberFormat(locale, { style: "currency", currency })`, dropping decimals when the amount
  is whole. Never use floats for money.
- **Dates** are `YYYY-MM-DD` calendar days. `departure` is the morning the guest leaves, so 18 → 20 is
  two nights. "Today" is today in Thailand (`Asia/Bangkok`), where every venue is.
- **Errors** come back as JSON `{ "error": "…" }`. A 4xx message is written for the guest — show it as
  it is. Treat 404 as "not found", 409 as "something changed, look again", 429 as "too many tries,
  wait a minute", 5xx and network failures as "try again in a moment".
- **Throttles** are per IP: search 120 a minute, each booking action 10–30 a minute. Calls from the
  guest's browser count against the guest's own IP, which is the better choice for a busy site. Calls
  from your server count all your visitors as one IP; ask Reviewslip before launch if that is the plan
  and you expect more than a handful of bookings a minute.

### Endpoints

All take the stay as query parameters (or body fields for POST): `arrival`, `departure`, `adults`
(1–16, default 2), `children` (0–10), `rooms` (1–4, and adults ≥ rooms). Search also takes `q`.

| Method and path | Use | Returns |
|---|---|---|
| `GET /places` | Suggestions for the Where field | `{ places: [{ place, venues }] }` |
| `GET /search?q&arrival&departure&adults&children&rooms` | Results page | `{ stay, results: SearchResult[] }` |
| `GET /venues/:slug` | Venue page with no dates yet (rooms, no prices) | `Venue` |
| `GET /venues/:slug?arrival&departure&adults&children&rooms` | Venue page with prices | `Venue` |
| `POST /venues/:slug/bookings` | Confirm Booking | `201 { reference, key }` |
| `GET /bookings/:reference?k=KEY` | Booking page | `BookingView` |
| `GET /bookings/:reference/change?k&arrival&departure&adults&children` | Quote a change (changes nothing) | `ChangeQuote` |
| `POST /bookings/:reference/change` | Confirm a change | `BookingView` |
| `POST /bookings/:reference/cancel` | Cancel | `BookingView` |
| `GET /photos/:id` | A photo (public, cache it forever) | image |

A search that is not valid (dates in the past, more than 30 nights, more than a year ahead) answers
400 with the reason. A wrong key and an unknown reference both answer the same 404.

### Shapes

```ts
interface Rating { average: number; count: number }            // out of 5, from the venue's review sites

interface SearchResult {
  slug: string; name: string; place: string | null; currency: string;
  photo: number | null;                                         // id for /photos/:id
  rating: Rating | null;
  amenities: string[];                                          // keys, see "Amenities"
  from: { roomName: string; planName: string; totalMinor: number; perNightMinor: number; roomsLeft: number } | null;
  breakfast: boolean; freeCancel: boolean;                      // any bookable offer has it
}                                                               // from = null: nothing free; list these last, still openable

interface Venue {
  slug: string; name: string; place: string | null; currency: string;
  reviewUrl: string;                                            // the venue's Reviewslip review page
  profile: {
    about: string; amenities: string[];
    contact: { phone: string; email: string; line: string; whatsapp: string };
    checkIn: string; checkOut: string;                          // "14:00"
    payment: { mode: "full" | "deposit"; depositPct: number | null };
  };
  photos: number[]; rating: Rating | null;
  stay: { arrival: string; departure: string; nights: number; adults: number; children: number; rooms: number } | null;
  rooms: {
    id: number; name: string; capacity: number;                 // capacity = guests per room
    profile: { description: string; bed: string; sizeSqm: number | null; amenities: string[] };
    photos: number[];
    free: number | null;                                        // rooms of this type free on every night; null without dates
    fits: boolean | null;                                       // the party fits (enough free rooms and beds)
    offers: {
      planId: number; name: string; breakfast: boolean;
      cancelDays: number | null; freeCancelUntil: string | null; // null = non-refundable, or the deadline has passed
      totalMinor: number | null;                                // for the whole party, all rooms, all nights
      perNightMinor: number | null; dueNowMinor: number | null;
      bookable: boolean; reason: string | null;                 // why not, when not
    }[];
  }[];
}

interface BookingView {
  reference: string; status: "confirmed" | "cancelled";
  cancelledAt: string | null; cancelledBy: "guest" | "venue" | null;
  cancellable: boolean;                                         // inside the free-cancellation window, stay not started
  changeable: boolean;                                          // cancellable, and the rate still exists
  maxGuests: number;                                            // beds across its rooms: the most a change can ask for
  venue: { slug: string; name: string; place: string | null; contact: Venue["profile"]["contact"] };
  checkIn: string; checkOut: string; currency: string;
  guestName: string; guestEmail: string; roomName: string; planName: string | null;
  breakfast: boolean; freeCancelUntil: string | null;
  arrival: string; departure: string; nights: number; rooms: number; adults: number; children: number;
  requests: string | null; totalMinor: number | null;
}

interface ChangeQuote {
  arrival: string; departure: string; adults: number; children: number;
  totalMinor: number; oldTotalMinor: number | null; freeCancelUntil: string | null;
}
```

### Booking

```http
POST /venues/:slug/bookings
{
  "arrival": "2026-10-18", "departure": "2026-10-20", "adults": 2, "children": 0, "rooms": 1,
  "groupId": 12,                  // the room's id
  "planId": 31,                   // the offer's planId
  "expectTotalMinor": 1580000,    // the offer's totalMinor, exactly as you showed it
  "guest": { "name": "…", "email": "…", "phone": "+66 81 234 5678", "requests": "…" }
}
→ 201 { "reference": "RS4V4JZE5S", "key": "…" }
→ 409 { "error": "That room has just gone for these dates. Pick another." }
→ 409 { "error": "The price changed while you were booking. Check the new total.", "totalMinor": 1640000 }
→ 400 { "error": "Add a phone number the venue can reach you on, with the country code." }
```

- Always send `expectTotalMinor`. If the venue changed its price while the guest was on checkout, the
  booking is refused with the new total: show it and let them confirm again. Never retry silently.
- Reviewslip takes the booking inside one transaction holding the room type, so two guests racing for
  the last room cannot both get it; the second gets 409.
- Reviewslip emails the guest (with a link to the booking on reviewslip.com) and the venue. You do not
  send emails.
- After a 201, send the guest to your own booking page with the reference and key in the address:
  `/booking/RS4V4JZE5S?k=…`. The key is not personal data; it is the only way to reopen the booking.
  Store nothing else.

### Changing and cancelling

- `changeable` and `cancellable` say whether the booking can be managed online; outside the window,
  show "This booking can no longer be changed or cancelled online — contact the venue" with the contact
  buttons.
- **Change** = same room type, same rate, same number of rooms, new dates and/or party. Quote first with
  `GET …/change` (shows the new total; changes nothing), then confirm with
  `POST …/change { k, arrival, departure, adults, children, expectTotalMinor }` using the quote's total.
  The same 409-with-new-total rule applies. Refusals come back with a reason to show: unchanged request,
  not free on those dates, too many guests, rate no longer sold.
- **Cancel** = `POST …/cancel { k }`. Every room under the reference is cancelled and released. Ask first
  in a second, deliberate step (a `<details>` with one red button works without JavaScript).

### Contact and calls

Each venue's contact buttons are part of the design ("Book directly with <venue>"): Call, LINE, WhatsApp,
Email, each shown only when set.

- Phone → `tel:` with the digits. Email → `mailto:`. WhatsApp → `https://wa.me/<digits without +>`.
  LINE → the value if it is already an `https://line.me/…` or `lin.ee` link, else
  `https://line.me/R/ti/p/@<id>`.
- **Call in the browser.** Every venue has a line on Reviewslip's softphone. Load
  `https://api.reviewslip.com/voice-call.js` once (`<script defer src="…">`) and render
  `<button data-rs-call data-voice-line="<venue slug>" data-voice-team="sales" data-voice-phone="<phone>" hidden><span data-voice-label>Call Reservations</span></button>`
  followed by the `tel:` link; hide the link with CSS once the button is visible
  (`[data-rs-call]:not([hidden]) + a { display: none }`). The script shows the button only while
  someone at the venue can answer or take a message, relabels it "Leave a message" when only a message
  can be left, and opens its own call panel; buttons added later are picked up on their own. Optional:
  `data-voice-caller` (the guest's name, shown to whoever answers) and `data-voice-leave` (your own
  words for "Leave a message"). Calls are accepted only from Reviewslip's pages and origins Reviewslip
  has added to `VOICE_ORIGINS` — ask for yours to be added, or the button never appears and guests
  use the phone link.

### Amenities

Keys, translate them for display: venue — `wifi parking pool restaurant breakfast aircon garden airport
shuttle laundry kitchen spa gym family pets frontdesk24`; room — `aircon fan wifi tv fridge kettle balcony
bathtub shower desk safe view kitchenette terrace`. English labels: Free Wi-Fi, Parking, Swimming pool,
Restaurant, Breakfast available, Air conditioning, Garden, Airport transfer, Shuttle, Laundry, Shared
kitchen, Spa & massage, Gym, Family friendly, Pets allowed, 24-hour front desk, Fan, TV, Fridge, Kettle,
Balcony, Bathtub, Hot shower, Desk, Safe, View, Kitchenette, Terrace. An unknown key falls back to the key.

## Pages and design

Match Reviewslip's Stays pages: the big booking sites' layouts, drawn in a quiet system — neutral greys
and one ink colour (no brand gradients), the system font, 8–12 px radii, thin 1 px borders, light and
dark themes from the same tokens, AA contrast in both. Every page works at 375 px with no sideways
scroll. Payment is not online yet: wherever a price is due, say "Pay at the property" and "Online payment
isn't available yet. You pay <venue> when you arrive."

1. **Search bar.** One white (or dark) bar with fields in a row divided by thin lines: Where (text input
   with a datalist from `/places`, placeholder "City, area or place name"), Check-in and Check-out
   (native date inputs — they open the phone's own calendar; min today; choosing a check-in on or after
   the check-out moves check-out to the next day), Guests (a button showing "2 adults · 1 room" that
   opens a popover with Adults / Children (hint "Ages 0–17") / Rooms steppers and Done; adults never
   below rooms; Escape and an outside click close it), and a dark Search button with a magnifier. A
   plain GET form to the results page so a search is a shareable address and Back works. Each field has a
   small grey label with an icon above its value. On phones: Where full width, the two dates side by
   side, Guests full width, Search full width.
2. **Results.** The bar at the top on a muted band. Below, two columns: a filter panel (15 rem, sticky)
   and the list. Filters, as a GET form keeping the stay: Breakfast included, Free cancellation, Price per
   night (Any / up to 1,000 / 2,000 / 3,500 / 5,000), Guest rating (Any / 4+ / 4.5+), Apply and Clear.
   Heading "Stays in <place>" (or "Stays across Thailand") with "N places to stay"; sort pills on the
   right: Recommended, Lowest price, Top rated (the active one filled). Each result is a card: photo on
   the left (15 rem, cover-cropped; a quiet "No photo yet" box when there is none), then name (the whole
   card is the link), place with a pin, the rating as a dark score badge + star + "N reviews", "<room> ·
   <plan>", tags (✓ Free cancellation, ☕ Breakfast included) and up to five amenity chips; then a price
   column on the right with a left border: "Only N left" in red when N ≤ 3, the per-night price large and
   bold, "per night", "<total> for N nights", and See Availability. A venue with nothing free shows "No
   rooms for your dates" and a quiet See Availability. Empty: "No stays match your search. Try other dates
   or a nearby place." On phones: results first, filters after them; the price column goes under the card.
3. **Venue page.** Breadcrumb (All stays › <place> › <venue>); name, place and rating with a "Choose your
   room" button; a gallery of 1, 3 or 5 photos (one big, the rest in a grid beside it — never an even
   count, which leaves a hole). A sticky date/guest bar (no Where). Then two columns: rooms on the left,
   a side box on the right with "Book directly with <venue>" and its contact buttons, and a "Pay at the
   property" note. Each room is a card: a header with its name; on the left its photo, thumbnails,
   "Sleeps N", bed, size in m², amenity chips and description; on the right a table of its rates —
   "Your choices" (the rate's name; ☕ Breakfast included or Room only; ✓ Free cancellation until <date>
   or ✕ Non-refundable; Pay at the property), "Price for N nights" (total large, per night under it,
   "Only N left"), and a Reserve button. A rate that is not bookable shows its reason instead of a price.
   A room that does not fit says "Too small for your party" or "Not available for your dates". Without
   dates: "Add your dates to see prices and availability." Below the rooms: About, Amenities (a grid with
   check marks), Policies (check-in from, check-out by, payment).
4. **Checkout.** Breadcrumb back to the venue; "Your Booking". Left: a card "Who's staying" with Full
   name; Email and Phone side by side (hint "With the country code, so the venue can reach you"); Special
   requests (hint "Optional. The venue will do what it can."); a line saying confirming accepts this
   rate's cancellation terms and that the guest's details go to the venue for this booking only; Confirm
   Booking (shows "Booking…" and is disabled while it runs). Right, sticky: a summary card with the room
   photo, venue name, "<room> × N · <rate>", Check-in and Check-out with dates and times, Guests, Price
   for N nights, breakfast and cancellation lines, Total and Due at the property, and the pay-later note.
   Re-read the venue with the stay before showing this page, take the room and offer from it, and refuse
   (with a link back) if the offer is no longer bookable. Keep what was typed when the server refuses.
5. **Booking page.** A round tick, "Booking confirmed" (or "This booking has been cancelled" with "You
   cancelled this booking. Nothing was charged." or "<venue> cancelled this booking. Contact them if you
   did not expect it."), "The details are on their way to <email>. Show the reference when you arrive.",
   and the reference large in a monospace font. A details card (rooms, check-in, check-out, guests and
   nights, name, breakfast, cancellation, total, due at the property) with a **Manage Booking** button
   when `cancellable`. Manage Booking opens a section below: "Change dates or guests" (check-in,
   check-out, adults, children — adults from the number of rooms up, total guests up to `maxGuests` — and
   Check New Price, a GET form back to this page; then a quote panel with the new dates and guests, New
   total, the old total struck through only when it differs, the new cancellation date, and Confirm
   Change) and "Cancel this booking" (inside `<details>`, the warning "The room goes back on sale and this
   cannot be undone. Nothing has been charged.", one red button "Yes, Cancel It"). After a change, show
   "Your booking has been changed. The new details are on their way by email." Then the contact box and
   "Find Another Stay". Where the stack allows, build these as plain forms posting to your server so
   they work without JavaScript; a browser-only site does the same with fetch.

## Must not

- Store or cache venues, prices, availability or bookings, or work out a price yourself.
- Book without `expectTotalMinor`, or retry a 409 without showing the guest.
- Put the guest's name, email or phone in a URL. The reference and key are the only things in addresses.
- Show anything from the API that is not on the pages above, or use it for anything but these pages.
- Show the "(demo)" venues on a live site once real venues are listed — they are test data.

## Acceptance checks (show each passing)

1. A search for "phuket", two nights from ten days out, 2 adults, returns Kata Beach Bungalows (demo)
   with a price, a rating and a photo that loads from `/photos/:id`.
2. Filters and sorting change the list and keep the stay in the address; Back returns to the last search.
3. A venue page with dates shows each room's rates with totals; without dates it asks for them.
4. A booking on a demo venue returns a reference, opens your booking page, and appears on that venue in
   Reviewslip.
5. Sending an old `expectTotalMinor` shows the new total instead of booking.
6. On the booking page: a quote changes nothing; Confirm Change moves the dates; Cancel cancels; a
   non-refundable booking offers neither and says to contact the venue.
7. A wrong key shows "We couldn't find that booking".
8. Every page at 1280 px and 375 px, light and dark, in each configured language.

Ask before: adding online payment, calling any endpoint not listed here, or listing anything publicly
under a venue's name other than what the API returns.
