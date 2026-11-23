'use strict';

/**
 * The messages this product sends, as text.
 *
 * Pure, and apart from mailer.js, which cannot be tested without AWS. What an
 * invitation actually says is the part worth being able to check.
 *
 * There is one rule behind all of it: an invitation goes to somebody who never
 * gave us their address. Someone else typed it in. That makes it the one kind
 * of mail here that a stranger did not ask for, and everything below follows
 * from that — it says who invited them, it says it will not happen again, and
 * it happens once with no follow-up. Not politeness. A domain that sends
 * unwanted mail loses the ability to deliver the password resets and receipts
 * that customers actually need, and SES will suspend an account over a bounce
 * rate before that.
 */

/** Trim, collapse whitespace, and cap — for anything shown to a stranger. */
function clean(value, max = 80) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

/**
 * An invitation to sign up.
 *
 * `referrer` is a business name, not an email address. Naming the business is
 * what makes the message make sense to the person reading it; naming the
 * account behind it would hand a stranger somebody's email because a third
 * party typed theirs into a box. When there is no business name yet it falls
 * back to something anonymous rather than reaching for the address.
 *
 * @param {{referrer?: string, url: string}} input
 * @returns {{subject: string, text: string, html: string}}
 */
function inviteEmail({ referrer, url }) {
  const who = clean(referrer) || 'Someone';
  const link = String(url ?? '');

  const subject = `${who} invited you to Reviewslip`;

  const text = [
    `${who} uses Reviewslip to help their customers write reviews, and has invited you to try it.`,
    '',
    'Set up your account here:',
    link,
    '',
    'The link is meant for you and works once.',
    '',
    `If you do not know ${who}, ignore this — it is the only message you will get from us.`,
    '',
    '— Reviewslip',
  ].join('\n');

  // Deliberately plain. A table-based, image-heavy template is more likely to
  // be filtered than read, and this message is four sentences long.
  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.6;color:#1b2a23;max-width:34rem">',
    `<p>${escapeHtml(who)} uses Reviewslip to help their customers write reviews, and has invited you to try it.</p>`,
    `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:0.7rem 1.3rem;border-radius:999px;background:#e9a03b;color:#22190a;text-decoration:none;font-weight:600">Set up your account</a></p>`,
    `<p style="font-size:0.9em;color:#5a6b63">Or paste this into your browser:<br><a href="${escapeHtml(link)}" style="color:#2f5f4c">${escapeHtml(link)}</a></p>`,
    '<p style="font-size:0.9em;color:#5a6b63">The link is meant for you and works once.</p>',
    `<p style="font-size:0.9em;color:#5a6b63">If you do not know ${escapeHtml(who)}, ignore this — it is the only message you will get from us.</p>`,
    '<p style="font-size:0.9em;color:#5a6b63">— Reviewslip</p>',
    '</div>',
  ].join('');

  return { subject, text, html };
}

/* ------------------------------------------------------------- check-in */

/**
 * The note a guest gets when they are checked in.
 *
 * From the property, about their stay — not from us about our product. It
 * carries the two facts somebody in a strange town actually wants written
 * down and searchable: which room they are in and when they are due to leave.
 *
 * Deliberately not a receipt. What a stay cost is between the guest and the
 * property and may still change; putting a number in an automatic email makes
 * it a quote nobody meant to give.
 *
 * No review link either, and this is the restraint that matters most: the
 * product exists to ask for reviews, and asking on the doorstep, before
 * anybody has slept in the bed, is how a property ends up with reviews written
 * about a check-in desk. The ask belongs at the end of a stay.
 *
 * @param {{venue: string, guestName?: string, roomName?: string|null,
 *   arrival: string, departure: string, nights: number}} input
 * @returns {{subject: string, text: string, html: string}}
 */
function welcomeEmail({ venue, guestName, roomName, arrival, departure, nights }) {
  const place = clean(venue, 120) || 'your stay';
  const who = clean(guestName, 120);
  const room = clean(roomName, 60);
  const stay = `${arrival} to ${departure}`;
  const count = `${nights} night${nights === 1 ? '' : 's'}`;

  const subject = `You are checked in at ${place}`;

  const lines = [
    who ? `Hello ${who},` : 'Hello,',
    '',
    `You are checked in at ${place}.`,
    '',
    room ? `Room: ${room}` : 'Your room will be confirmed at the desk.',
    `Staying: ${stay} (${count})`,
    '',
    'Keep this for the dates and the room number. Anything else, ask at the desk.',
    '',
    `— ${place}`,
  ];

  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.6;color:#1b2a23;max-width:34rem">',
    `<p>${who ? `Hello ${escapeHtml(who)},` : 'Hello,'}</p>`,
    `<p>You are checked in at <strong>${escapeHtml(place)}</strong>.</p>`,
    '<table style="border-collapse:collapse;font-size:15px">',
    room
      ? `<tr><td style="padding:0.2rem 1rem 0.2rem 0;color:#5a6b63">Room</td><td style="padding:0.2rem 0"><strong>${escapeHtml(room)}</strong></td></tr>`
      : '',
    `<tr><td style="padding:0.2rem 1rem 0.2rem 0;color:#5a6b63">Staying</td><td style="padding:0.2rem 0">${escapeHtml(stay)} (${escapeHtml(count)})</td></tr>`,
    '</table>',
    '<p style="font-size:0.9em;color:#5a6b63">Keep this for the dates and the room number. Anything else, ask at the desk.</p>',
    `<p style="font-size:0.9em;color:#5a6b63">— ${escapeHtml(place)}</p>`,
    '</div>',
  ].join('');

  return { subject, text: lines.join('\n'), html };
}

/* ---------------------------------------------------------- marketplace */

function rowsHtml(rows) {
  return [
    '<table style="border-collapse:collapse;font-size:15px">',
    ...rows.map(
      ([label, value]) =>
        `<tr><td style="padding:0.2rem 1rem 0.2rem 0;color:#5a6b63;vertical-align:top">${escapeHtml(label)}</td><td style="padding:0.2rem 0">${escapeHtml(value)}</td></tr>`
    ),
    '</table>',
  ].join('');
}

/**
 * A guest's booking confirmation from the marketplace.
 *
 * Everything they need at the door is in the message itself — reference,
 * dates, room, what they pay and when — so it is useful with no signal at a
 * bus station. The link opens the booking again; it carries a key, not their
 * email address.
 *
 * @param {{venue: string, reference: string, guestName: string, roomName: string,
 *   planName: string, arrival: string, departure: string, nights: number, rooms: number,
 *   total: string, cancellation: string, payment: string, checkIn: string, checkOut: string,
 *   link: string, contact?: string}} input
 */
function bookingEmail(input) {
  const place = clean(input.venue, 120);
  const who = clean(input.guestName, 120);
  const subject = `Booking confirmed at ${place} · ${input.reference}`;
  const rows = [
    ['Reference', input.reference],
    ['Room', `${clean(input.roomName, 60)}${input.rooms > 1 ? ` × ${input.rooms}` : ''} · ${clean(input.planName, 60)}`],
    ['Check-in', `${input.arrival}, from ${input.checkIn}`],
    ['Check-out', `${input.departure}, by ${input.checkOut}`],
    ['Nights', String(input.nights)],
    ['Total', input.total],
    ['Payment', input.payment],
    ['Cancellation', input.cancellation],
  ];

  const text = [
    who ? `Hello ${who},` : 'Hello,',
    '',
    `Your booking at ${place} is confirmed.`,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    `See your booking: ${input.link}`,
    input.contact ? `Questions? Contact ${place}: ${input.contact}` : '',
    '',
    `— ${place}, booked through Reviewslip`,
  ].join('\n');

  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.6;color:#1b2a23;max-width:34rem">',
    `<p>${who ? `Hello ${escapeHtml(who)},` : 'Hello,'}</p>`,
    `<p>Your booking at <strong>${escapeHtml(place)}</strong> is confirmed.</p>`,
    rowsHtml(rows),
    `<p><a href="${escapeHtml(input.link)}">See your booking</a></p>`,
    input.contact
      ? `<p style="font-size:0.9em;color:#5a6b63">Questions? Contact ${escapeHtml(place)}: ${escapeHtml(input.contact)}</p>`
      : '',
    `<p style="font-size:0.9em;color:#5a6b63">— ${escapeHtml(place)}, booked through Reviewslip</p>`,
    '</div>',
  ].join('');

  return { subject, text, html };
}

/**
 * The venue's notice of a marketplace booking.
 *
 * The guest's contact details are in it because the venue is who they booked
 * with and will need to reach them; it goes to the venue's own account address
 * and nowhere else.
 */
function bookingAlertEmail(input) {
  const place = clean(input.venue, 120);
  const subject = `New booking: ${clean(input.guestName, 80)}, ${input.arrival} · ${input.reference}`;
  const rows = [
    ['Reference', input.reference],
    ['Guest', `${clean(input.guestName, 120)} · ${input.guestEmail} · ${input.guestPhone}`],
    ['Room', `${clean(input.roomName, 60)}${input.rooms > 1 ? ` × ${input.rooms}` : ''} · ${clean(input.planName, 60)}`],
    ['Stay', `${input.arrival} to ${input.departure} (${input.nights} night${input.nights === 1 ? '' : 's'})`],
    ['Guests', input.party],
    ['Total', input.total],
    ...(input.requests ? [['Requests', clean(input.requests, 1000)]] : []),
  ];
  const text = [
    `A guest booked ${place} on Reviewslip. It is on your calendar, unassigned.`,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
  ].join('\n');
  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.6;color:#1b2a23;max-width:34rem">',
    `<p>A guest booked <strong>${escapeHtml(place)}</strong> on Reviewslip. It is on your calendar, unassigned.</p>`,
    rowsHtml(rows),
    '</div>',
  ].join('');
  return { subject, text, html };
}

/**
 * A marketplace booking, cancelled — to the guest.
 *
 * Says who cancelled, because the two cases want different things from the
 * reader: a guest who cancelled wants a receipt, and a guest whose venue
 * cancelled wants to know why and who to ask.
 *
 * @param {{venue: string, reference: string, guestName?: string, arrival: string,
 *   departure: string, by: 'guest'|'venue', contact?: string, link: string}} input
 */
function bookingCancelledEmail(input) {
  const place = clean(input.venue, 120);
  const who = clean(input.guestName, 120);
  const subject = `Booking cancelled at ${place} · ${input.reference}`;
  const what =
    input.by === 'venue'
      ? `${place} has cancelled your booking ${input.reference} for ${input.arrival} to ${input.departure}.`
      : `Your booking ${input.reference} at ${place} for ${input.arrival} to ${input.departure} is cancelled, as you asked.`;
  const next =
    input.by === 'venue'
      ? input.contact
        ? `If you did not expect this, contact ${place}: ${input.contact}`
        : `If you did not expect this, contact ${place}.`
      : 'Nothing was charged. We hope to see you another time.';

  const text = [
    who ? `Hello ${who},` : 'Hello,',
    '',
    what,
    '',
    next,
    '',
    `Find another stay: ${input.link}`,
    '',
    `— ${place}, booked through Reviewslip`,
  ].join('\n');

  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.6;color:#1b2a23;max-width:34rem">',
    `<p>${who ? `Hello ${escapeHtml(who)},` : 'Hello,'}</p>`,
    `<p>${escapeHtml(what)}</p>`,
    `<p>${escapeHtml(next)}</p>`,
    `<p><a href="${escapeHtml(input.link)}">Find another stay</a></p>`,
    `<p style="font-size:0.9em;color:#5a6b63">— ${escapeHtml(place)}, booked through Reviewslip</p>`,
    '</div>',
  ].join('');
  return { subject, text, html };
}

/**
 * A guest changed their booking — to the guest, as the new confirmation.
 *
 * @param {{venue: string, reference: string, guestName?: string, roomName: string,
 *   arrival: string, departure: string, nights: number, party: string, total: string,
 *   cancellation: string, link: string}} input
 */
function bookingChangedEmail(input) {
  const place = clean(input.venue, 120);
  const who = clean(input.guestName, 120);
  const subject = `Booking changed at ${place} · ${input.reference}`;
  const rows = [
    ['Reference', input.reference],
    ['Room', clean(input.roomName, 80)],
    ['Stay', `${input.arrival} to ${input.departure} (${input.nights} night${input.nights === 1 ? '' : 's'})`],
    ['Guests', input.party],
    ['New total', input.total],
    ['Cancellation', input.cancellation],
  ];
  const text = [
    who ? `Hello ${who},` : 'Hello,',
    '',
    `Your booking at ${place} has been changed. This replaces your earlier confirmation.`,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    `See your booking: ${input.link}`,
    '',
    `— ${place}, booked through Reviewslip`,
  ].join('\n');
  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.6;color:#1b2a23;max-width:34rem">',
    `<p>${who ? `Hello ${escapeHtml(who)},` : 'Hello,'}</p>`,
    `<p>Your booking at <strong>${escapeHtml(place)}</strong> has been changed. This replaces your earlier confirmation.</p>`,
    rowsHtml(rows),
    `<p><a href="${escapeHtml(input.link)}">See your booking</a></p>`,
    `<p style="font-size:0.9em;color:#5a6b63">— ${escapeHtml(place)}, booked through Reviewslip</p>`,
    '</div>',
  ].join('');
  return { subject, text, html };
}

/** The venue's notice that a guest changed their booking online. */
function bookingChangeAlertEmail(input) {
  const subject = `Changed by the guest: ${clean(input.guestName, 80)}, now ${input.arrival} · ${input.reference}`;
  const text = [
    `${clean(input.guestName, 120)} changed their Reviewslip booking ${input.reference} (${clean(input.roomName, 60)}).`,
    '',
    `Was: ${input.oldArrival} to ${input.oldDeparture}, ${input.oldParty}.`,
    `Now: ${input.arrival} to ${input.departure}, ${input.party}. New total ${input.total}.`,
    '',
    'It is on your calendar on the new dates, unassigned — give it a room.',
  ].join('\n');
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.6;color:#1b2a23;max-width:34rem">${text
    .split('\n\n')
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')}</div>`;
  return { subject, text, html };
}

/** The venue's notice that a guest cancelled online. */
function bookingCancelAlertEmail(input) {
  const subject = `Cancelled by the guest: ${clean(input.guestName, 80)}, ${input.arrival} · ${input.reference}`;
  const text = [
    `${clean(input.guestName, 120)} cancelled their Reviewslip booking ${input.reference} (${clean(input.roomName, 60)}${input.rooms > 1 ? ` × ${input.rooms}` : ''}, ${input.arrival} to ${input.departure}).`,
    '',
    'It was inside the free-cancellation window. The room is back on sale and off your calendar.',
  ].join('\n');
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.6;color:#1b2a23;max-width:34rem">${text
    .split('\n\n')
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('')}</div>`;
  return { subject, text, html };
}

/* -------------------------------------------------------------- tickets */

/**
 * A reply on a customer's ticket, to the customer.
 *
 * Carries the reply in full rather than "you have a new message". Somebody
 * waiting on support should be able to read the answer without signing in, and
 * a notification that withholds it is a second errand, not a courtesy.
 */
function ticketReplyEmail({ title, body, url }) {
  const subject = `Re: ${clean(title, 100)}`;
  const reply = String(body ?? '').trim();

  const text = [
    reply,
    '',
    '—',
    'Reply to this ticket here:',
    String(url ?? ''),
    '',
    '— Reviewslip support',
  ].join('\n');

  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.6;color:#1b2a23;max-width:34rem">',
    `<p style="white-space:pre-wrap">${escapeHtml(reply)}</p>`,
    '<hr style="border:none;border-top:1px solid #d9d2c2;margin:1.5rem 0">',
    `<p style="font-size:0.9em"><a href="${escapeHtml(String(url ?? ''))}" style="color:#2f5f4c">Reply to this ticket</a></p>`,
    '<p style="font-size:0.9em;color:#5a6b63">— Reviewslip support</p>',
    '</div>',
  ].join('');

  return { subject, text, html };
}

/**
 * Something happened on a ticket, to us.
 *
 * Plain text only. It goes to one mailbox that one person reads, and the point
 * is to know quickly — who, which venue, and what they said.
 */
function ticketAlertEmail({ opened, from, venue, title, body, url }) {
  const who = clean(from, 120) || 'A customer';
  const subject = `${opened ? 'New ticket' : 'Reply'}: ${clean(title, 90)}`;

  const text = [
    `${who}${venue ? ` (${clean(venue)})` : ''} ${opened ? 'opened a ticket' : 'replied'}:`,
    '',
    String(body ?? '').trim(),
    '',
    '—',
    String(url ?? ''),
  ].join('\n');

  return { subject, text, html: '' };
}

/**
 * Someone left a voicemail, to everyone who answers that line.
 *
 * Says who and how to reach them, not the recording: that stays behind the
 * phone page's sign-in, where playing it marks it heard for everyone else.
 */
function voicemailEmail({ line, caller, contact, seconds, url }) {
  const who = clean(caller, 80) || 'A caller';
  const subject = `Voicemail for ${clean(line, 80)} from ${who}`;
  const length = seconds >= 60 ? `${Math.floor(seconds / 60)} min ${seconds % 60} s` : `${seconds} s`;
  const lines = [
    `${who} left a ${length} message for ${clean(line, 80)}.`,
    contact ? `They can be reached at: ${clean(contact, 120)}` : 'They left no number or email.',
  ];

  const text = [...lines, '', `Listen on the phone: ${url}`, '', '— Reviewslip'].join('\n');
  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.6;color:#1b2a23;max-width:34rem">',
    ...lines.map((l) => `<p>${escapeHtml(l)}</p>`),
    `<p><a href="${escapeHtml(url)}" style="color:#2f5f4c">Listen on the phone</a></p>`,
    '<p style="font-size:0.9em;color:#5a6b63">— Reviewslip</p>',
    '</div>',
  ].join('');
  return { subject, text, html };
}

/** An email body: the paragraphs, a link, and the sign-off. */
function simpleHtml(paragraphs, link, linkText, quote) {
  return [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.6;color:#1b2a23;max-width:34rem">',
    ...paragraphs.map((l) => `<p>${escapeHtml(l)}</p>`),
    quote
      ? `<blockquote style="margin:0 0 1em;padding:0.6em 0.9em;border-left:3px solid #d1d1d1;white-space:pre-wrap;color:#242424">${escapeHtml(quote)}</blockquote>`
      : '',
    `<p><a href="${escapeHtml(link)}" style="color:#2f5f4c">${escapeHtml(linkText)}</a></p>`,
    '<p style="font-size:0.9em;color:#5a6b63">— Reviewslip</p>',
    '</div>',
  ].join('');
}

/**
 * A guest wrote to a line nobody could answer, or wrote again in a
 * conversation: to everyone on the line, with what they said.
 */
function chatEmail({ line, name, body, url }) {
  const who = clean(name, 80) || 'A guest';
  const place = clean(line, 80);
  const said = String(body || '').slice(0, 1500);
  const subject = `Message for ${place} from ${who}`;
  const lines = [`${who} wrote to ${place}:`];
  const text = [...lines, '', said, '', `Answer it: ${url}`, '', '— Reviewslip'].join('\n');
  return { subject, text, html: simpleHtml(lines, url, 'Answer it', said) };
}

/** The line answered: to the guest, with the answer and the way back in. */
function chatReplyEmail({ line, name, body, url }) {
  const place = clean(line, 80);
  const said = String(body || '').slice(0, 1500);
  const subject = `${place} answered your message`;
  const lines = [`Hello ${clean(name, 80) || 'there'},`, `${place} answered your message:`];
  const text = [...lines, '', said, '', `Read it and answer: ${url}`, '', '— Reviewslip'].join('\n');
  return { subject, text, html: simpleHtml(lines, url, 'Read it and answer', said) };
}

/**
 * A business shared with someone: open the dashboard, or, with no account
 * yet, sign in with this address (a code comes to it, no password).
 */
function shareEmail({ venue, by, role, hasAccount, url }) {
  const place = clean(venue, 120);
  const subject = `${place} was shared with you on Reviewslip`;
  const lines = [
    `${clean(by, 120) || 'Its owner'} shared ${place} with you on Reviewslip. Your access: ${clean(role, 40)}.`,
    hasAccount
      ? 'It is on your dashboard now.'
      : 'Sign in with this email address: we send a code to it, there is no password to make up.',
  ];
  const linkText = hasAccount ? 'Open the dashboard' : 'Sign in';
  const text = [...lines, '', `${linkText}: ${url}`, '', '— Reviewslip'].join('\n');
  return { subject, text, html: simpleHtml(lines, url, linkText) };
}

/** The six digits, large, for an email someone reads on a phone. */
function codeBlock(code) {
  return `<p style="font-size:2em;font-weight:700;letter-spacing:0.25em;margin:0.6em 0;color:#1b2a23">${escapeHtml(code)}</p>`;
}

/**
 * A customer added someone to answer their venue's calls.
 *
 * The code is in the email itself: they press the link, or open the app, and
 * type it. No password to make up.
 */
function voiceInviteEmail({ name, venue, by, url, code }) {
  const who = clean(name, 60);
  const place = clean(venue, 120);
  const subject = `Answer calls for ${place}`;
  const body = [
    `${clean(by, 120) || place} added you to answer calls for ${place} on Reviewslip.`,
    'Guests press Call on the venue’s pages and your phone or computer rings.',
  ];
  const how = 'Press the link, or open the Reviewslip app and sign in with this email, then enter the code. You stay signed in. The code works for 14 days.';
  const text = [
    who ? `Hello ${who},` : 'Hello,',
    '',
    ...body,
    '',
    `Your code: ${code}`,
    '',
    how,
    '',
    url,
    '',
    '— Reviewslip',
  ].join('\n');
  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.6;color:#1b2a23;max-width:34rem">',
    `<p>${who ? `Hello ${escapeHtml(who)},` : 'Hello,'}</p>`,
    ...body.map((l) => `<p>${escapeHtml(l)}</p>`),
    '<p>Your code:</p>',
    codeBlock(code),
    `<p>${escapeHtml(how)}</p>`,
    `<p><a href="${escapeHtml(url)}" style="color:#2f5f4c">Start answering calls</a></p>`,
    '<p style="font-size:0.9em;color:#5a6b63">— Reviewslip</p>',
    '</div>',
  ].join('');
  return { subject, text, html };
}

/**
 * A sign-in code, asked for on the sign-in or sign-up page.
 *
 * The code in the subject too, so it can be read off the notification without
 * opening anything.
 */
function codeEmail({ code, minutes }) {
  const subject = `${code} is your Reviewslip code`;
  const lines = [
    `Enter this code to sign in to Reviewslip. It works for ${minutes} minutes.`,
    'If you did not ask for it, ignore this email: nobody can sign in without the code.',
  ];
  const text = [`Your code: ${code}`, '', ...lines, '', '— Reviewslip'].join('\n');
  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.6;color:#1b2a23;max-width:34rem">',
    '<p>Your code:</p>',
    codeBlock(code),
    ...lines.map((l) => `<p>${escapeHtml(l)}</p>`),
    '<p style="font-size:0.9em;color:#5a6b63">— Reviewslip</p>',
    '</div>',
  ].join('');
  return { subject, text, html };
}

module.exports = {
  chatEmail,
  chatReplyEmail,
  shareEmail,
  voicemailEmail,
  voiceInviteEmail,
  codeEmail,
  bookingEmail,
  bookingAlertEmail,
  bookingCancelledEmail,
  bookingCancelAlertEmail,
  bookingChangedEmail,
  bookingChangeAlertEmail,
  welcomeEmail,
  inviteEmail,
  ticketReplyEmail,
  ticketAlertEmail,
  clean,
  escapeHtml,
};
