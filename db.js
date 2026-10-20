'use strict';

const { Pool, types } = require('pg');

/**
 * `date` columns come back as strings, not Date objects.
 *
 * OID 1082 is `date`. Left alone, node-postgres parses it into a JavaScript
 * Date at **local midnight** — so '2026-10-03' read on a machine in Bangkok
 * becomes 2026-10-02T17:00:00Z, and formatting it back through anything
 * UTC-based gives the 2nd. That is the same off-by-one nights.js exists to
 * avoid, arriving through the driver instead of the arithmetic.
 *
 * A calendar date has no time and no zone, so the honest representation is the
 * string Postgres already sent. Set once here, at load, because a parser
 * registered later would apply only to queries made after it.
 */
types.setTypeParser(1082, (value) => value);

/**
 * The Postgres pool, plus the schema migrations.
 *
 * One pool for the process, opened at require time. It holds every subscriber's
 * OpenRouter key in plain text — so the database belongs on the machine that
 * runs the app, listening on loopback and nowhere else.
 */

const CONNECTION = process.env.DATABASE_URL;

if (!CONNECTION) {
  throw new Error(
    'DATABASE_URL is not set. Point it at Postgres, for example:\n' +
      '  DATABASE_URL=postgres://reviewslip:password@127.0.0.1:5432/reviewslip'
  );
}

// Small on purpose. One Node process, against a server tuned for twenty
// backends — a pool bigger than the work queue only costs memory.
//
// Idle connections close after ten seconds rather than thirty: traffic comes
// in bursts (a guest page, a dashboard load) and each held connection is a
// Postgres process using memory on a one-gigabyte box. At rest the app holds
// none. The name is what the Server page groups connections by.
const pool = new Pool({
  connectionString: CONNECTION,
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
  application_name: 'reviewslip-app',
});

// An idle client dropped by the server — a restart, a network blip — surfaces
// here rather than at the next query, and an unhandled 'error' event on the
// pool would take the process down with it.
pool.on('error', (err) => {
  console.error('Idle Postgres client error:', err.message);
});

/* ------------------------------------------------------------------ queries */

function query(text, params) {
  return pool.query(text, params);
}

/** @returns {Promise<object|null>} the first row, or null for none */
async function one(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] || null;
}

/** @returns {Promise<object[]>} */
async function all(text, params) {
  const { rows } = await pool.query(text, params);
  return rows;
}

/**
 * Run `fn` inside a transaction, on one client.
 *
 * The first thing in this codebase to need it. A booking and the room nights it
 * occupies have to land together: half of that is either a stay holding no
 * inventory, or inventory held by no stay, and the second is worse — a room
 * that cannot be sold and has nothing to explain why.
 *
 * `fn` is handed a client with the same `query` shape as the pool, so callers
 * read the same either way. It rolls back on any throw and always releases.
 *
 * @param {(client: import('pg').PoolClient) => Promise<any>} fn
 */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    // Best effort: if the connection is what failed, the rollback fails too,
    // and the original error is the one worth reporting.
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback failed:', rollbackErr.message);
    }
    throw err;
  } finally {
    client.release();
  }
}

/* -------------------------------------------------------------- migrations */

/**
 * Append-only. Each entry moves the schema forward by one, and `schema_version`
 * records how far we have gone — so a fresh database and an existing one take
 * the same path.
 *
 * SQLite kept that counter in `user_version`. Postgres has no per-database slot
 * like it, so it lives in a one-row table instead.
 */
const MIGRATIONS = [
  async (c) => {
    await c.query(`
      CREATE TABLE subscribers (
        id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        slug        text NOT NULL UNIQUE,
        name        text NOT NULL,
        status      text NOT NULL DEFAULT 'active',
        api_key     text,
        model       text,
        google_url  text,
        website_url text,
        token_hash  text NOT NULL,
        created_at  text NOT NULL,
        updated_at  text NOT NULL
      )
    `);
  },

  async (c) => {
    await c.query('ALTER TABLE subscribers ADD COLUMN tripadvisor_url text');
    // A JSON array of {id, label, focus}. NULL means "use the built-in set",
    // which is what every existing row wants.
    await c.query('ALTER TABLE subscribers ADD COLUMN categories text');
  },

  async (c) => {
    // Who the venue is, in the writer's words. Until now these lived in
    // config.js, installation-wide, so every venue's reviews described the
    // first one. NULL still falls back to config.js, which is what a venue
    // that has not filled them in wants.
    await c.query('ALTER TABLE subscribers ADD COLUMN kind text');
    await c.query('ALTER TABLE subscribers ADD COLUMN place text');
    // A JSON array of strings — the details a review may draw on.
    await c.query('ALTER TABLE subscribers ADD COLUMN safe_details text');
  },

  async (c) => {
    // Customers. A venue used to be configured through a token handed to its
    // staff; now it belongs to an account, and the account signs in.
    await c.query(`
      CREATE TABLE accounts (
        id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        email         text NOT NULL,
        username      text NOT NULL,
        password_hash text NOT NULL,
        plan          text NOT NULL DEFAULT 'starter',
        status        text NOT NULL DEFAULT 'active',
        created_at    text NOT NULL,
        updated_at    text NOT NULL
      )
    `);
    // Case-insensitive: nobody should be able to register Zac@x.com twice by
    // changing the capitals, and nobody should fail to sign in over it either.
    await c.query(
      'CREATE UNIQUE INDEX accounts_email ON accounts (lower(email))'
    );
    await c.query(
      'CREATE UNIQUE INDEX accounts_username ON accounts (lower(username))'
    );

    // Opaque session tokens, hashed the way subscriber tokens are: the cookie
    // in the browser is the only copy of the real thing.
    await c.query(`
      CREATE TABLE sessions (
        token_hash text PRIMARY KEY,
        account_id integer NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL
      )
    `);
    await c.query(
      'CREATE INDEX sessions_account ON sessions (account_id)'
    );

    // A venue with no account is one created straight from the admin API, which
    // is still allowed — hence nullable rather than NOT NULL.
    await c.query(`
      ALTER TABLE subscribers
        ADD COLUMN account_id integer REFERENCES accounts (id) ON DELETE SET NULL
    `);
    await c.query(
      'CREATE INDEX subscribers_account ON subscribers (account_id)'
    );

    // One row per generated review. This is where the dashboard's counts and
    // the token meter come from, so it is written on the guest path — kept
    // narrow deliberately: no review text, nothing about the guest.
    await c.query(`
      CREATE TABLE review_events (
        id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        subscriber_id     integer NOT NULL REFERENCES subscribers (id) ON DELETE CASCADE,
        created_at        timestamptz NOT NULL DEFAULT now(),
        category_id       text,
        model             text,
        prompt_tokens     integer,
        completion_tokens integer,
        total_tokens      integer
      )
    `);
    // Every dashboard query is "this venue, this month", so index that pair.
    await c.query(`
      CREATE INDEX review_events_subscriber_created
        ON review_events (subscriber_id, created_at DESC)
    `);
  },

  async (c) => {
    // Staff. One flag rather than a roles table: there are two kinds of person
    // here, us and customers, and inventing a permission system for that would
    // be building for a problem nobody has yet.
    await c.query(
      'ALTER TABLE accounts ADD COLUMN is_admin boolean NOT NULL DEFAULT false'
    );

    // subscriber_id is nullable and SET NULL on delete: a ticket about a venue
    // that has since been deleted is still a ticket, and often the interesting
    // kind.
    await c.query(`
      CREATE TABLE support_tickets (
        id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        account_id    integer NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
        subscriber_id integer REFERENCES subscribers (id) ON DELETE SET NULL,
        title         text NOT NULL,
        body          text NOT NULL,
        status        text NOT NULL DEFAULT 'open',
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      )
    `);
    await c.query(`
      CREATE INDEX support_tickets_account
        ON support_tickets (account_id, created_at DESC)
    `);
    // The admin queue reads by status, oldest first within it.
    await c.query(`
      CREATE INDEX support_tickets_queue
        ON support_tickets (status, created_at)
    `);

    // Referrals move through three states, and each needs its own timestamp
    // because the discount depends on the last one: invited, signed up, and
    // paying. Only the third counts.
    await c.query(`
      CREATE TABLE referrals (
        id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        referrer_id  integer NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
        email        text NOT NULL,
        code         text NOT NULL UNIQUE,
        invited_at   timestamptz NOT NULL DEFAULT now(),
        account_id   integer REFERENCES accounts (id) ON DELETE SET NULL,
        signed_up_at timestamptz,
        qualified_at timestamptz
      )
    `);
    // One invite per address per referrer — re-inviting someone should resend,
    // not quietly count twice towards the discount.
    await c.query(`
      CREATE UNIQUE INDEX referrals_referrer_email
        ON referrals (referrer_id, lower(email))
    `);
  },

  async (c) => {
    // Agency is gone. planFor() falls back to Starter for an id it does not
    // recognise, so leaving these rows alone would silently drop an unlimited
    // account to one venue — the kind of change nobody notices until a venue
    // stops working. Enterprise is the nearest tier that still exists.
    await c.query(
      "UPDATE accounts SET plan = 'enterprise', updated_at = $1 WHERE plan = 'agency'",
      [new Date().toISOString()]
    );
  },

  async (c) => {
    // review_events was deliberately narrow — counts and tokens, no text. This
    // reverses that, because a rated list of what the writer produced is the
    // only way to tell good output from bad, and "read them yourself" does not
    // scale past one business.
    //
    // What is stored is a review the guest was about to post publicly anyway.
    // Nothing about the guest is kept: no address, no identifier, no session.
    await c.query('ALTER TABLE review_events ADD COLUMN review_text text');

    // NULL means nobody rated it, which is most of them. Only true and false
    // carry information, so a three-state column beats a boolean defaulting to
    // false — that would read as "everyone disliked it".
    await c.query('ALTER TABLE review_events ADD COLUMN liked boolean');
    await c.query('ALTER TABLE review_events ADD COLUMN rated_at timestamptz');

    // The dashboard's rated list reads "this business, rated, newest first".
    await c.query(`
      CREATE INDEX review_events_rated
        ON review_events (subscriber_id, rated_at DESC)
        WHERE liked IS NOT NULL
    `);
  },

  async (c) => {
    // Four more places a guest can post. Separate columns rather than one JSON
    // blob, to match google_url and tripadvisor_url: a links column would be
    // tidier but would mean rewriting every reader of those two, and this ships
    // without touching them.
    await c.query('ALTER TABLE subscribers ADD COLUMN line_url text');
    await c.query('ALTER TABLE subscribers ADD COLUMN facebook_url text');
    await c.query('ALTER TABLE subscribers ADD COLUMN xiaohongshu_url text');
    await c.query('ALTER TABLE subscribers ADD COLUMN wongnai_url text');
  },

  async (c) => {
    // The business's own AI context document: free prose about who comes here
    // and what they tend to mention, drafted from the website and then edited by
    // the owner. Distinct from safe_details, which is a list of facts a review
    // may assert; this steers tone and subject matter and asserts nothing.
    //
    // NULL means the business has not written one, which is most of them, and
    // the prompt simply leaves the section out.
    await c.query('ALTER TABLE subscribers ADD COLUMN context_doc text');
  },

  async (c) => {
    // Four colours as JSON — ground, paper, accent, highlight — drafted from the
    // business's own website and then edited. Everything else in the palette is
    // derived from these at request time by theme.js, so a change to the
    // derivation reaches every business without a migration.
    //
    // NULL is a business using the shipped palette, which is most of them, and
    // makes /theme.css an empty file rather than a reconstruction of it.
    await c.query('ALTER TABLE subscribers ADD COLUMN theme text');
  },

  async (c) => {
    // The business's actual typefaces, taken off its own site: JSON holding the
    // family name, the format, where it came from and the file itself in base64.
    //
    // Their own columns rather than fields inside `theme`, because the theme is
    // read whole and handed to the dashboard on every settings load, and a pair
    // of woff2 files is most of a megabyte of base64. These are only ever read
    // by the route that serves them.
    //
    // NULL is a business using a face from the shortlist, which is the fallback
    // whenever a grab was not possible or not permitted.
    await c.query('ALTER TABLE subscribers ADD COLUMN font_display text');
    await c.query('ALTER TABLE subscribers ADD COLUMN font_ui text');
  },

  async (c) => {
    // Stars instead of thumbs. A thumb answers "was this any good" with one bit,
    // which is enough to sort by and not enough to learn from: the four-star
    // review that only needed a word changing was indistinguishable from the
    // one that was simply fine, and both were fed back as equally good.
    await c.query('ALTER TABLE review_events ADD COLUMN rating smallint');
    await c.query(`
      ALTER TABLE review_events
        ADD CONSTRAINT review_events_rating_range
        CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5))
    `);

    // Thumbs up becomes five, since that is what an owner meant by it: use this
    // one. Thumbs down becomes two rather than one — it was "not this", not "the
    // worst thing I have seen", and one should stay available for the reviews an
    // owner actively wants recorded as bad.
    await c.query('UPDATE review_events SET rating = 5 WHERE liked = true');
    await c.query('UPDATE review_events SET rating = 2 WHERE liked = false');

    // `liked` is deliberately left in place. Nothing reads it after this, but a
    // rollback to the previous release needs it to still hold the old answers,
    // and a column of stale booleans costs nothing. Drop it once this has been
    // out long enough that going back is not a plan.

    await c.query(`
      CREATE INDEX review_events_rating
        ON review_events (subscriber_id, rated_at DESC)
        WHERE rating IS NOT NULL
    `);

    // What the writer was working from, per review, so the dashboard can say why
    // a review came out the way it did. The topics were already stored as
    // category_id; these are the other two knobs the guest actually turns.
    await c.query('ALTER TABLE review_events ADD COLUMN language text');
    await c.query('ALTER TABLE review_events ADD COLUMN length text');
  },

  async (c) => {
    // The hero photograph off the business's own site, as JSON holding the mime
    // type, the file in base64, and where it came from.
    //
    // Its own column rather than a field inside `theme` for the same reason the
    // fonts have one: the theme is read whole and handed to the dashboard on
    // every settings load, and half a megabyte of base64 does not belong in it.
    await c.query('ALTER TABLE subscribers ADD COLUMN background text');
  },

  async (c) => {
    // What the owner pasted about their business, when there is no page we can
    // read. A great many small businesses are a Facebook page and nothing else,
    // and Facebook serves a sign-in wall to anything without a session — so the
    // fallback to their listing URL, while correct, usually comes back empty.
    //
    // Pasted text always works. It feeds the same drafting prompts a fetched
    // page would, in place of the fetch.
    await c.query('ALTER TABLE subscribers ADD COLUMN source_text text');
  },

  async (c) => {
    // Topic names in every language the page offers, as JSON:
    //
    //   { "th": { "<topic id>": { "label": "ห้องพัก", "of": "Rooms" } } }
    //
    // A cache, not a setting. A guest picking Thai on a business whose topics
    // are English is the case this exists for, and translating fifty short
    // labels in front of that guest is a model call they would wait for. So the
    // first guest to pick a language pays for it and everyone after them reads
    // this column.
    //
    // `of` is the English label the translation was made from. A label the
    // owner has since edited no longer matches, and a mismatch counts as
    // missing — which is the whole invalidation story, and needs no timestamps.
    await c.query('ALTER TABLE subscribers ADD COLUMN topic_labels text');
  },

  async (c) => {
    // When the guest took this one to a listing.
    //
    // A row is written for every generation, because that is what meters the
    // tokens the business is billed for. But most of those are drafts nobody
    // used: a guest regenerates until they like one, and the nine they passed
    // over are not reviews. Only the one they carried to Google is.
    //
    // So the corpus — the dashboard's list, the five-star examples fed back
    // into the prompt, the sample written away from — reads only rows with
    // this set, while the usage meter keeps reading all of them.
    await c.query('ALTER TABLE review_events ADD COLUMN proceeded_at timestamptz');

    // Everything already stored predates the distinction, and was shown as a
    // review for months. Backfilled rather than orphaned: a dashboard that
    // empties itself on deploy is a bug report, not a migration.
    await c.query('UPDATE review_events SET proceeded_at = created_at');

    await c.query(
      `CREATE INDEX IF NOT EXISTS review_events_proceeded_idx
         ON review_events (subscriber_id, proceeded_at DESC)
         WHERE proceeded_at IS NOT NULL`
    );
  },

  async (c) => {
    // Which listing the review was taken to. A business with four links has
    // four answers, and where a review ended up is the owner's first question
    // about it.
    //
    // Its own step, and not folded into the one above, because that one had
    // already run. Migrations are recorded by index: editing an applied one
    // changes what a fresh database gets and nothing at all on a live box —
    // which is how this column came to be missing on the server while the code
    // that selects it shipped. Append only. There is no exception to this.
    // IF NOT EXISTS because the history is genuinely ambiguous: a database
    // created while the column was still inside the step above already has it,
    // and one created before that does not. Both must survive this.
    await c.query(
      'ALTER TABLE review_events ADD COLUMN IF NOT EXISTS proceeded_to text'
    );
  },

  async (c) => {
    // One account can be the subject of at most one referral. Without this,
    // signing up twice through two different codes — or a retried request —
    // would let two referrers both count the same person towards a discount,
    // and referrals.claim() leans on the constraint rather than on a check it
    // would have to do in a separate statement and hope nothing raced.
    //
    // Partial, because account_id is null for every invitation not yet taken
    // up, and a plain unique index would allow exactly one of those to exist.
    await c.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS referrals_account
        ON referrals (account_id)
        WHERE account_id IS NOT NULL
    `);

    // claim() and qualify() both find rows by these, on every signup and every
    // sign-in. code is already unique and so already indexed; this is the one
    // lookup that would otherwise be a sequential scan.
    await c.query(
      'CREATE INDEX IF NOT EXISTS referrals_referrer ON referrals (referrer_id)'
    );
  },

  async (c) => {
    // A ticket becomes a conversation.
    //
    // support_tickets has held one title and one body since it was created,
    // which is a suggestion box rather than support: nobody could answer. The
    // header stays as it is — append-only, and its two indexes are already the
    // right ones — and the messages hang off it.
    await c.query(`
      CREATE TABLE ticket_messages (
        id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        ticket_id  integer NOT NULL REFERENCES support_tickets (id) ON DELETE CASCADE,
        -- SET NULL rather than cascade: a deleted account must not take the
        -- staff side of the conversation with it, and a thread missing every
        -- other message is not a record of anything.
        author_id  integer REFERENCES accounts (id) ON DELETE SET NULL,
        -- Stored, not derived from the author's is_admin. Derived, every old
        -- reply would change sides the day somebody stops being staff.
        from_staff boolean NOT NULL,
        body       text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Every read is one thread in order.
    await c.query(`
      CREATE INDEX ticket_messages_thread
        ON ticket_messages (ticket_id, created_at)
    `);

    // One active ticket per account, enforced here rather than only in code.
    // The check in tickets.js is a read followed by a write, and two requests
    // that interleave between the two would both pass it.
    await c.query(`
      CREATE UNIQUE INDEX support_tickets_one_active
        ON support_tickets (account_id)
        WHERE status <> 'closed'
    `);
  },

  async (c) => {
    // Reservations, slice one.
    //
    // Read nights.js before changing anything here: every date in this step is
    // a `date` and not a `timestamptz`, which disagrees with the rest of this
    // schema deliberately. A night is a calendar date at the property, not an
    // instant. `date_trunc('day', now() AT TIME ZONE 'UTC')` rolls over at
    // 07:00 in Bangkok, so a UTC-derived night is the previous one for seven
    // hours every morning.
    //
    // Which is also why a venue needs to say where it is. Nullable, and the
    // code falls back to Asia/Bangkok — the market this is built for — so no
    // existing row needs touching.
    await c.query("ALTER TABLE subscribers ADD COLUMN timezone text");

    // A room type: what is actually sold, and what an OTA lists. Guests book a
    // Deluxe Double; which one they sleep in is decided later.
    await c.query(`
      CREATE TABLE room_groups (
        id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        subscriber_id integer NOT NULL REFERENCES subscribers (id) ON DELETE CASCADE,
        name          text NOT NULL,
        capacity      integer NOT NULL DEFAULT 2,
        sort          integer NOT NULL DEFAULT 0,
        -- The channel manager's own id for this type. One column rather than a
        -- mapping table because a channel manager is a single upstream that
        -- fans out to the OTAs itself, so there is one id to hold, not one per
        -- OTA. Nullable until that slice exists; here now so connecting later
        -- is a write and not a migration.
        external_ref  text,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      )
    `);

    await c.query(`
      CREATE UNIQUE INDEX room_groups_name
        ON room_groups (subscriber_id, lower(name))
    `);

    // Lets `rooms` carry subscriber_id and still be provably consistent with
    // its group's — see the composite foreign key below.
    await c.query(`
      CREATE UNIQUE INDEX room_groups_id_subscriber
        ON room_groups (id, subscriber_id)
    `);

    // A physical room. What housekeeping cleans and what a booking is finally
    // assigned to.
    await c.query(`
      CREATE TABLE rooms (
        id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        subscriber_id integer NOT NULL REFERENCES subscribers (id) ON DELETE CASCADE,
        group_id      integer NOT NULL,
        name          text NOT NULL,
        -- 'active' or 'out_of_service'. A room being refurbished should stop
        -- taking bookings without being deleted and losing its history.
        status        text NOT NULL DEFAULT 'active',
        sort          integer NOT NULL DEFAULT 0,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        -- subscriber_id is repeated here rather than reached through the group,
        -- because every availability query scopes by venue and the extra join
        -- would be on the hottest path in the module. The composite key is what
        -- makes the duplication safe: a room cannot name a group belonging to
        -- another venue, so the two columns cannot disagree. Without this it
        -- would be a denormalisation held together by hope.
        FOREIGN KEY (group_id, subscriber_id)
          REFERENCES room_groups (id, subscriber_id) ON DELETE CASCADE
      )
    `);

    await c.query(`
      CREATE UNIQUE INDEX rooms_name
        ON rooms (subscriber_id, lower(name))
    `);
    await c.query('CREATE INDEX rooms_group ON rooms (group_id)');

    // A stay. Held against a group from the moment it arrives; room_id is
    // filled in when somebody assigns it, which is what the calendar's drag
    // and drop will do.
    await c.query(`
      CREATE TABLE bookings (
        id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        subscriber_id integer NOT NULL REFERENCES subscribers (id) ON DELETE CASCADE,
        -- RESTRICT, not CASCADE: a room type with bookings against it must not
        -- be deletable, because that would delete the bookings with it.
        group_id      integer NOT NULL REFERENCES room_groups (id) ON DELETE RESTRICT,
        -- SET NULL: deleting a room unassigns its stays rather than destroying
        -- them. They fall back to the unassigned row on the calendar, which is
        -- recoverable; a lost booking is not.
        room_id       integer REFERENCES rooms (id) ON DELETE SET NULL,
        guest_name    text NOT NULL,
        guest_email   text,
        guest_phone   text,
        adults        integer NOT NULL DEFAULT 1,
        children      integer NOT NULL DEFAULT 0,
        arrival       date NOT NULL,
        departure     date NOT NULL,
        -- confirmed | in_house | checked_out | cancelled | no_show
        status        text NOT NULL DEFAULT 'confirmed',
        -- 'direct' now; the channel the stay came from once there are others.
        source        text NOT NULL DEFAULT 'direct',
        notes         text,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        -- One night minimum, in the database. Departure day is not a night, so
        -- departure = arrival is a stay of nothing. See nights.js.
        CONSTRAINT bookings_at_least_one_night CHECK (departure > arrival)
      )
    `);

    // The two questions asked of this table: this venue's arrivals around a
    // date, and one booking by id.
    await c.query(`
      CREATE INDEX bookings_venue_arrival
        ON bookings (subscriber_id, arrival)
    `);

    // The room nights master: one row per room per night.
    //
    // Rows exist only for an assigned booking. An unassigned one holds no
    // room, so it holds no nights — it is counted against its group instead,
    // and shows on the calendar as unassigned.
    await c.query(`
      CREATE TABLE room_nights (
        id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        subscriber_id integer NOT NULL REFERENCES subscribers (id) ON DELETE CASCADE,
        room_id       integer NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
        night         date NOT NULL,
        booking_id    integer NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
        created_at    timestamptz NOT NULL DEFAULT now()
      )
    `);

    // The constraint the whole module rests on: a room can be sold once per
    // night. Overbooking is not something application code has to remember to
    // check — it is refused here, so every path that could cause it fails
    // loudly, including two requests racing.
    //
    // No WHERE clause, because cancelling a booking deletes its nights rather
    // than leaving them behind with a status. The booking row keeps
    // status = 'cancelled' as the record; the inventory goes back immediately.
    await c.query(`
      CREATE UNIQUE INDEX room_nights_room_night
        ON room_nights (room_id, night)
    `);

    // The calendar reads a venue's window of nights in one go.
    await c.query(`
      CREATE INDEX room_nights_venue_night
        ON room_nights (subscriber_id, night)
    `);
    await c.query('CREATE INDEX room_nights_booking ON room_nights (booking_id)');
  },

  async (c) => {
    // Rates, slice three.
    //
    // Money is a whole number of the currency's smallest unit — satang for
    // baht. Never a float and never `money`: 0.1 + 0.2 is not 0.3, and a rate
    // multiplied over a fortnight in floating point is wrong in the last
    // decimal place, which is a disagreement with a guest over their bill.
    // See tariff.js.
    await c.query("ALTER TABLE subscribers ADD COLUMN currency text");

    // A sellable rate for a room type: Flexible, Non-refundable, Room only.
    //
    // The table exists now even though the first version of the UI will show
    // one plan per type, because plans are what every channel expects to be
    // handed and retrofitting them would mean moving every rate row onto a new
    // parent. A column now costs nothing; a migration later costs a weekend.
    await c.query(`
      CREATE TABLE rate_plans (
        id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        subscriber_id integer NOT NULL REFERENCES subscribers (id) ON DELETE CASCADE,
        group_id      integer NOT NULL,
        name          text NOT NULL,
        -- What a night costs unless a rate_nights row says otherwise. Nullable
        -- so a plan can exist before anybody has decided its price; a stay
        -- against an unpriced plan is refused rather than quoted at zero.
        base_minor    integer,
        -- The channel manager's own id, as on room_groups.
        external_ref  text,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        -- The same composite-key trick as rooms: subscriber_id is repeated so
        -- every rate query scopes by venue without joining through the group,
        -- and the key is what stops the two disagreeing.
        FOREIGN KEY (group_id, subscriber_id)
          REFERENCES room_groups (id, subscriber_id) ON DELETE CASCADE
      )
    `);

    await c.query(`
      CREATE UNIQUE INDEX rate_plans_name
        ON rate_plans (group_id, lower(name))
    `);
    await c.query(
      'CREATE INDEX rate_plans_venue ON rate_plans (subscriber_id)'
    );

    // Overrides, one row per plan per night — and only where a night differs
    // from the plan's base. A property with one price all year has no rows
    // here at all; one with a high season has rows for the high season. Storing
    // every night regardless would be 365 rows per plan per year to say
    // nothing.
    //
    // Deliberately mirrors room_nights: same shape, same reasoning, and the
    // calendar reads both the same way.
    await c.query(`
      CREATE TABLE rate_nights (
        id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        subscriber_id integer NOT NULL REFERENCES subscribers (id) ON DELETE CASCADE,
        plan_id       integer NOT NULL REFERENCES rate_plans (id) ON DELETE CASCADE,
        night         date NOT NULL,
        -- All three nullable: a row may set a price, a restriction, or both.
        -- Null means "whatever the plan says", not "zero" and not "closed".
        amount_minor  integer,
        min_nights    integer,
        closed        boolean,
        closed_to_arrival boolean,
        updated_at    timestamptz NOT NULL DEFAULT now()
      )
    `);

    // One override per plan per night. Setting a range twice updates rather
    // than stacking, and the upsert in rates.js leans on this.
    await c.query(`
      CREATE UNIQUE INDEX rate_nights_plan_night
        ON rate_nights (plan_id, night)
    `);
    await c.query(`
      CREATE INDEX rate_nights_venue_night
        ON rate_nights (subscriber_id, night)
    `);

    // What a booking was quoted, frozen at the moment it was taken.
    //
    // Stored rather than recomputed. A rate changed in March must not silently
    // reprice a stay somebody booked in January — the quote is what was agreed,
    // and recomputing it would make every past booking a moving number.
    await c.query('ALTER TABLE bookings ADD COLUMN rate_plan_id integer REFERENCES rate_plans (id) ON DELETE SET NULL');
    await c.query('ALTER TABLE bookings ADD COLUMN total_minor integer');
  },

  async (c) => {
    // Housekeeping, slice four.
    //
    // Current state, not a log. 'clean' or 'dirty' — whether the room can be
    // given to somebody today. A third state ('inspected', for a supervisor's
    // sign-off) is what larger hotels use and is a column change away; adding
    // it now would be a state nobody at a ten-room property ever sets.
    //
    // Deliberately separate from rooms.status, which is whether the room exists
    // to be sold at all. A room being refurbished is out_of_service; a room
    // somebody left this morning is dirty. Conflating them would mean a room
    // coming back from maintenance defaults to sellable without anybody having
    // cleaned it.
    //
    // Defaults to clean, because every existing room has been sitting there
    // unbooked and the alternative is a fresh install where every room needs
    // ticking off before it can be used.
    await c.query(
      "ALTER TABLE rooms ADD COLUMN housekeeping text NOT NULL DEFAULT 'clean'"
    );
  },

  async (c) => {
    // Guests, slice five — the people on a booking, for Thailand's TM30.
    //
    // Separate from bookings.guest_name, which is whoever the reservation is
    // under. A family of four is one booking and four notifiable people, and a
    // booking made by a company is under a name that never arrives.
    //
    // READ THIS BEFORE ADDING A COLUMN. This is the most sensitive table in the
    // product. It holds identity documents belonging to people who are not our
    // customers and never agreed anything with us — they handed a passport to a
    // hotel. The nightly dump in scripts/backup-to-s3.sh carries all of it to
    // S3, and a passport number, unlike a password, cannot be rotated after a
    // leak.
    //
    // So the number itself is encrypted, by secrets.js, with a key that lives
    // in the environment and not in the database. The dump on its own decrypts
    // to nothing. Anything added here that is comparably identifying — a
    // document image, an ID card number — goes the same way, and anything that
    // does not need to be here should not be.
    await c.query(`
      CREATE TABLE booking_guests (
        id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        subscriber_id integer NOT NULL REFERENCES subscribers (id) ON DELETE CASCADE,
        booking_id    integer NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,

        family_name   text NOT NULL,
        first_name    text NOT NULL,
        middle_name   text,
        -- As written in the passport, which is what Immigration matches on.
        nationality   text,
        date_of_birth date,
        phone         text,
        -- When they entered Thailand, off the stamp or the arrival card. Not
        -- when they reached this property: somebody on a three-week trip checks
        -- in here on day twelve, and the notification asks for both.
        arrived_in_thailand date,

        -- iv:tag:ciphertext, from secrets.js. Never the number itself.
        passport_enc  text,
        -- The last four, in the clear, so a person at the desk can confirm they
        -- have the right passport without anything decrypting it. Four
        -- characters identify nobody.
        passport_tail text,

        -- When this stay was notified, and by whom. Null means not yet, which
        -- is what the export selects on.
        notified_at   timestamptz,

        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      )
    `);

    await c.query(
      'CREATE INDEX booking_guests_booking ON booking_guests (booking_id)'
    );
    // The export asks "everybody at this venue arriving between two dates who
    // has not been notified", which is this index.
    await c.query(`
      CREATE INDEX booking_guests_pending
        ON booking_guests (subscriber_id, notified_at)
    `);
  },

  /**
   * Whether this guest has to be reported, when the rule gets it wrong.
   *
   * Three states, and the third is the reason for the column. Null means
   * "decide from nationality", which is what every existing row keeps; true
   * means report regardless; false means exempt. A plain boolean would have
   * needed a backfill, and a backfill freezes today's reading of the rule onto
   * every guest already stored — including the ones it got wrong, which is
   * precisely the set this exists for.
   *
   * No index. It is only ever read on a row already found by booking id, or by
   * (subscriber_id, notified_at).
   */
  async (c) => {
    await c.query('ALTER TABLE booking_guests ADD COLUMN tm30_required boolean');
  },

  /**
   * What the bookings list sorts and filters on.
   *
   * Until now the only index on bookings was (subscriber_id, arrival), which is
   * what a calendar window needs. A list that can be narrowed by status, room
   * type, room or guest name asks different questions, and every one of them
   * was a scan of the venue's whole history.
   *
   * Plain CREATE INDEX, not CONCURRENTLY: migrate() runs each step inside a
   * transaction and a concurrent build cannot. These tables are per-venue and
   * small, so the write lock is milliseconds — and a migration that takes a
   * lock briefly at deploy is a better trade than one that cannot run at all.
   *
   * Deliberately no pg_trgm. Substring search here is always already bounded by
   * subscriber_id and usually by a date range, which is a few thousand rows for
   * any real property; the name index serves prefix matching, and the rest is a
   * scan of an already-tiny set. Do not add the extension without measuring
   * first — it needs privileges this deployment should not have to assume.
   */
  async (c) => {
    await c.query(
      'CREATE INDEX bookings_venue_departure ON bookings (subscriber_id, departure)'
    );
    await c.query(
      'CREATE INDEX bookings_venue_status_arrival ON bookings (subscriber_id, status, arrival DESC)'
    );
    await c.query(
      'CREATE INDEX bookings_venue_group_arrival ON bookings (subscriber_id, group_id, arrival DESC)'
    );
    await c.query(
      'CREATE INDEX bookings_venue_room_arrival ON bookings (subscriber_id, room_id, arrival DESC)'
    );
    await c.query(
      'CREATE INDEX bookings_venue_name ON bookings (subscriber_id, lower(guest_name))'
    );
  },

  /**
   * Which review sites a venue has decided it is not on.
   *
   * A JSON list of platform ids, like `categories` above it.
   *
   * Without this, "is the Tripadvisor link set" has two answers that look the
   * same — not yet, and never — so a setup checklist can never finish for a
   * venue that only uses Google, which is most of them. It would nag forever,
   * people would stop reading it, and a checklist nobody reads is worse than
   * no checklist at all.
   *
   * Nullable and unread when absent: every venue already stored has decided
   * nothing, which is exactly what null means here.
   */
  async (c) => {
    await c.query('ALTER TABLE subscribers ADD COLUMN platforms_off text');
  },

  /**
   * Reviews that came from the listings, rather than ones we drafted.
   *
   * Kept apart from review_events on purpose. That table is our own
   * product's output — what the writer produced and whether a guest carried
   * it off — and this is other people's writing, fetched from somewhere else,
   * with a different owner and a different lifecycle. One table holding both
   * would need a column saying which kind each row was, and every query would
   * then have to remember it.
   *
   * The unique index is the whole de-duplication story. `external_id` is the
   * platform's own id where it gives one and a fingerprint where it does not,
   * so re-fetching the same thirty days updates rows instead of stacking
   * copies of them — including the owner's reply, which is why replied_at
   * lives here rather than being worked out.
   */
  async (c) => {
    await c.query(`
      CREATE TABLE external_reviews (
        id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        subscriber_id integer NOT NULL REFERENCES subscribers (id) ON DELETE CASCADE,
        -- google | tripadvisor | facebook | wongnai, from platforms.js
        platform      text NOT NULL,
        external_id   text NOT NULL,
        author        text,
        -- Nullable: not every platform has stars, and a missing rating is not
        -- a zero.
        rating        integer,
        body          text,
        posted_at     timestamptz NOT NULL,
        -- When the property answered, and with what. Null means unanswered,
        -- which is the thing the list is sorted and filtered by.
        replied_at    timestamptz,
        reply_body    text,
        url           text,
        fetched_at    timestamptz NOT NULL DEFAULT now(),
        created_at    timestamptz NOT NULL DEFAULT now()
      )
    `);

    await c.query(`
      CREATE UNIQUE INDEX external_reviews_identity
        ON external_reviews (subscriber_id, platform, external_id)
    `);

    // What the list actually asks for: this venue, newest first, last month.
    await c.query(`
      CREATE INDEX external_reviews_recent
        ON external_reviews (subscriber_id, posted_at DESC)
    `);

    // Unanswered ones, which is the only filter worth an index of its own.
    await c.query(`
      CREATE INDEX external_reviews_unanswered
        ON external_reviews (subscriber_id, posted_at DESC)
        WHERE replied_at IS NULL
    `);
  },

  async (c) => {
    /*
     * Whether a review's date is a real one or a guess.
     *
     * A listing page does not print dates, it prints "3 weeks ago" — so a
     * review read off one gets an estimate, and the estimate is only accurate
     * on the first read. Every later read says a bigger number about the same
     * review, and a stored date that follows it slides steadily backwards
     * until the review drops out of the thirty-day window and disappears from
     * the screen by itself.
     *
     * So the first estimate is kept and later ones are ignored, and this is
     * the column that makes that decidable. A real date always wins over a
     * guess, which is what happens when an API eventually supplies one for a
     * review that was read off a page first.
     */
    await c.query(
      `ALTER TABLE external_reviews
         ADD COLUMN approximate boolean NOT NULL DEFAULT false`
    );
  },

  async (c) => {
    /*
     * The PIN a housekeeping shift opens the board with.
     *
     * Hashed, although it is four digits and shared: a database dump should
     * not hand somebody the room list of every venue on the platform at once.
     * Null means the board is switched off for this venue, which is the state
     * every venue starts in — an unprotected screen nobody asked for is worse
     * than no screen.
     */
    await c.query('ALTER TABLE subscribers ADD COLUMN housekeeping_pin text');
    await c.query(
      'ALTER TABLE subscribers ADD COLUMN housekeeping_pin_at timestamptz'
    );
  },

  async (c) => {
    /*
     * What has to be done in a room, and a record of it being done.
     *
     * The list is per room type, because the work genuinely differs — a loft
     * has a staircase and a bungalow does not. group_id NULL means every room
     * in the venue, which is where most items end up: the bathroom gets
     * cleaned whatever the room is called.
     */
    await c.query(`
      CREATE TABLE checklist_items (
        id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        subscriber_id integer NOT NULL REFERENCES subscribers (id) ON DELETE CASCADE,
        group_id      integer,
        label         text NOT NULL,
        sort          integer NOT NULL DEFAULT 0,
        created_at    timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (group_id, subscriber_id)
          REFERENCES room_groups (id, subscriber_id) ON DELETE CASCADE
      )
    `);
    await c.query(`
      CREATE INDEX checklist_items_venue
        ON checklist_items (subscriber_id, sort, id)
    `);

    /*
     * A tick, against a room and a day.
     *
     * The day and not a timestamp, because the unit of work is a morning: the
     * same room is cleaned again tomorrow and yesterday's ticks must not carry
     * over. The primary key is what makes a second tap on the same item
     * harmless, which matters on a phone in a corridor with a bad signal.
     *
     * ON DELETE CASCADE from the item as well as the room: taking a line out
     * of the standard should not leave ticks behind that refer to nothing.
     */
    await c.query(`
      CREATE TABLE room_checks (
        subscriber_id integer NOT NULL REFERENCES subscribers (id) ON DELETE CASCADE,
        room_id       integer NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
        item_id       integer NOT NULL REFERENCES checklist_items (id) ON DELETE CASCADE,
        on_day        date NOT NULL,
        done_at       timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (room_id, item_id, on_day)
      )
    `);
    await c.query(`
      CREATE INDEX room_checks_day ON room_checks (subscriber_id, on_day)
    `);
  },

  /*
   * A photograph of what the line means.
   *
   * "Bathroom clean" is not an instruction, it is a word that every person
   * reading it fills in differently — and the people reading it here are
   * often working in their second or third language, at seven in the morning,
   * on a phone. A picture of the shelf as the owner wants it left settles in
   * one glance what a sentence cannot settle at all.
   *
   * Stored as a data URI in the row, like the logo and the background, rather
   * than as a file on disk or a link to the venue's own server. The reasons
   * are the ones assets.js already gives: a link means a request to somebody
   * else's host from a housekeeper's phone every morning, and a file on disk
   * means the backup is no longer one dump.
   *
   * Nullable, and most will stay null. A line like "check the minibar" does
   * not need a photograph and a standard where every line has one is a
   * standard nobody scrolls to the bottom of.
   */
  async (c) => {
    await c.query('ALTER TABLE checklist_items ADD COLUMN photo text');
  },

  /*
   * The welcome page: the venue's links, and the guests who signed up to see
   * them.
   *
   * The links are a JSON list on the subscriber row, like `categories`: a
   * handful of label-and-address pairs read whole on every guest visit, with
   * nothing to join to.
   *
   * Sign-ups are rows, one per email per venue — the unique index is on the
   * lower-cased address, so a guest typing it differently on a second visit is
   * still one entry. The consent flag and its time are kept apart from the
   * sign-up itself because they are different facts: everyone here gave an
   * address to see the links, and only some agreed to be emailed.
   *
   * ON DELETE CASCADE from the venue: a guest's details belong to the venue
   * they gave them to and have no reason to outlive it.
   */
  async (c) => {
    await c.query('ALTER TABLE subscribers ADD COLUMN welcome_links text');
    await c.query(`
      CREATE TABLE guest_signups (
        id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        subscriber_id     integer NOT NULL REFERENCES subscribers (id) ON DELETE CASCADE,
        name              text NOT NULL,
        email             text NOT NULL,
        marketing_consent boolean NOT NULL DEFAULT false,
        consented_at      timestamptz,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now()
      )
    `);
    await c.query(`
      CREATE UNIQUE INDEX guest_signups_email
        ON guest_signups (subscriber_id, lower(email))
    `);
  },

  /*
   * The marketplace: guests finding a venue on reviewslip.com and booking it
   * themselves. See docs/marketplace.md.
   *
   * Listed is a column because search filters on it; everything else a guest
   * reads about the venue is one JSON profile, checked by market.js, the way
   * welcome_links is. `place` already exists and is what search matches.
   *
   * Photos are their own table, not a JSON list on the venue: the subscriber
   * row is read on every request, and eight photographs on it would be two
   * megabytes carried by every review page. A photo with no group is the
   * venue's; with one, it is that room type's.
   *
   * A plan says what it includes and how it cancels — what a guest compares
   * between two prices for the same room. cancel_days null is non-refundable.
   *
   * A marketplace booking carries a reference the guest quotes, and what is
   * due online. payment_status is 'not_connected' until there is a payment
   * provider: the venue's choice of deposit or full payment is stored now and
   * charged once one exists.
   */
  async (c) => {
    await c.query('ALTER TABLE subscribers ADD COLUMN market_listed boolean NOT NULL DEFAULT false');
    await c.query('ALTER TABLE subscribers ADD COLUMN market_profile text');
    await c.query('CREATE INDEX subscribers_market_listed ON subscribers (id) WHERE market_listed');

    await c.query('ALTER TABLE room_groups ADD COLUMN profile text');

    await c.query('ALTER TABLE rate_plans ADD COLUMN breakfast boolean NOT NULL DEFAULT false');
    await c.query('ALTER TABLE rate_plans ADD COLUMN cancel_days integer');

    await c.query(`
      CREATE TABLE market_photos (
        id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        subscriber_id integer NOT NULL REFERENCES subscribers (id) ON DELETE CASCADE,
        group_id      integer REFERENCES room_groups (id) ON DELETE CASCADE,
        data          text NOT NULL,
        sort          integer NOT NULL DEFAULT 0,
        created_at    timestamptz NOT NULL DEFAULT now()
      )
    `);
    await c.query('CREATE INDEX market_photos_venue ON market_photos (subscriber_id, group_id, sort, id)');

    await c.query('ALTER TABLE bookings ADD COLUMN reference text');
    await c.query('ALTER TABLE bookings ADD COLUMN due_now_minor integer');
    await c.query('ALTER TABLE bookings ADD COLUMN payment_status text');
    // Not unique: two rooms booked together are two booking rows under one
    // reference, the way the guest thinks of them.
    await c.query('CREATE INDEX bookings_reference ON bookings (reference) WHERE reference IS NOT NULL');
  },

  /*
   * Cancelling.
   *
   * The free-cancellation deadline is frozen on the booking when it is taken.
   * Read from the rate instead, a venue tightening its terms in March would
   * take away a cancellation a guest was promised in January. Null is
   * non-refundable.
   *
   * Who cancelled and when, so the guest is told the right thing and the
   * venue can see that a guest let the room go rather than the desk.
   */
  async (c) => {
    await c.query('ALTER TABLE bookings ADD COLUMN free_cancel_until date');
    await c.query('ALTER TABLE bookings ADD COLUMN cancelled_at timestamptz');
    await c.query('ALTER TABLE bookings ADD COLUMN cancelled_by text');
  },

  /*
   * The softphone: guests and customers ring a venue's desk, or Reviewslip's
   * Sales and Support, from a browser.
   *
   * An agent is someone who answers. A venue's own login and every admin is
   * one through their account (account_id); staff a customer invites to
   * answer for some of their venues have a phone-only login of their own
   * (owner_account_id, password_hash). Exactly one of the two is set.
   *
   * Which lines an account's agent answers is worked out, not stored: every
   * venue of the account, plus Sales and Support for an admin. Invited staff
   * answer the venues in voice_agent_venues. voice_lines_off is "not taking
   * this one right now", kept apart so the owner re-saving venues never
   * undoes it.
   *
   * Hours are one week per person. No rows means any time they are on duty;
   * a shift ending before it starts runs past midnight.
   *
   * Voicemail audio is kept in the row: two minutes at most, a few hundred
   * KB, and backed up with everything else every night.
   */
  async (c) => {
    await c.query(`
      CREATE TABLE voice_agents (
        id               integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        account_id       integer UNIQUE REFERENCES accounts (id) ON DELETE CASCADE,
        owner_account_id integer REFERENCES accounts (id) ON DELETE CASCADE,
        email            text NOT NULL,
        name             text NOT NULL,
        password_hash    text,
        invite_hash      text,
        invite_expires   timestamptz,
        on_duty          boolean NOT NULL DEFAULT false,
        timezone         text NOT NULL DEFAULT 'Asia/Bangkok',
        created_at       timestamptz NOT NULL DEFAULT now(),
        CHECK ((account_id IS NULL) <> (owner_account_id IS NULL))
      )
    `);
    // One phone login per address. An account's own row is keyed by the account.
    await c.query(
      'CREATE UNIQUE INDEX voice_agents_staff_email ON voice_agents (lower(email)) WHERE account_id IS NULL'
    );
    await c.query('CREATE INDEX voice_agents_owner ON voice_agents (owner_account_id)');
    await c.query('CREATE UNIQUE INDEX voice_agents_invite ON voice_agents (invite_hash) WHERE invite_hash IS NOT NULL');

    await c.query(`
      CREATE TABLE voice_agent_venues (
        agent_id      integer NOT NULL REFERENCES voice_agents (id) ON DELETE CASCADE,
        subscriber_id integer NOT NULL REFERENCES subscribers (id) ON DELETE CASCADE,
        PRIMARY KEY (agent_id, subscriber_id)
      )
    `);
    await c.query('CREATE INDEX voice_agent_venues_venue ON voice_agent_venues (subscriber_id)');

    await c.query(`
      CREATE TABLE voice_lines_off (
        agent_id integer NOT NULL REFERENCES voice_agents (id) ON DELETE CASCADE,
        line     text NOT NULL,
        PRIMARY KEY (agent_id, line)
      )
    `);

    await c.query(`
      CREATE TABLE voice_hours (
        agent_id  integer NOT NULL REFERENCES voice_agents (id) ON DELETE CASCADE,
        weekday   smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
        start_min smallint NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
        end_min   smallint NOT NULL CHECK (end_min BETWEEN 1 AND 1440)
      )
    `);
    await c.query('CREATE INDEX voice_hours_agent ON voice_hours (agent_id)');

    await c.query(`
      CREATE TABLE voice_push (
        endpoint   text PRIMARY KEY,
        agent_id   integer NOT NULL REFERENCES voice_agents (id) ON DELETE CASCADE,
        p256dh     text NOT NULL,
        auth       text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await c.query('CREATE INDEX voice_push_agent ON voice_push (agent_id)');

    // A phone session, or a one-time handoff from the dashboard to the phone.
    await c.query(`
      CREATE TABLE voice_sessions (
        token_hash text PRIMARY KEY,
        agent_id   integer NOT NULL REFERENCES voice_agents (id) ON DELETE CASCADE,
        kind       text NOT NULL,
        expires_at timestamptz NOT NULL
      )
    `);
    await c.query('CREATE INDEX voice_sessions_agent ON voice_sessions (agent_id)');

    // subscriber_id null is Reviewslip's own line, where team picks Sales or
    // Support. On a venue's line team is only which desk the page asked for.
    await c.query(`
      CREATE TABLE voice_calls (
        id            text PRIMARY KEY,
        subscriber_id integer REFERENCES subscribers (id) ON DELETE CASCADE,
        team          text NOT NULL,
        caller_name   text,
        page          text,
        started_at    timestamptz NOT NULL DEFAULT now(),
        answered_at   timestamptz,
        answered_by   integer REFERENCES voice_agents (id) ON DELETE SET NULL,
        answered_name text,
        ended_at      timestamptz,
        outcome       text
      )
    `);
    await c.query('CREATE INDEX voice_calls_line ON voice_calls (subscriber_id, team, started_at DESC)');

    await c.query(`
      CREATE TABLE voice_voicemails (
        id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        call_id        text NOT NULL UNIQUE REFERENCES voice_calls (id) ON DELETE CASCADE,
        audio          bytea NOT NULL,
        mime           text NOT NULL,
        seconds        integer NOT NULL,
        caller_name    text,
        caller_contact text,
        created_at     timestamptz NOT NULL DEFAULT now(),
        heard_at       timestamptz,
        heard_by       integer REFERENCES voice_agents (id) ON DELETE SET NULL,
        heard_name     text
      )
    `);
  },

  /*
   * Two phones. A venue's phone answers venues; Reviewslip's phone answers
   * Sales and Support. One login that is both an owner and an admin has a row
   * for each, so duty, hours, push and presence are kept apart: the front desk
   * can be on duty while the office phone is off. Existing rows were venue
   * phones — an admin's Sales and Support move to their new Reviewslip row
   * the first time they open it.
   */
  async (c) => {
    await c.query(`ALTER TABLE voice_agents ADD COLUMN scope text NOT NULL DEFAULT 'venues'
                     CHECK (scope IN ('venues', 'reviewslip'))`);
    await c.query('ALTER TABLE voice_agents DROP CONSTRAINT voice_agents_account_id_key');
    await c.query(
      'CREATE UNIQUE INDEX voice_agents_account_scope ON voice_agents (account_id, scope) WHERE account_id IS NOT NULL'
    );
    await c.query(`DELETE FROM voice_lines_off WHERE line IN ('sales', 'support')`);
  },

  /*
   * The phone under the dashboard's own sign-in. Staff a venue invites become
   * real accounts that can open nothing but the phone (phone_only), and their
   * agent row carries both their account and the owner who invited them — so
   * the old "one or the other" check goes.
   */
  async (c) => {
    await c.query('ALTER TABLE accounts ADD COLUMN phone_only boolean NOT NULL DEFAULT false');
    await c.query('ALTER TABLE voice_agents DROP CONSTRAINT voice_agents_check');
  },
];

// Any constant will do; it only has to be the same in every process.
const MIGRATION_LOCK = 8_274_123;

async function migrate() {
  const client = await pool.connect();

  try {
    // Two processes starting at once — a restart overlapping the old one —
    // would otherwise race to create the same table. The lock is tied to the
    // session, so a crash mid-migration cannot wedge the next boot.
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);

    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_version (version integer NOT NULL)'
    );

    const { rows } = await client.query('SELECT version FROM schema_version');
    if (!rows.length) {
      await client.query('INSERT INTO schema_version (version) VALUES (0)');
    }
    const from = rows[0]?.version ?? 0;

    for (let version = from; version < MIGRATIONS.length; version++) {
      // Per step rather than around the whole run: a failure half way leaves
      // the completed steps in place, and the next boot resumes from there.
      await client.query('BEGIN');
      try {
        await MIGRATIONS[version](client);
        await client.query('UPDATE schema_version SET version = $1', [
          version + 1,
        ]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]);
    } catch {
      // Releasing the connection drops the lock anyway. Failing here would
      // only mask whatever real error sent us into this block.
    }
    client.release();
  }
}

/**
 * Migrations run once, at require time. Callers that must not query before the
 * schema exists — the server on boot — await this; everything else is reached
 * through a request, by which point it has long since settled.
 */
const ready = migrate();

module.exports = { pool, query, one, all, tx, ready };
