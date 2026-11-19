/**
 * Every screen's steps, in one place. They run as one tour of the whole
 * dashboard (`GRAND`, run by GrandTour): the screens in the sidebar's order,
 * moving to the next screen by itself at the end of each.
 *
 * One tour rather than one per screen is the owner's call, against the app
 * standards' "a job that crosses screens is a docs how-to" (help-and-onboarding
 * §4): somebody new wants to be walked round the place once, not to find twelve
 * tours. The rest of §4 still holds per step: each points at one `data-tour`
 * mark and says in a sentence or two what it is for, with no "now press…"
 * (the screen is inert while it runs).
 *
 * The booking form's steps run on their own, from the form's own button: the
 * form is a dialog opened over a screen, not a screen the tour can go to.
 *
 * `version` goes up when a tour's steps change in a way someone who has seen
 * it should see again.
 */

export interface TourStepDef {
  /** The `data-tour` mark it lights up. */
  id: string;
  title: string;
  body: string;
}

export interface TourDef {
  id: string;
  version: number;
  title: string;
  /** One line for the Tutorials page. */
  summary: string;
  /**
   * The screen it runs on, under the venue's dashboard. Null for a tour that
   * runs inside something the person opens first (the booking form).
   */
  screen: string | null;
  /** Where to start it from, for a tour with no screen of its own. */
  from?: string;
  steps: TourStepDef[];
}

export const TOURS: TourDef[] = [
  {
    id: "venue-dashboard",
    version: 2,
    title: "The Venue Dashboard",
    summary: "What each part of the venue's home screen tells you.",
    screen: "",
    steps: [
      { id: "vd-resources", title: "Resources", body: "Everything at the venue there is a count of, today. Each name opens the screen behind it, and an amber number needs someone." },
      { id: "vd-desk", title: "Today at the Desk", body: "Who is arriving and leaving today, by name. Open Today has the full desk." },
      { id: "vd-health", title: "Review Page Health", body: "Whether your review page is taking reviews, and which setup steps are left." },
      { id: "vd-reviews", title: "Reviews", body: "This month's and all-time reviews, the last 30 days, and the topics guests pick most." },
    ],
  },
  {
    id: "today",
    version: 2,
    title: "The Front Desk",
    summary: "Today's arrivals, departures and rooms to clean, and where bookings start.",
    screen: "/bookings",
    steps: [
      { id: "today-summary", title: "At the Desk", body: "The day in figures: who is arriving and leaving, who is staying tonight, and the rooms to clean." },
      { id: "today-take", title: "Find or Take a Booking", body: "Type a guest's name to find their booking, or Take a Booking for a walk-in or a phone booking. The booking form has a guide of its own." },
      { id: "today-arrivals", title: "Arriving", body: "Everyone due today, each fixed on their own row: Give a Room if they have none, Mark Clean if their room isn't ready, then Check In." },
      { id: "today-housekeeping", title: "Housekeeping", body: "Only the rooms that need cleaning, each with Mark Clean. The clean ones sit underneath; press one if it needs cleaning again." },
    ],
  },
  {
    id: "booking-form",
    version: 2,
    title: "The Booking Form",
    summary: "The fields a booking needs, from the guest to the room.",
    screen: null,
    from: "Take a Booking on Today, then Take the Tour in the form",
    steps: [
      { id: "bf-guest", title: "Guest", body: "The name the booking is under. Someone who has stayed before is offered as you type their name, email or phone: pick them and their details fill in." },
      { id: "bf-dates", title: "Arrival and Departure", body: "The nights are counted from the two dates. Departure has to be after arrival." },
      { id: "bf-room", title: "Room Type and Room", body: "The type is what is sold. Leave Room empty to give them one later on the calendar." },
      { id: "bf-take", title: "Take the Booking", body: "Confirms the booking at once and holds the room. The rate's price is fixed at this point." },
    ],
  },
  {
    id: "calendar",
    version: 1,
    title: "The Calendar",
    summary: "Giving stays a room, moving them, and changing their dates.",
    screen: "/bookings/calendar",
    steps: [
      { id: "cal-views", title: "Rooms, Month or List", body: "Three ways to see the same bookings: a line for each room, the whole month, or a list with filters." },
      { id: "cal-types", title: "Room Types", body: "Shows one room type at a time, or all of them." },
      { id: "cal-grid", title: "Stays", body: "Each bar is a stay. Dragging one to another line moves it to that room; pulling an end changes its dates. A name opens the booking." },
      { id: "cal-noroom", title: "No Room Yet", body: "Stays still waiting for a room sit on this line under their room type, until they are dragged into one." },
    ],
  },
  {
    id: "bookings-list",
    version: 1,
    title: "The Bookings List",
    summary: "Finding any booking with filters and search.",
    screen: "/bookings/list",
    steps: [
      { id: "bl-filters", title: "Filters", body: "Narrow the list by state, room type, room or dates. The list changes as you choose." },
      { id: "bl-search", title: "Search", body: "Finds a booking from part of the guest's name or email." },
      { id: "bl-table", title: "The Bookings", body: "Status first, then the guest, the stay, the room and the total. A row opens its booking." },
      { id: "bl-take", title: "Take a Booking", body: "Opens the booking form for a new booking." },
    ],
  },
  {
    id: "rooms",
    version: 1,
    title: "Rooms",
    summary: "Room types, the rooms themselves, and how housekeeping works.",
    screen: "/bookings/rooms",
    steps: [
      { id: "rooms-types", title: "Room Types", body: "What guests book, such as a Deluxe Double. Rates and online booking are set for each type." },
      { id: "rooms-list", title: "Rooms", body: "The real rooms, each under a type, with whether each is open, held back or being renovated. They are the lines down the side of the calendar." },
      { id: "rooms-cleaning", title: "Cleaning Standard", body: "The jobs housekeepers tick off, grouped into areas such as Bedroom and Bathroom. Add a photo of how each area should look. A line with a room type applies to that type only." },
      { id: "rooms-board", title: "Housekeeping Board", body: "A page for housekeepers' phones, behind a PIN, listing the rooms in the order to clean them." },
      { id: "rooms-results", title: "Today's Photos", body: "Housekeepers photograph each area when it is done. See the result here, room by room, for the last 14 days." },
    ],
  },
  {
    id: "rates",
    version: 1,
    title: "Rates",
    summary: "What each night costs, and closing nights you don't sell.",
    screen: "/bookings/rates",
    steps: [
      { id: "rates-plan", title: "The Rate", body: "Which rate the month below shows, and its everyday price." },
      { id: "rates-month", title: "The Month", body: "Each night's price. Tinted nights were set by hand, and a night can also be closed or need a minimum stay." },
      { id: "rates-range", title: "Price These Nights", body: "Sets a price, a minimum stay or a closing for a run of nights in one go." },
      { id: "rates-all", title: "All Rates", body: "Every rate on every room type. Bookings already taken keep the price they were quoted." },
    ],
  },
  {
    id: "online-booking",
    version: 1,
    title: "Online Booking",
    summary: "What guests see when they book you directly.",
    screen: "/bookings/online",
    steps: [
      { id: "ob-listing", title: "Listing", body: "Whether you are listed on Reviewslip, and what guests read: the place, check-in times, amenities, contact and payment." },
      { id: "ob-embed", title: "On Your Website", body: "Code that puts the same booking pages on your own website." },
      { id: "ob-photos", title: "Photos", body: "Pictures of the venue itself. Each room's photos go with that room below." },
      { id: "ob-rooms", title: "Rooms", body: "What guests see for each room type: photos, bed, size, what is in the room and the rates offered." },
    ],
  },
  {
    id: "tm30",
    version: 1,
    title: "TM30",
    summary: "Notifying Immigration of foreign guests.",
    screen: "/bookings/tm30",
    steps: [
      { id: "tm-tiles", title: "Ready and Missing", body: "How many foreign guests can be notified now, and how many are missing details." },
      { id: "tm-missing", title: "Cannot Be Notified Yet", body: "Guests missing something Immigration asks for. Their booking is where it is filled in." },
      { id: "tm-notify", title: "Notify", body: "The file to upload at the immigration portal, and the button that marks those guests as notified." },
    ],
  },
  {
    id: "guest-app",
    version: 1,
    title: "The Guest App",
    summary: "The QR code, the links guests get, and who signed up.",
    screen: "/welcome",
    steps: [
      { id: "ga-qr", title: "QR Code", body: "Guests scan it to open your Guest App. Print it on the welcome card or use the code on its own." },
      { id: "ga-links", title: "Links", body: "The tiles guests see once they have signed up, in this order: Wi-Fi, menus, maps, LINE." },
      { id: "ga-guests", title: "Guests", body: "Everyone who signed up. Only those who agreed to emails are on the mailing list you download." },
    ],
  },
  {
    id: "calls",
    version: 1,
    title: "Calls",
    summary: "Who answers when guests press Call.",
    screen: "/calls",
    steps: [
      { id: "calls-line", title: "Your Line", body: "Whether a guest who presses Call can reach someone right now." },
      { id: "calls-team", title: "Who Answers", body: "Everyone who answers this venue's calls, and whether a call would reach them now." },
      { id: "calls-add", title: "Add Person", body: "Invites a member of staff to answer calls on the Phone, and to see nothing else." },
    ],
  },
  {
    id: "reviews",
    version: 1,
    title: "Reviews",
    summary: "The reviews written here, and the ones on your listings.",
    screen: "/reviews",
    steps: [
      { id: "rv-latest", title: "Latest Reviews", body: "Reviews guests wrote here and took to a listing. The stars you give one teach the writer what to aim for." },
      { id: "rv-listings", title: "On Your Listings", body: "What guests wrote on Google and the other sites, so you can see what is still unanswered." },
    ],
  },
  {
    id: "settings",
    version: 1,
    title: "Settings",
    summary: "Your details, review links, topics and theme.",
    screen: "/settings",
    steps: [
      { id: "st-tabs", title: "Three Tabs", body: "General holds your details and review links, Topics what reviews talk about, and Theme your colours and logo." },
      { id: "st-website", title: "Business Website", body: "Read to suggest your topics and colours. Guests never see it." },
      { id: "st-links", title: "Review Links", body: "Each link becomes a button on the guest page. “We are not on” marks a site you don't use." },
      { id: "st-save", title: "Save Settings", body: "Saves all three tabs at once." },
    ],
  },
];

TOURS.push({
  id: "customers",
  version: 1,
  title: "Customers",
  summary: "Every guest once, however many times they have stayed.",
  screen: "/customers",
  steps: [
    { id: "cu-search", title: "Find a Customer", body: "Search by name, email or phone. A booking finds a returning guest the same way when it is taken." },
    { id: "cu-list", title: "Everyone Who Has Stayed", body: "Each guest once, with their stays, the last one and what they spent. A row opens their details, a note for next time, and every stay." },
  ],
});

export const tourById = (id: string) => TOURS.find((t) => t.id === id) ?? null;

/** The screens the one tour visits, in the sidebar's order. */
const GRAND_ORDER = [
  "venue-dashboard",
  "settings",
  "today",
  "calendar",
  "bookings-list",
  "customers",
  "tm30",
  "reviews",
  "calls",
  "guest-app",
  "rooms",
  "rates",
  "online-booking",
];

export interface GrandStep extends TourStepDef {
  /** The screen, under the venue's dashboard ("" is the dashboard itself). */
  screen: string;
  /** The screen's name, shown on every card as where the tour has got to. */
  section: string;
}

/** The whole tour, every screen's steps end to end. */
export const GRAND: GrandStep[] = GRAND_ORDER.flatMap((id) => {
  const tour = tourById(id);
  if (!tour || tour.screen === null) return [];
  const screen = tour.screen;
  return tour.steps.map((step) => ({ ...step, screen, section: tour.title }));
});

/** The screens in tour order, each once. */
export const GRAND_SCREENS: string[] = GRAND.reduce<string[]>(
  (all, step) => (all.includes(step.screen) ? all : [...all, step.screen]),
  []
);
