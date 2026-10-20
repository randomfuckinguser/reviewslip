# Calls: Reviewslip's own softphone

Built 2026-10-15; under the dashboard's own sign-in since 2026-10-20. Guests press **Call** and talk
to a venue's desk in the browser; customers press **Call Sales** or **Call Support** and talk to
Reviewslip. When nobody is free the caller leaves a voice message. No phone numbers, no SIP, no
per-minute cost: audio goes browser to browser over WebRTC, and the review app only rings.

**One sign-in.** The phone is part of the dashboard: **Phone** in the sidebar, at `reviewslip.com/phone/`.
It uses the same Reviewslip account and session as the dashboard, so there is nothing else to log in to.
Staff a venue invites become Reviewslip accounts that open only the phone. Nothing here depends on the
Vibe Crafted portal.

## Where the buttons are

| Page | Line | Shown as |
|---|---|---|
| Marketplace venue page, "Book directly" box | the venue | Call Reservations |
| Marketplace booking page (Manage Booking) | the venue | Call Reservations — the guest's name and reference go to whoever answers |
| Guest App tiles (`/welcome`) | the venue | Call Front Desk, or the venue's own phone tile — with the guest's name |
| Website Contact page | Reviewslip, Sales | Call Sales |
| Dashboard Support page | Reviewslip, Support | Call Support — with the account's email |

A button shows only while its line can answer or take a message (**open** / **voicemail**). With
nobody answering at all (**off**) it stays hidden and the phone link beside it is what the guest gets.

## Two phones, one sign-in

| | Venue phone | Reviewslip's phone |
|---|---|---|
| Address | `reviewslip.com/phone/` | `reviewslip.com/phone/reviewslip/` |
| In the sidebar | *Phone*, under the venue | *Sales & Support Phone*, under Admin |
| Rings for | the account's venues, and any venue it was invited to answer | Call Sales and Call Support |
| Who | the venue's owner, staff it invites | admin accounts only |

An owner who is also an admin has one of each. They never mix: separate duty, hours and push, so the
front desk can be on duty while the office phone is off. Under the hood an answerer row (`voice_agents`)
is one person on one phone (`scope` is `venues` or `reviewslip`, migration 36).

## Who answers

- **The venue's owner** opens *Phone* from the sidebar. The first time makes them an answerer for
  every venue on the account.
- **Staff the owner invites.** Dashboard → *Calls* → *Who Answers* → name and email. They get an email
  (or the owner gets the link, without email set up). Opening it at `/phone/#invite=…`:
  - a new address chooses a password and becomes a Reviewslip account that opens **only the phone**
    (`accounts.phone_only`); they are signed in there and then, and sign in later on reviewslip.com
    like anyone else — the dashboard sends them straight to the phone;
  - an address that already has a Reviewslip account accepts, then signs in as usual.

  Removing someone from their last venue removes their phone-only account too; anyone's own account
  stays theirs.
- **Reviewslip's team.** Every admin account answers Sales and Support on *Sales & Support Phone*.

On a phone each person:

- presses **Go on duty**. Duty is kept by the server: a reload, a closed tab or a dropped network never
  takes anyone off duty — only **Go off duty** (on the card, or in the menu) or signing out;
- picks which lines they take under *Taking calls for* (when they have more than one);
- turns on **Ringing when closed** in the menu (Web Push), which on a phone is the ring;
- may set **My hours** in the menu: a week of shifts in their time zone, overnight shifts allowed.
  Outside them the card reads *Off duty — outside your hours* and callers are offered a message; it comes
  back on by itself when they start. No hours means whenever on duty.

The page: the duty state as one big pill, **How this works** written into the page, and four tabs —
**New messages**, **Messages** (both with *Group by* Time or Line, and one line at a time), **Recent
calls**, and **Who's on**: everyone on your lines and whether a call would reach them now. On a phone, a
bottom tab bar, and a ringing or live call takes the whole screen.

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
   under *Messages* on the phone. The first person to play it marks it **Heard by** them, so two
   people don't ring the same guest back; **Mark unheard** hands it back.

## The pieces

| | |
|---|---|
| `voicerules.js` | Pure, tested: lines, hours, line status, who's on, allowed origins, voicemail and invite checks |
| `voice.js` | Storage: answerers, the agent behind a dashboard session, invites, hours, push, calls, voicemails |
| `voicehub.js` | The WebSocket: ringing, first answer wins, signalling relay, push, timeouts |
| `voicerouter.js` | `/api/voice`: button status and voicemail (open to any origin, no credentials); the phone page's API (the dashboard's `rs_session` cookie, Reviewslip's pages only); accepting an invite |
| `public/voice-call.js` | The call button widget (`data-rs-call`), 11 languages |
| `public/phone/` | The phone page (both phones), its service worker and manifest; `reviewslip/` holds the Sales and Support phone's own manifest and worker |
| `customer.js` | Who Answers (invite, resend, remove) |
| Website | `components/VoiceCall.tsx`; `dashboard/[slug]/calls` (Who Answers); the sidebar's *Phone* links; `next.config.ts` rewrites and `proxy.ts` leave `/phone` and `/api/voice` to the review app; sign-in honours `?next=`; the dashboard sends phone-only accounts to `/phone/` |
| `db.js` migrations 35–37 | the `voice_*` tables; `scope` (36); `accounts.phone_only` (37) |

**How the sign-in is shared.** The website keeps the session in an httpOnly `rs_session` cookie on
reviewslip.com. nginx serves `/phone/` and `/api/voice/` on reviewslip.com from the review app, so the
browser sends that cookie with every phone request and the review app looks the session up itself.
Accepting an invite signs a new account in by setting the same cookies the website's sign-in sets.
Locally the website (3001) forwards `/phone` and `/api/voice` to the review app (3000), and the call
socket goes to 3000 directly (`/api/voice/config` says where); cookies ignore ports, so the session
still arrives.

**One process.** Ringing state is in memory. The review app runs as one process; two would each
ring only their own pages. A restart drops calls in progress (both pages say so) and phone pages
reconnect on their own.

## Security

- A call button page can only learn whether a line is open, and leave a message for a call it just
  placed (the random call id is the permission; 15 minutes; one message per call).
- Calls are accepted only from Reviewslip's own pages: `reviewslip.com`, its venue subdomains, and
  any origin in `VOICE_ORIGINS`. Booking pages embedded on other websites are served from
  reviewslip.com, so their calls are too.
- The phone's API and socket take the dashboard's session only from Reviewslip's pages; the cookie is
  httpOnly and SameSite=Lax. Reviewslip's phone refuses accounts that are not admins.
- Phone-only accounts reach no dashboard screen: the dashboard sends them to the phone, and they own
  no venue, so the customer API has nothing of theirs to show.
- Invite tokens travel in the URL's fragment, are hashed at rest, and work once, for 14 days.
- Sign-in's `?next=` only ever goes to a path on reviewslip.com.
- Throttles: 6 calls a minute per address, 4 voicemails a minute, 8 invite attempts a minute.
- The page a call came from is kept as a path only: a booking page's `?k=` key never reaches the
  person answering or the database.
- Voicemails older than 180 days are deleted with their calls.

## Setting it up on the server

1. **Deploy** the review app, then the website. Migrations run on the review app's boot.
2. **nginx, the reviewslip.com server block** (the one that sends everything else to :3001): add,
   above its `location / {`,

   ```
   location /phone/ {
       proxy_pass http://127.0.0.1:3000;
       include snippets/reviewslip-proxy.conf;
   }

   location = /phone {
       return 301 /phone/;
   }

   location /api/voice/ {
       proxy_pass http://127.0.0.1:3000;
       include snippets/reviewslip-proxy.conf;
   }

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

   Then `sudo nginx -t && sudo systemctl reload nginx`. The `*.reviewslip.com` block keeps its own
   `/api/voice/ws` location: call buttons ring through `api.reviewslip.com`.
3. **Push keys**, once: `cd /opt/reviewslip && (echo; node scripts/vapid-keys.js) >> .env`, then
   restart. Without them everything works except ringing a phone whose page is closed.
4. Optional: **TURN** for callers on strict mobile networks that cannot connect directly. Run coturn
   with `use-auth-secret` and set `TURN_URLS` and `TURN_SECRET`.

## Checking it

```
curl -s -o /dev/null -w '%{http_code}\n' https://reviewslip.com/phone/
# 200: nginx sends the phone to the review app
curl -s 'https://api.reviewslip.com/api/voice/status?line=reviewslip&team=sales'
# {"status":"off"} until an admin opens the phone; "open" while one is on duty
```

Sign in on reviewslip.com, choose **Phone** in the sidebar, go on duty, and press Call on your venue's
page from another device. On an iPhone, ringing with the page closed needs the phone added to the Home
Screen.
