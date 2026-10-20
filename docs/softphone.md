# Calls: Reviewslip's own softphone

Built 2026-10-15. Guests press **Call** and talk to a venue's desk in the browser; when nobody is free
they leave a voice message. No phone numbers, no SIP, no per-minute cost: audio goes browser to browser
over WebRTC, and the review app only rings.

**Reviewslip's own Sales and Support are not on this phone** (2026-10-20). Call Sales and Call Support
ring the Vibe Crafted portal softphone, where our team already works, so nobody signs in to a second
phone. Those two buttons load the portal's widget (`voice-widget.js`, site key `reviewslip`); everything
else here is the venues' phone.

## Where the buttons are

| Page | Line | Shown as |
|---|---|---|
| Marketplace venue page, "Book directly" box | the venue | Call Reservations |
| Marketplace booking page (Manage Booking) | the venue | Call Reservations — the guest's name and reference go to whoever answers |
| Guest App tiles (`/welcome`) | the venue | Call Front Desk, or the venue's own phone tile — with the guest's name |
| Website Contact page | the portal, site `reviewslip`, Sales | Call Sales |
| Dashboard Support page | the portal, site `reviewslip`, Support | Call Support — with the account's email |

A button shows only while its line can answer or take a message (**open** / **voicemail**). With
nobody answering at all (**off**) it stays hidden and the phone link beside it is what the guest gets.

## Two widgets, one attribute each

Reviewslip's widget binds `data-rs-call`; the portal's binds `data-voice-call`. Both listen for clicks
on the whole document, and the website navigates without reloading, so a shared attribute would let a
visitor who had seen the Contact page start two calls from one venue button. A `data-voice-call` button
that names a venue (`data-voice-line`) is still taken by ours, for pages written before.

**The portal must know the site.** In the portal's admin → Calls → Websites: key `reviewslip`, origin
`https://reviewslip.com` (exactly; a site has one origin), then tick our team onto its Sales and Support
lists with hours. Until then Call Sales and Call Support stay hidden. Set `NEXT_PUBLIC_PORTAL_VOICE_SITE`
at build time if the key is different.

**The venue phone** is `/phone/`, opened from Dashboard → a venue → *Calls* → **Open the Phone**. It rings
for the account's venues, or for invited staff, the venues ticked for them.

*Dormant:* the review app still holds the Sales and Support phone built on 2026-10-18
(`/phone/reviewslip/`, `voice_agents.scope = 'reviewslip'`, migration 36). Nothing on the website opens
it or rings it any more.

## Who answers

- **A venue's own login.** Dashboard → *Calls* → **Open the Phone**. The first time makes them an
  answerer for every venue on the account.
- **Staff the owner invites.** Dashboard → *Calls* → *Who Answers* → name and email. They get an
  email to set a password (or the owner gets the link, without email set up) and sign in on the phone
  page only. They answer that venue, nothing else, and never see the dashboard. One phone login per
  email address.

On a phone each person:

- presses **Go on duty**. Duty is kept by the server: a reload, a closed tab or a dropped network never
  takes anyone off duty — only **Go off duty** (on the card, or in the menu) or signing out;
- picks which lines they take under *Taking calls for* (when they have more than one);
- turns on **Ringing when closed** in the menu (Web Push), which on a phone is the ring;
- may set **My hours** in the menu: a week of shifts in their time zone, overnight shifts allowed.
  Outside them the card reads *Off duty — outside your hours* and callers are offered a message; it comes
  back on by itself when they start. No hours means whenever on duty.

The page, after the Vibe Crafted portal's phone: the duty state as one big pill, **How this works**
written into the page, and four tabs — **New messages**, **Messages** (both with *Group by* Time or Line,
and one line at a time), **Recent calls**, and **Who's on**: everyone on your lines and whether a call
would reach them now (available, on a call, outside hours, phone closed, off duty), refreshed every 30
seconds while open.

## What happens on a call

1. The page asks for the microphone, then opens a socket to `/api/voice/ws?as=caller`.
2. Every free answerer on the line rings at once: their open phone pages, and a push to any whose
   page is closed or in the background. Busy people (on another call) are skipped.
3. The first to press **Answer** wins (in memory, recorded in `voice_calls`); everyone else hears
   "taken". The two browsers then connect directly.
4. Nobody answers within 30 seconds (45 when someone was rung by push), everyone declines, or nobody
   was free to begin with: the caller is offered a voice message — up to 2 minutes, with a name and a
   number or email for a call back.
5. A voicemail emails everyone on that venue's line (Reviewslip's go to `MAIL_SUPPORT`) and appears
   under *Voicemail* on the phone. The first person to play it marks it **Heard by** them, so two
   people don't ring the same guest back; **Mark unheard** hands it back.

## The pieces

| | |
|---|---|
| `voicerules.js` | Pure, tested: lines, hours, line status, allowed origins, voicemail and invite checks |
| `voice.js` | Storage: answerers, sessions, hours, push subscriptions, calls, voicemails |
| `voicehub.js` | The WebSocket: ringing, first answer wins, signalling relay, push, timeouts |
| `voicerouter.js` | `/api/voice`: button status and voicemail (open to any origin, no credentials); the phone page's API (the `rs_phone` cookie, same origin only) |
| `public/voice-call.js` | The call button widget, 11 languages |
| `public/phone/` | The phone page (both phones), its service worker (push) and manifest; `reviewslip/` holds the Sales and Support phone's own manifest and worker |
| `customer.js` | Open the Phone (one-time handoff), Who Answers, Admin's Reviewslip lines |
| Website | `components/VoiceCall.tsx`, `app/api/phone/route.ts` (`?phone=reviewslip` for Reviewslip's), `dashboard/[slug]/calls`, `dashboard/calls` |
| `db.js` migrations 35, 36 | `voice_agents`, `voice_agent_venues`, `voice_lines_off`, `voice_hours`, `voice_push`, `voice_sessions`, `voice_calls`, `voice_voicemails` |

The phone pages live on the review app's host (`VOICE_URL`, by default `https://api.reviewslip.com`),
so they share an origin with their socket and service workers. The dashboard reaches them through
`/api/phone`, which trades the website session for a one-time token in the URL's fragment, made for one
phone and refused by the other.

**One process.** Ringing state is in memory. The review app runs as one process; two would each
ring only their own pages. A restart drops calls in progress (both pages say so) and phone pages
reconnect on their own.

## Security

- A call button page can only learn whether a line is open, and leave a message for a call it just
  placed (the random call id is the permission; 15 minutes; one message per call).
- Calls are accepted only from Reviewslip's own pages: `reviewslip.com`, its venue subdomains, and
  any origin in `VOICE_ORIGINS`. Booking pages embedded on other websites are served from
  reviewslip.com, so their calls are too.
- Each phone's socket and API take that phone's cookie (`rs_phone` or `rs_phone_rs`; httpOnly,
  SameSite=Lax, 30 days) only from the phone page's own origin. Invited staff's passwords open the venue
  phone only.
- Handoff and invite tokens travel in the fragment, are hashed at rest, and work once (handoff: two
  minutes; invite: 14 days).
- Throttles: 6 calls a minute per address, 4 voicemails a minute, 8 sign-in attempts a minute.
- The page a call came from is kept as a path only: a booking page's `?k=` key never reaches the
  person answering or the database.
- Voicemails older than 180 days are deleted with their calls.

## Setting it up on the server

1. **Deploy** the review app (it installs `ws` and `web-push`) and restart. Migration 35 runs on boot.
2. **nginx must pass WebSockets** for the API host. In the `server` block for `api.reviewslip.com`:

   ```
   location /api/voice/ws {
       proxy_pass http://127.0.0.1:3000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_read_timeout 120s;
   }
   ```

   Then `sudo nginx -t && sudo systemctl reload nginx`. The page pings every 25 seconds, so the
   timeout only has to be longer than that.
3. **Push keys**, once: `cd /opt/reviewslip && (echo; node scripts/vapid-keys.js) >> .env`, then
   restart. Without them everything works except ringing a phone whose page is closed (the phone
   page hides that option).
4. Optional: **TURN** for callers on strict mobile networks that cannot connect directly. Run coturn
   with `use-auth-secret` and set `TURN_URLS` and `TURN_SECRET`. Without it most calls connect; the
   ones that cannot show "The call could not connect" with the phone number.

## Checking it

```
curl -s 'https://api.reviewslip.com/api/voice/status?line=reviewslip&team=sales'
# {"status":"off"} until an admin opens the phone; "open" while one is on duty
```

Open the phone from the dashboard, go on duty, and press Call on your venue's page from another
device. On an iPhone, ringing with the page closed needs the phone page added to the Home Screen.
