'use strict';

const { pool, one, all, query, tx } = require('./db');
const nights = require('./nights');
const rates = require('./rates');
const market = require('./market');
const assets = require('./assets');
const tariff = require('./tariff');
const { publicUrl } = require('./tenant');
const mailer = require('./mailer');
const emails = require('./emails');
const customers = require('./customers');

/**
 * The marketplace's storage and queries. The rules are in market.js.
 *
 * A venue is on the marketplace when it is active, has switched listing on,
 * and has at least one room type. Everything a guest sees is read from the same
 * tables the venue's own calendar and rates screens write, so a price changed
 * in the dashboard is the price on the site.
 */

function fail(status, message) {
  return Object.assign(new Error(message), { status, expose: true });
}

const MAX_VENUE_PHOTOS = 10;
const MAX_ROOM_PHOTOS = 6;
const MAX_RESULTS = 60;

function currencyOf(row) {
  return row.currency || 'THB';
}

/* ------------------------------------------------------------------ photos */

async function photoIds(subscriberId) {
  const rows = await all(
    `SELECT id, group_id FROM market_photos WHERE subscriber_id = $1 ORDER BY sort, id`,
    [subscriberId]
  );
  const venue = [];
  const byGroup = new Map();
  for (const row of rows) {
    if (row.group_id === null) venue.push(row.id);
    else byGroup.set(row.group_id, [...(byGroup.get(row.group_id) || []), row.id]);
  }
  return { venue, byGroup };
}

/** A photo for the public site: only a listed, active venue's. */
async function photo(id) {
  const row = await one(
    `SELECT p.data FROM market_photos p
       JOIN subscribers s ON s.id = p.subscriber_id
      WHERE p.id = $1 AND s.market_listed AND s.status = 'active'`,
    [id]
  );
  return row ? assets.decodeStoredImage(row.data) : null;
}

/** A photo for the venue's own dashboard, listed or not. */
async function ownPhoto({ subscriberId, id }) {
  const row = await one('SELECT data FROM market_photos WHERE id = $1 AND subscriber_id = $2', [
    id,
    subscriberId,
  ]);
  return row ? assets.decodeStoredImage(row.data) : null;
}

async function addPhoto({ subscriberId, groupId = null, data }) {
  if (!assets.isStoredPhoto(data)) {
    throw fail(400, 'That photo could not be read, or is over 250kB. Try a JPEG.');
  }
  if (groupId !== null) {
    const group = await one('SELECT id FROM room_groups WHERE id = $1 AND subscriber_id = $2', [
      groupId,
      subscriberId,
    ]);
    if (!group) throw fail(404, 'No such room type.');
  }
  const max = groupId === null ? MAX_VENUE_PHOTOS : MAX_ROOM_PHOTOS;
  const have = await one(
    `SELECT count(*) AS n FROM market_photos
      WHERE subscriber_id = $1 AND group_id IS NOT DISTINCT FROM $2`,
    [subscriberId, groupId]
  );
  if (Number(have.n) >= max) throw fail(400, `That is the most photos it can hold (${max}). Remove one first.`);

  const row = await one(
    `INSERT INTO market_photos (subscriber_id, group_id, data, sort)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [subscriberId, groupId, data, Number(have.n)]
  );
  return { id: row.id };
}

async function removePhoto({ subscriberId, id }) {
  const result = await query('DELETE FROM market_photos WHERE id = $1 AND subscriber_id = $2', [
    id,
    subscriberId,
  ]);
  return result.rowCount > 0;
}

/**
 * Move a photo to the front: the first is the one on the search result and
 * the big one on the venue page.
 */
async function coverPhoto({ subscriberId, id }) {
  const row = await one('SELECT group_id FROM market_photos WHERE id = $1 AND subscriber_id = $2', [
    id,
    subscriberId,
  ]);
  if (!row) return false;
  await query(
    `UPDATE market_photos SET sort = CASE WHEN id = $3 THEN 0 ELSE sort + 1 END
      WHERE subscriber_id = $1 AND group_id IS NOT DISTINCT FROM $2`,
    [subscriberId, row.group_id, id]
  );
  return true;
}

/* -------------------------------------------------------- the venue's side */

/** Everything the dashboard's Online Booking screen edits. */
async function settings(subscriber) {
  const [groups, plans, photos] = await Promise.all([
    all('SELECT * FROM room_groups WHERE subscriber_id = $1 ORDER BY sort, name', [subscriber.id]),
    all('SELECT * FROM rate_plans WHERE subscriber_id = $1 ORDER BY name', [subscriber.id]),
    photoIds(subscriber.id),
  ]);

  return {
    listed: subscriber.market_listed === true,
    place: subscriber.place || '',
    currency: currencyOf(subscriber),
    profile: market.parseProfile(subscriber.market_profile),
    photos: photos.venue,
    amenities: { venue: market.VENUE_AMENITIES, room: market.ROOM_AMENITIES },
    limits: { venuePhotos: MAX_VENUE_PHOTOS, roomPhotos: MAX_ROOM_PHOTOS },
    rooms: groups.map((g) => ({
      id: g.id,
      name: g.name,
      capacity: g.capacity,
      profile: market.parseRoomProfile(g.profile),
      photos: photos.byGroup.get(g.id) || [],
      plans: plans
        .filter((p) => p.group_id === g.id)
        .map((p) => ({
          id: p.id,
          name: p.name,
          baseMinor: p.base_minor,
          breakfast: p.breakfast === true,
          cancelDays: p.cancel_days,
        })),
    })),
  };
}

/**
 * Listing on, the place guests search by, and the profile.
 *
 * Listing is refused while there is nothing to book: a venue on the search
 * results with no room types is a dead end for the guest who clicks it.
 */
async function saveSettings({ subscriberId, listed, place, profile }) {
  const where = String(place ?? '').trim().replace(/\s+/g, ' ');
  if (where.length > 80) throw fail(400, 'Keep the place under 80 characters, like "San Kamphaeng, Chiang Mai".');

  if (listed) {
    if (!where) throw fail(400, 'Add the place guests search for before listing, like "Chiang Mai".');
    const priced = await one(
      `SELECT count(*) AS n FROM rate_plans p
         JOIN room_groups g ON g.id = p.group_id
        WHERE p.subscriber_id = $1 AND p.base_minor IS NOT NULL
          AND EXISTS (SELECT 1 FROM rooms r WHERE r.group_id = g.id AND r.status = 'active')`,
      [subscriberId]
    );
    if (Number(priced.n) === 0) {
      throw fail(400, 'Set up a room type with rooms and a price on the Rates screen before listing.');
    }
  }

  await query(
    `UPDATE subscribers SET market_listed = $2, place = $3, market_profile = $4, updated_at = now()
      WHERE id = $1`,
    [subscriberId, listed === true, where || null, JSON.stringify(profile)]
  );
}

async function saveRoom({ subscriberId, groupId, room }) {
  const result = await query(
    'UPDATE room_groups SET profile = $3, updated_at = now() WHERE id = $1 AND subscriber_id = $2',
    [groupId, subscriberId, JSON.stringify(room)]
  );
  if (!result.rowCount) throw fail(404, 'No such room type.');
}

async function savePlanTerms({ subscriberId, planId, terms }) {
  const result = await query(
    `UPDATE rate_plans SET breakfast = $3, cancel_days = $4, updated_at = now()
      WHERE id = $1 AND subscriber_id = $2`,
    [planId, subscriberId, terms.breakfast, terms.cancelDays]
  );
  if (!result.rowCount) throw fail(404, 'No such rate.');
}

/* ---------------------------------------------------------- offers, shared */

async function ratingOf(subscriberId) {
  const row = await one(
    `SELECT round(avg(rating)::numeric, 1) AS average, count(rating) AS n
       FROM external_reviews WHERE subscriber_id = $1 AND rating IS NOT NULL`,
    [subscriberId]
  );
  const n = Number(row?.n) || 0;
  return n ? { average: Number(row.average), count: n } : null;
}

/**
 * Every room type of a venue for one party and stay: how many are free,
 * whether the party fits, and each plan's price for the whole party.
 */
async function offersFor(subscriber, stay, { today }) {
  const list = nights.nightsBetween(stay.arrival, stay.departure);
  const [groups, plans, free, prices] = await Promise.all([
    all('SELECT * FROM room_groups WHERE subscriber_id = $1 ORDER BY sort, name', [subscriber.id]),
    all('SELECT * FROM rate_plans WHERE subscriber_id = $1 ORDER BY base_minor NULLS LAST, name', [
      subscriber.id,
    ]),
    rates.availabilityOn(pool, { subscriberId: subscriber.id, list }),
    rates.pricesOn(pool, { subscriberId: subscriber.id, list }),
  ]);
  const payment = market.parseProfile(subscriber.market_profile).payment;

  return groups.map((g) => {
    const freeHere = free.find((f) => f.groupId === g.id)?.free ?? 0;
    const fits = market.fits({ capacity: g.capacity, free: freeHere }, stay);
    const offers = plans
      .filter((p) => p.group_id === g.id)
      .map((p) => {
        const price = prices.get(p.id) || { totalMinor: null, sellable: false, reason: 'Not priced.' };
        const totalMinor = price.totalMinor === null ? null : price.totalMinor * stay.rooms;
        return {
          planId: p.id,
          name: p.name,
          breakfast: p.breakfast === true,
          cancelDays: p.cancel_days,
          freeCancelUntil: market.freeCancelUntil({ arrival: stay.arrival, cancelDays: p.cancel_days, today }),
          totalMinor,
          perNightMinor: totalMinor === null ? null : Math.round(totalMinor / list.length),
          dueNowMinor: totalMinor === null ? null : market.dueNow(totalMinor, payment),
          bookable: fits && price.sellable,
          reason: !fits ? null : price.reason,
        };
      });
    return { group: g, free: freeHere, fits, offers };
  });
}

function cheapest(rooms) {
  let best = null;
  for (const room of rooms) {
    for (const offer of room.offers) {
      if (!offer.bookable) continue;
      if (!best || offer.totalMinor < best.offer.totalMinor) best = { room, offer };
    }
  }
  return best;
}

/* ------------------------------------------------------------------ search */

/** The places guests can search, with how many venues are in each. */
async function places() {
  const rows = await all(
    `SELECT place, count(*) AS n FROM subscribers
      WHERE market_listed AND status = 'active' AND place IS NOT NULL
      GROUP BY place ORDER BY count(*) DESC, place`
  );
  return rows.map((r) => ({ place: r.place, venues: Number(r.n) }));
}

/**
 * Listed venues matching the search, each with its cheapest offer that fits
 * the party. Venues with nothing free stay in the results, after the rest,
 * so a guest can still open them and contact the venue.
 */
async function search(stay) {
  const today = nights.todayAt('Asia/Bangkok');
  const like = stay.q ? `%${stay.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const venues = await all(
    `SELECT s.* FROM subscribers s
      WHERE s.market_listed AND s.status = 'active'
        AND EXISTS (SELECT 1 FROM room_groups g WHERE g.subscriber_id = s.id)
        AND ($1::text IS NULL OR s.place ILIKE $1 OR s.name ILIKE $1)
      ORDER BY s.name
      LIMIT ${MAX_RESULTS}`,
    [like]
  );

  const results = await Promise.all(
    venues.map(async (venue) => {
      const [rooms, rating, photos] = await Promise.all([
        offersFor(venue, stay, { today }),
        ratingOf(venue.id),
        photoIds(venue.id),
      ]);
      const best = cheapest(rooms);
      const profile = market.parseProfile(venue.market_profile);
      const bookable = rooms.flatMap((r) => r.offers.filter((o) => o.bookable));
      const firstRoomPhoto = rooms.map((r) => photos.byGroup.get(r.group.id)?.[0]).find(Boolean);
      return {
        slug: venue.slug,
        name: venue.name,
        place: venue.place,
        currency: currencyOf(venue),
        photo: photos.venue[0] ?? firstRoomPhoto ?? null,
        rating,
        amenities: profile.amenities,
        from: best
          ? {
              roomName: best.room.group.name,
              planName: best.offer.name,
              totalMinor: best.offer.totalMinor,
              perNightMinor: best.offer.perNightMinor,
              roomsLeft: best.room.free,
            }
          : null,
        breakfast: bookable.some((o) => o.breakfast),
        freeCancel: bookable.some((o) => o.freeCancelUntil),
      };
    })
  );

  return {
    stay: { ...stay, nights: nights.nightCount(stay.arrival, stay.departure) },
    results: [...results.filter((r) => r.from), ...results.filter((r) => !r.from)],
  };
}

/* ------------------------------------------------------------- venue page */

async function listedVenue(slug) {
  return one(
    `SELECT * FROM subscribers WHERE slug = $1 AND market_listed AND status = 'active'`,
    [String(slug ?? '').toLowerCase()]
  );
}

/**
 * One venue for its page: what it says about itself, its photos, and its room
 * types — priced for the stay when there is one, without prices when not.
 */
async function venue(slug, stay = null) {
  const subscriber = await listedVenue(slug);
  if (!subscriber) return null;

  const today = nights.todayAt('Asia/Bangkok');
  const [rating, photos, groups] = await Promise.all([
    ratingOf(subscriber.id),
    photoIds(subscriber.id),
    stay
      ? offersFor(subscriber, stay, { today })
      : all('SELECT * FROM room_groups WHERE subscriber_id = $1 ORDER BY sort, name', [subscriber.id]).then(
          (rows) => rows.map((group) => ({ group, free: null, fits: null, offers: [] }))
        ),
  ]);

  const profile = market.parseProfile(subscriber.market_profile);
  return {
    slug: subscriber.slug,
    name: subscriber.name,
    place: subscriber.place,
    currency: currencyOf(subscriber),
    reviewUrl: publicUrl(subscriber.slug),
    profile,
    photos: photos.venue,
    rating,
    stay: stay ? { ...stay, nights: nights.nightCount(stay.arrival, stay.departure) } : null,
    rooms: groups.map(({ group, free, fits, offers }) => ({
      id: group.id,
      name: group.name,
      capacity: group.capacity,
      profile: market.parseRoomProfile(group.profile),
      photos: photos.byGroup.get(group.id) || [],
      free,
      fits,
      offers,
    })),
  };
}

/* ---------------------------------------------------------------- booking */

/**
 * Take a guest's booking, confirmed.
 *
 * Inside one transaction holding the room type's row: availability is counted
 * and the price worked out on that transaction, so two guests racing for the
 * last room cannot both have it — the second waits for the first, then finds
 * nothing free. The price the guest saw comes with the request; if the venue
 * changed it in between, the booking is refused with the new one rather than
 * taken at a figure the guest never agreed to.
 *
 * Unassigned, like every channel booking: the guest booked a type, and which
 * room is the front desk's call.
 *
 * @returns {Promise<{reference: string, key: string|null}>}
 */
async function book({ slug, groupId, planId, expectTotalMinor, stay, guest }) {
  const subscriber = await listedVenue(slug);
  if (!subscriber) throw fail(404, 'That venue is not taking bookings here.');

  const list = nights.nightsBetween(stay.arrival, stay.departure);
  const today = nights.todayAt('Asia/Bangkok');
  const payment = market.parseProfile(subscriber.market_profile).payment;
  const reference = market.makeReference();

  const result = await tx(async (client) => {
    const group = await client.query(
      'SELECT id, name, capacity FROM room_groups WHERE id = $1 AND subscriber_id = $2 FOR UPDATE',
      [groupId, subscriber.id]
    );
    if (!group.rows[0]) throw fail(404, 'No such room.');

    const plan = await client.query(
      'SELECT id, name, breakfast, cancel_days FROM rate_plans WHERE id = $1 AND group_id = $2',
      [planId, groupId]
    );
    if (!plan.rows[0]) throw fail(404, 'No such rate for that room.');

    const [free] = await rates.availabilityOn(client, { subscriberId: subscriber.id, list, groupId });
    if (!market.fits({ capacity: group.rows[0].capacity, free: free?.free ?? 0 }, stay)) {
      throw fail(409, 'That room has just gone for these dates. Pick another.');
    }

    const price = (await rates.pricesOn(client, { subscriberId: subscriber.id, list, planIds: [planId] })).get(
      planId
    );
    if (!price?.sellable) throw fail(409, price?.reason || 'That rate is not available for these dates.');

    const totalMinor = price.totalMinor * stay.rooms;
    if (Number(expectTotalMinor) !== totalMinor) {
      throw Object.assign(fail(409, 'The price changed while you were booking. Check the new total.'), {
        totalMinor,
      });
    }

    const freeCancelUntil = market.freeCancelUntil({
      arrival: stay.arrival,
      cancelDays: plan.rows[0].cancel_days,
      today,
    });
    const parties = market.split(stay);
    // A guest booking online who has stayed before is the same customer.
    const customerId = await customers.attach(client, {
      subscriberId: subscriber.id,
      name: guest.name,
      email: guest.email,
      phone: guest.phone,
    });
    for (const party of parties) {
      await client.query(
        `INSERT INTO bookings
           (subscriber_id, group_id, guest_name, guest_email, guest_phone, adults, children,
            arrival, departure, status, source, notes, rate_plan_id, total_minor,
            reference, due_now_minor, payment_status, free_cancel_until, customer_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'confirmed','marketplace',$10,$11,$12,$13,$14,'not_connected',$15,$16)`,
        [
          subscriber.id,
          groupId,
          guest.name,
          guest.email,
          guest.phone,
          party.adults,
          party.children,
          stay.arrival,
          stay.departure,
          guest.requests || null,
          planId,
          price.totalMinor,
          reference,
          market.dueNow(price.totalMinor, payment),
          freeCancelUntil,
          customerId,
        ]
      );
    }

    return {
      roomName: group.rows[0].name,
      plan: plan.rows[0],
      totalMinor,
    };
  });

  return {
    reference,
    key: market.accessKeyFor(reference),
    subscriber,
    roomName: result.roomName,
    planName: result.plan.name,
    breakfast: result.plan.breakfast === true,
    totalMinor: result.totalMinor,
  };
}

/* ------------------------------------------------------------- cancelling */

/**
 * A guest cancels their own booking, every room under the reference.
 *
 * Only inside the free-cancellation window frozen on the booking, and only
 * before the stay has started: after either, the rate's terms are the venue's
 * to apply, and the guest is sent to the venue. The room goes back on sale in
 * the same transaction — its nights are deleted, as a desk cancellation does.
 *
 * @returns {Promise<{subscriberId: number}>}
 */
/**
 * A guest changes the dates or the party of their booking: same room type,
 * same rate, same number of rooms. Quoted first, then confirmed.
 *
 * Allowed while it could be cancelled for free — a change inside the window is
 * a cancellation and a new booking in one step, and outside it the rate's
 * terms are the venue's to apply.
 *
 * Done in one transaction holding the bookings and the room type: the guest's
 * own rooms are released first, so their current nights do not count against
 * the new ones, then availability and price are worked out exactly as for a
 * new booking. A quote runs the same steps and rolls back, so what the guest
 * is shown is what confirming does. If the price moved in between, confirming
 * is refused with the new one.
 *
 * The new dates are unassigned, as every channel booking arrives: the room
 * the desk had chosen may not be free on them, and that is the desk's call.
 *
 * @param {{reference: string, change: {arrival: string, departure: string,
 *   adults: number, children: number}, expectTotalMinor?: number, commit: boolean}} input
 */
async function changeByGuest({ reference, change, expectTotalMinor, commit }) {
  const today = nights.todayAt('Asia/Bangkok');
  const QUOTE = Symbol('quote');
  let quote = null;

  try {
    const done = await tx(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM bookings WHERE reference = $1 ORDER BY id FOR UPDATE',
        [reference]
      );
      if (!rows.length) throw fail(404, 'No booking with that reference.');
      const live = rows.filter((r) => r.status !== 'cancelled');
      const allowed = market.canCancel({
        statuses: live.map((r) => r.status),
        freeCancelUntil: rows[0].free_cancel_until,
        today,
      });
      if (!allowed.ok) throw fail(409, allowed.error.replace('cancelled online', 'changed online'));

      const first = live[0];
      if (!first.rate_plan_id) throw fail(409, 'This booking cannot be changed online. Contact the venue.');

      const stay = market.checkSearch({ ...change, rooms: live.length }, { today });
      if (!stay.ok) throw fail(400, stay.error);
      const oldAdults = live.reduce((n, r) => n + r.adults, 0);
      const oldChildren = live.reduce((n, r) => n + r.children, 0);
      if (
        stay.arrival === first.arrival && stay.departure === first.departure &&
        stay.adults === oldAdults && stay.children === oldChildren
      ) {
        throw fail(400, 'That is the booking you already have. Change the dates or the guests.');
      }

      const group = await client.query(
        'SELECT id, capacity FROM room_groups WHERE id = $1 FOR UPDATE',
        [first.group_id]
      );
      const plan = await client.query('SELECT id, cancel_days FROM rate_plans WHERE id = $1', [first.rate_plan_id]);
      if (!plan.rows[0]) throw fail(409, 'This rate is no longer sold. Contact the venue to change your booking.');

      // Let go of the guest's own rooms, so they are not counted as taken.
      const ids = live.map((r) => r.id);
      await client.query("UPDATE bookings SET status = 'cancelled' WHERE id = ANY($1::integer[])", [ids]);
      await client.query('DELETE FROM room_nights WHERE booking_id = ANY($1::integer[])', [ids]);

      const list = nights.nightsBetween(stay.arrival, stay.departure);
      const [free] = await rates.availabilityOn(client, { subscriberId: first.subscriber_id, list, groupId: first.group_id });
      if (!market.fits({ capacity: group.rows[0].capacity, free: free?.free ?? 0 }, stay)) {
        throw fail(409, 'Not available for those dates or that many guests. Try others.');
      }
      const price = (
        await rates.pricesOn(client, { subscriberId: first.subscriber_id, list, planIds: [first.rate_plan_id] })
      ).get(first.rate_plan_id);
      if (!price?.sellable) throw fail(409, price?.reason || 'Not available for those dates. Try others.');

      const profile = market.parseProfile(
        (await client.query('SELECT market_profile FROM subscribers WHERE id = $1', [first.subscriber_id])).rows[0]
          .market_profile
      );
      const result = {
        stay,
        totalMinor: price.totalMinor * live.length,
        oldTotalMinor: live.every((r) => r.total_minor !== null)
          ? live.reduce((n, r) => n + r.total_minor, 0)
          : null,
        freeCancelUntil: market.freeCancelUntil({ arrival: stay.arrival, cancelDays: plan.rows[0].cancel_days, today }),
        old: { arrival: first.arrival, departure: first.departure, adults: oldAdults, children: oldChildren },
        subscriberId: first.subscriber_id,
      };

      if (!commit) {
        quote = result;
        throw QUOTE;
      }
      if (Number(expectTotalMinor) !== result.totalMinor) {
        throw Object.assign(fail(409, 'The price changed while you were deciding. Check the new total.'), {
          totalMinor: result.totalMinor,
        });
      }

      const parties = market.split(stay);
      for (const [i, row] of live.entries()) {
        await client.query(
          `UPDATE bookings SET status = 'confirmed', arrival = $2, departure = $3, adults = $4, children = $5,
                  room_id = NULL, total_minor = $6, due_now_minor = $7, free_cancel_until = $8,
                  updated_at = now()
            WHERE id = $1`,
          [row.id, stay.arrival, stay.departure, parties[i].adults, parties[i].children, price.totalMinor,
            market.dueNow(price.totalMinor, profile.payment), result.freeCancelUntil]
        );
      }
      return result;
    });
    return done;
  } catch (err) {
    if (err === QUOTE) return quote;
    throw err;
  }
}

async function cancelByGuest(reference) {
  const today = nights.todayAt('Asia/Bangkok');
  return tx(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM bookings WHERE reference = $1 ORDER BY id FOR UPDATE',
      [reference]
    );
    if (!rows.length) throw fail(404, 'No booking with that reference.');

    const live = rows.filter((r) => r.status !== 'cancelled');
    const check = market.canCancel({
      statuses: live.map((r) => r.status),
      freeCancelUntil: rows[0].free_cancel_until,
      today,
    });
    if (!check.ok) throw fail(409, check.error);

    const ids = live.map((r) => r.id);
    await client.query(
      `UPDATE bookings SET status = 'cancelled', cancelled_at = now(), cancelled_by = 'guest', updated_at = now()
        WHERE id = ANY($1::integer[])`,
      [ids]
    );
    await client.query('DELETE FROM room_nights WHERE booking_id = ANY($1::integer[])', [ids]);
    return { subscriberId: rows[0].subscriber_id };
  });
}

/** A booking as its guest sees it, by reference. The key is checked by the caller. */
async function bookingView(reference) {
  const rows = await all(
    `SELECT b.*, g.name AS room_name, g.capacity, p.name AS plan_name, p.breakfast, p.cancel_days,
            s.slug, s.name AS venue_name, s.place, s.currency, s.market_profile
       FROM bookings b
       JOIN room_groups g ON g.id = b.group_id
       JOIN subscribers s ON s.id = b.subscriber_id
       LEFT JOIN rate_plans p ON p.id = b.rate_plan_id
      WHERE b.reference = $1
      ORDER BY b.id`,
    [reference]
  );
  if (!rows.length) return null;

  const first = rows[0];
  const profile = market.parseProfile(first.market_profile);
  const totalMinor = rows.every((r) => r.total_minor !== null)
    ? rows.reduce((sum, r) => sum + r.total_minor, 0)
    : null;
  const today = nights.todayAt('Asia/Bangkok');
  const cancelled = rows.every((r) => r.status === 'cancelled');
  const lastCancelled = rows
    .filter((r) => r.cancelled_at)
    .sort((a, b) => new Date(b.cancelled_at) - new Date(a.cancelled_at))[0];
  return {
    reference,
    status: cancelled ? 'cancelled' : 'confirmed',
    cancelledAt: cancelled ? lastCancelled?.cancelled_at ?? null : null,
    cancelledBy: cancelled ? lastCancelled?.cancelled_by ?? null : null,
    cancellable: market.canCancel({
      statuses: rows.filter((r) => r.status !== 'cancelled').map((r) => r.status),
      freeCancelUntil: first.free_cancel_until,
      today,
    }).ok,
    // A change keeps the room type and rate, so it needs the rate to exist.
    changeable:
      Boolean(first.rate_plan_id && first.plan_name) &&
      market.canCancel({
        statuses: rows.filter((r) => r.status !== 'cancelled').map((r) => r.status),
        freeCancelUntil: first.free_cancel_until,
        today,
      }).ok,
    maxGuests: first.capacity * rows.filter((r) => r.status !== 'cancelled').length,
    venue: { slug: first.slug, name: first.venue_name, place: first.place, contact: profile.contact },
    checkIn: profile.checkIn,
    checkOut: profile.checkOut,
    currency: first.currency || 'THB',
    guestName: first.guest_name,
    guestEmail: first.guest_email,
    roomName: first.room_name,
    planName: first.plan_name,
    breakfast: first.breakfast === true,
    // Frozen when it was booked. Shown only while it is still ahead.
    freeCancelUntil: first.free_cancel_until && first.free_cancel_until >= today ? first.free_cancel_until : null,
    arrival: first.arrival,
    departure: first.departure,
    nights: nights.nightCount(first.arrival, first.departure),
    rooms: rows.length,
    adults: rows.reduce((n, r) => n + r.adults, 0),
    children: rows.reduce((n, r) => n + r.children, 0),
    requests: first.notes,
    totalMinor,
    total: totalMinor === null ? null : tariff.formatAmount(totalMinor),
    paymentStatus: first.payment_status,
  };
}

/**
 * Tell a marketplace guest their booking was cancelled by the venue.
 *
 * Only once every room under the reference is cancelled — a desk cancelling
 * one of two rooms has changed the booking, not ended it, and that is a
 * conversation for the venue to have. Never throws: it runs after the desk's
 * change has committed.
 */
async function tellGuestCancelled(reference) {
  try {
    const view = await bookingView(reference);
    if (!view || view.status !== 'cancelled' || view.cancelledBy !== 'venue' || !view.guestEmail) return;
    const site = String(process.env.SITE_URL || 'https://reviewslip.com').replace(/\/$/, '');
    await mailer.send({
      to: view.guestEmail,
      ...emails.bookingCancelledEmail({
        venue: view.venue.name,
        reference,
        guestName: view.guestName,
        arrival: view.arrival,
        departure: view.departure,
        by: 'venue',
        contact: [view.venue.contact.phone, view.venue.contact.email].filter(Boolean).join(' · '),
        link: `${site}/stays`,
      }),
    });
  } catch (err) {
    console.error('Marketplace: could not tell the guest about a cancellation:', err.message);
  }
}

/** Where to tell the venue a booking came in: its account's address. */
async function venueEmail(subscriberId) {
  const row = await one(
    `SELECT a.email FROM subscribers s JOIN accounts a ON a.id = s.account_id WHERE s.id = $1`,
    [subscriberId]
  );
  return row?.email || null;
}

module.exports = {
  photo,
  ownPhoto,
  addPhoto,
  removePhoto,
  coverPhoto,
  settings,
  saveSettings,
  saveRoom,
  savePlanTerms,
  places,
  search,
  venue,
  book,
  cancelByGuest,
  changeByGuest,
  bookingView,
  tellGuestCancelled,
  venueEmail,
};
