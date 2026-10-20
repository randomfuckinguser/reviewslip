'use strict';

/**
 * The guest app: a name and an email, then the venue's links as tiles, how to
 * put the app on the phone, and the way to the review page.
 *
 * The rules — what a valid sign-up is, what a link may point at, which picture
 * a link gets — live on the server (welcome.js). This file only draws them.
 */

const PASS_KEY = 'rs:welcome-pass';
// The last links and name, so the app opens at once and still opens on a
// lobby's flaky Wi-Fi. Refreshed from the server every time it can be.
const SEEN_KEY = 'rs:welcome-seen';
const LATER_KEY = 'rs:welcome-install-later';
const $ = (id) => document.getElementById(id);

/* ---------------------------------------------------------------- language */

/**
 * The guest's own language, if the page has it.
 *
 * From the browser rather than a selector: a guest standing in a lobby should
 * not have to find a menu to read a handful of words. Matched on the base tag,
 * as the server does.
 */
const STRINGS = window.RS_STRINGS || { en: {} };
const lang =
  (navigator.languages || [navigator.language || 'en'])
    .map((tag) => String(tag).toLowerCase().split('-')[0])
    .find((code) => STRINGS[code]) || 'en';

let venue = '';
// The venue's softphone site key, from /api/welcome; empty when it has none.
let voiceLine = '';
let voiceApi = '';
let guest = '';

function t(key) {
  const raw = (STRINGS[lang] && STRINGS[lang][key]) || (STRINGS.en && STRINGS.en[key]) || key;
  return raw.replace(/\{venue\}/g, venue).replace(/\{name\}/g, guest);
}

function paint() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  $('heading').textContent = venue ? t('welcomeHeading') : t('welcomeTitle');
  $('home-heading').textContent = venue ? t('welcomeHeading') : t('welcomeTitle');
  $('hello').textContent = guest ? t('appHello') : '';
  $('signed-in').textContent = guest ? t('appSignedIn') : '';
  document.title = venue || t('welcomeTitle');
}

/* ------------------------------------------------------------------- icons */

/**
 * The pictures, drawn here rather than fetched so the app has them offline.
 * Stroke icons on a 24 grid, coloured by the venue's theme through
 * currentColor.
 */
const ICONS = {
  wifi: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.86a10 10 0 0 1 14 0"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/>',
  food: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  map: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  social: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  link: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>',
  more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.link}</svg>`;
}

for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon);

/* ------------------------------------------------------------------- store */

function read(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function write(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Private browsing: the guest is asked again next time, nothing worse.
  }
}

function readSeen() {
  try {
    const seen = JSON.parse(read(SEEN_KEY) || 'null');
    return seen && Array.isArray(seen.links) ? seen : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------- views */

function showStart() {
  $('start').hidden = false;
  $('home').hidden = true;
  $('app-bar').hidden = true;
}

function showHome({ name, links }, { offline = false } = {}) {
  guest = name || '';
  paint();

  $('start').hidden = true;
  $('home').hidden = false;
  $('app-bar').hidden = false;
  $('offline').hidden = !offline;

  const list = $('links');
  list.replaceChildren();
  let phoned = false;
  for (const link of links) {
    const a = document.createElement('a');
    a.className = 'tile';
    a.href = link.url;
    // A web page opens beside the app so the guest can come back to it; a
    // phone number or an email address goes to the phone's own app.
    if (/^https?:/i.test(link.url)) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    a.append(...tileFace(link.icon, link.label));

    const li = document.createElement('li');
    // A phone number: an in-browser call to the front desk, with the number
    // behind it for a browser that cannot, or a venue nobody answers for.
    if (voiceLine && /^tel:/i.test(link.url)) {
      phoned = true;
      a.classList.add('tile-fallback');
      li.append(voiceTile(link.label, decodeURIComponent(link.url.slice(4))), a);
    } else {
      li.append(a);
    }
    list.append(li);
  }
  // No phone tile of the venue's own: the front desk first, shown only once
  // someone answers for it.
  if (voiceLine && !phoned) {
    const li = document.createElement('li');
    li.append(voiceTile(t('voiceCallTeam').replace('{team}', t('voiceFrontDesk'))));
    list.prepend(li);
  }
  $('no-links').hidden = links.length > 0;

  if (voiceLine) startVoice();
  offerInstall();
}

function tileFace(iconName, text) {
  const picture = document.createElement('span');
  picture.className = 'tile-icon';
  picture.setAttribute('aria-hidden', 'true');
  picture.innerHTML = icon(iconName);
  const label = document.createElement('span');
  label.className = 'tile-label';
  label.textContent = text;
  return [picture, label];
}

/**
 * A call tile. Hidden until the venue's line answers its status check
 * (voice-call.js): open shows it as it is, voicemail relabels it to leave a
 * message, and a venue nobody answers for never shows it.
 */
function voiceTile(text, phone) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tile tile-voice';
  button.dataset.rsCall = '';
  button.dataset.voiceLine = voiceLine;
  // The front desk, not reservations: the guest is already staying.
  button.dataset.voiceTeam = 'support';
  button.dataset.voiceLeave = t('voiceLeave');
  if (guest) button.dataset.voiceCaller = guest;
  if (phone) button.dataset.voicePhone = phone;
  button.hidden = true;
  const [picture, label] = tileFace('phone', text);
  label.dataset.voiceLabel = '';
  button.append(picture, label);
  return button;
}

/* ---------------------------------------------------------------- softphone */

/**
 * Reviewslip's call buttons (public/voice-call.js), from the API's host.
 *
 * It binds every [data-rs-call] element through one click listener on the
 * document and notices tiles drawn later on its own; asking it to refresh
 * checks the line again now rather than at its next poll.
 */
let voiceLoaded = false;
function startVoice() {
  if (voiceLoaded) {
    if (window.ReviewslipVoice) window.ReviewslipVoice.refresh();
    return;
  }
  voiceLoaded = true;
  const script = document.createElement('script');
  script.src = `${voiceApi}/voice-call.js`;
  script.defer = true;
  script.dataset.voiceApi = voiceApi;
  script.dataset.voiceLang = document.documentElement.lang || '';
  document.body.appendChild(script);
}

function signOut() {
  write(PASS_KEY, '');
  write(SEEN_KEY, '');
  guest = '';
  $('signup').reset();
  paint();
  showStart();
  window.scrollTo(0, 0);
}

$('not-you').addEventListener('click', signOut);

/* ----------------------------------------------------------------- install */

const standalone =
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let deferred = null;

// Chrome and Edge announce that they can install the page. Held until the
// guest asks, because a browser prompt the moment the page opens is the kind
// of thing people dismiss on reflex.
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferred = event;
  offerInstall();
});

window.addEventListener('appinstalled', () => {
  deferred = null;
  $('install').hidden = true;
  $('install-done').hidden = false;
});

function offerInstall() {
  if (standalone || $('home').hidden || read(LATER_KEY)) {
    $('install').hidden = true;
    return;
  }

  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);

  $('install').hidden = false;
  $('install-button').hidden = !deferred;
  // Steps for the phone in hand. On anything else — a laptop that opened the
  // link — both, since there is no telling which phone it is meant for.
  $('install-ios').hidden = Boolean(deferred) || !(ios || !android);
  $('install-android').hidden = Boolean(deferred) || !(android || !ios);
}

$('install-button').addEventListener('click', async () => {
  if (!deferred) return;
  deferred.prompt();
  await deferred.userChoice.catch(() => null);
  deferred = null;
  offerInstall();
});

// "Not now" is remembered: an install card on every visit is nagging.
$('install-later').addEventListener('click', () => {
  write(LATER_KEY, '1');
  $('install').hidden = true;
});

/* ----------------------------------------------------------------- sign-up */

$('signup').addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = $('error');
  error.textContent = '';

  const button = $('continue');
  button.disabled = true;
  try {
    const res = await fetch('/api/welcome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: $('name').value,
        email: $('email').value,
        consent: $('consent').checked,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      error.textContent = t(data.error || 'welcomeFailed');
      return;
    }

    const seen = { name: data.name || '', links: data.links || [] };
    write(PASS_KEY, data.pass);
    write(SEEN_KEY, data.pass ? JSON.stringify(seen) : '');
    showHome(seen);
    window.scrollTo(0, 0);
  } catch {
    error.textContent = t('welcomeFailed');
  } finally {
    button.disabled = false;
  }
});

/* -------------------------------------------------------------------- open */

async function loadVenue() {
  try {
    const res = await fetch('/api/welcome');
    if (!res.ok) return;
    const data = await res.json();
    venue = data.venue || '';
    voiceLine = String(data.voiceLine || '');
    voiceApi = String(data.voiceApi || '');
    if (data.showName !== false) $('eyebrow').textContent = venue;
    $('bar-name').textContent = venue;
    $('app-title').content = venue || 'Welcome';
    if (data.hasLogo) {
      for (const id of ['logo', 'bar-logo']) {
        const logo = $(id);
        logo.src = '/logo';
        logo.alt = id === 'logo' ? venue : '';
        logo.hidden = false;
      }
    }
  } catch {
    // The app works without the venue's name; it only reads less warmly.
  }
}

async function open() {
  paint();

  // What the guest saw last time, at once, while the server is asked.
  const pass = read(PASS_KEY);
  const seen = pass ? readSeen() : null;
  if (seen) showHome(seen);

  await loadVenue();
  paint();

  if (!pass) return showStart();

  // A pass that no longer works — the venue deleted their details — is
  // forgotten, and they are asked again.
  try {
    const res = await fetch('/api/welcome/links', { headers: { 'X-Welcome-Pass': pass } });
    if (res.ok) {
      const data = await res.json();
      const fresh = { name: data.name || '', links: data.links || [] };
      write(SEEN_KEY, JSON.stringify(fresh));
      return showHome(fresh);
    }
    if (res.status === 401) return signOut();
  } catch {
    // No signal. The links from last time are better than a blank screen.
  }
  if (seen) showHome(seen, { offline: true });
  else showStart();
}

open();

// The app opening without a signal: the page and its styles from the last
// visit. Scoped to /welcome, so the review page is never served from it.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/welcome-sw.js', { scope: '/welcome' }).catch(() => {});
}
