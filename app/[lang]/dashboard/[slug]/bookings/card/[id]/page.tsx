import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import PageHeader from "@/components/app-shell/PageHeader";
import PrintButton from "@/components/dashboard/PrintButton";
import {
  call,
  sessionToken,
  type Booking,
  type BookingGuest,
} from "@/lib/customer";
import { isLocale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";

export const metadata: Metadata = {
  title: "Registration",
  robots: { index: false, follow: false, nocache: true },
};

/** Blank rows, so a booking for four can be filled in by hand at the desk. */
const MIN_ROWS = 2;

/**
 * The card a guest signs at check-in.
 *
 * A page rather than a PDF: it prints from any browser, the browser's own
 * "Save as PDF" covers the archive case, and it works on the tablet at the
 * desk without a download. No library, nothing to keep patched.
 *
 * Everything the property already knows is filled in; everything it does not
 * is a ruled line. A form that prints half-empty boxes for facts already in
 * the system is a form people stop reading, and a passport number typed twice
 * is a passport number that disagrees with itself.
 *
 * Only the last four digits of a passport are printed. The whole number exists
 * in one place in this product — the TM30 file Immigration asks for — and a
 * sheet of paper left on a desk is not a good second place for it.
 */
export default async function RegistrationCard({
  params,
}: PageProps<"/[lang]/dashboard/[slug]/bookings/card/[id]">) {
  const { lang, slug, id } = await params;
  if (!isLocale(lang)) notFound();

  const token = await sessionToken();
  if (!token) redirect(localizedPath(lang, "/login"));

  let booking: Booking;
  let guests: BookingGuest[] = [];
  let venue = "";

  try {
    const [detail, list, business] = await Promise.all([
      call<{ booking: Booking }>(`/businesses/${slug}/bookings/${id}`, { token }),
      call<{ guests: BookingGuest[] }>(
        `/businesses/${slug}/bookings/${id}/guests`,
        { token }
      ).catch(() => ({ guests: [] as BookingGuest[] })),
      call<{ business: { name: string } }>(`/businesses/${slug}`, { token }),
    ]);
    booking = detail.booking;
    guests = list.guests ?? [];
    venue = business.business.name;
  } catch (err) {
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }

  const rows = Math.max(MIN_ROWS, guests.length + 1);
  const blanks = Math.max(0, rows - guests.length);

  return (
    <>
    <PageHeader
      title="Registration Card"
      sub={`${venue} · No. ${booking.id}`}
      back={localizedPath(lang, `/dashboard/${slug}/bookings/calendar`)}
    >
      <PrintButton />
    </PageHeader>
    <div className="card-page">
      <article className="card venue-look">
        <header className="card-head">
          <h1>{venue}</h1>
          <p>Guest registration</p>
          <span className="card-ref">No. {booking.id}</span>
        </header>

        <section className="card-stay">
          <div>
            <span>Room</span>
            <b>{booking.roomName ?? "—"}</b>
          </div>
          <div>
            <span>Room type</span>
            <b>{booking.groupName ?? "—"}</b>
          </div>
          <div>
            <span>Arrival</span>
            <b>{booking.arrival}</b>
          </div>
          <div>
            <span>Departure</span>
            <b>{booking.departure}</b>
          </div>
          <div>
            <span>Nights</span>
            <b>{booking.nights}</b>
          </div>
          <div>
            <span>Guests</span>
            <b>
              {booking.adults} adult{booking.adults === 1 ? "" : "s"}
              {booking.children ? `, ${booking.children} child${booking.children === 1 ? "" : "ren"}` : ""}
            </b>
          </div>
        </section>

        <section>
          <h2>Booked under</h2>
          <div className="card-lines">
            <p>
              <span>Name</span>
              <b>{booking.guestName}</b>
            </p>
            <p>
              <span>Email</span>
              <b>{booking.guestEmail ?? ""}</b>
            </p>
            <p>
              <span>Telephone</span>
              <b>{booking.guestPhone ?? ""}</b>
            </p>
          </div>
        </section>

        <section>
          <h2>Everyone staying</h2>
          <table className="card-guests">
            <thead>
              <tr>
                <th>Family name</th>
                <th>First name</th>
                <th>Nationality</th>
                <th>Passport</th>
                <th>Date of birth</th>
              </tr>
            </thead>
            <tbody>
              {guests.map((g) => (
                <tr key={g.id}>
                  <td>{g.familyName}</td>
                  <td>{g.firstName}</td>
                  <td>{g.nationality ?? ""}</td>
                  {/* Last four only. The whole number lives in the TM30 file
                      and nowhere else, least of all on a sheet of paper. */}
                  <td>{g.passportTail ? `•••• ${g.passportTail}` : ""}</td>
                  <td>{g.dateOfBirth ?? ""}</td>
                </tr>
              ))}
              {Array.from({ length: blanks }).map((_, i) => (
                <tr key={`blank-${i}`}>
                  <td />
                  <td />
                  <td />
                  <td />
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card-terms">
          <p>
            I confirm the details above are correct, and that the identity
            documents of everyone staying have been presented at check-in.
          </p>
          <p>
            Foreign nationals staying here are notified to the Immigration
            Bureau as Thai law requires. Identity details are kept only for as
            long as that obligation and our records require.
          </p>
        </section>

        <section className="card-sign">
          <div>
            <span className="rule" />
            <small>Guest signature</small>
          </div>
          <div>
            <span className="rule" />
            <small>Date</small>
          </div>
          <div>
            <span className="rule" />
            <small>Checked in by</small>
          </div>
        </section>
      </article>
    </div>
    </>
  );
}
