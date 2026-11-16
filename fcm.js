'use strict';

const crypto = require('crypto');
const fs = require('fs');

/**
 * Ringing the Reviewslip Phone app on Android: Firebase Cloud Messaging, HTTP
 * v1, signed with a service account. No SDK: a signed JWT buys an hour's
 * access token, and each ring is one POST.
 *
 * A web push only shows a notification; a high-priority data message wakes the
 * app itself, even on a phone that is asleep, and the app rings like a call —
 * full screen over the lock screen, the ringtone looping — until someone
 * answers, the caller hangs up or the ring times out.
 *
 *   FCM_SERVICE_ACCOUNT       path to the service account's JSON key, or
 *   FCM_SERVICE_ACCOUNT_JSON  the JSON itself
 *
 * Without either, the app still answers calls while it is open; it just cannot
 * be rung while it is closed.
 */

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

function loadAccount(env = process.env) {
  try {
    const raw = env.FCM_SERVICE_ACCOUNT_JSON
      ? env.FCM_SERVICE_ACCOUNT_JSON
      : env.FCM_SERVICE_ACCOUNT
        ? fs.readFileSync(env.FCM_SERVICE_ACCOUNT, 'utf8')
        : '';
    if (!raw) return null;
    const a = JSON.parse(raw);
    if (!a.client_email || !a.private_key || !a.project_id) throw new Error('missing client_email, private_key or project_id');
    return { email: a.client_email, key: a.private_key, project: a.project_id, tokenUri: a.token_uri || 'https://oauth2.googleapis.com/token' };
  } catch (err) {
    console.error('Phone app ringing is off: the Firebase service account could not be read.', err.message);
    return null;
  }
}

const account = loadAccount();

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

/** The signed assertion Google trades for an access token. */
function assertion(acc, now = Math.floor(Date.now() / 1000)) {
  const head = b64url({ alg: 'RS256', typ: 'JWT' });
  const body = b64url({ iss: acc.email, scope: SCOPE, aud: acc.tokenUri, iat: now, exp: now + 3600 });
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), acc.key).toString('base64url');
  return `${head}.${body}.${sig}`;
}

let cached = null; // { token, until }

async function accessToken() {
  if (cached && cached.until > Date.now()) return cached.token;
  const res = await fetch(account.tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: assertion(account),
    }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.access_token) throw new Error(`token ${res.status} ${d.error || ''}`.trim());
  // Five minutes' margin on the hour.
  cached = { token: d.access_token, until: Date.now() + (Number(d.expires_in || 3600) - 300) * 1000 };
  return cached.token;
}

/**
 * The message for one phone. Data only — never a `notification` block, which
 * Android would draw itself instead of waking the app to ring.
 */
function message(token, payload, ttlSeconds) {
  const data = {};
  for (const [k, v] of Object.entries(payload)) if (v != null) data[k] = String(v);
  return {
    message: {
      token,
      data,
      android: { priority: 'HIGH', ttl: `${Math.max(0, Math.round(ttlSeconds))}s` },
    },
  };
}

/**
 * Sends one message. Resolves 'sent', or 'gone' when the token no longer
 * belongs to an installed app (uninstalled, data cleared) and should be
 * forgotten; throws on anything else.
 */
async function send(token, payload, ttlSeconds = 60) {
  if (!account) return 'off';
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message(token, payload, ttlSeconds)),
  });
  if (res.ok) return 'sent';
  const d = await res.json().catch(() => ({}));
  const code = (d.error?.details || []).map((x) => x.errorCode).find(Boolean) || d.error?.status || '';
  if (res.status === 404 || code === 'UNREGISTERED') return 'gone';
  if (res.status === 401) cached = null;
  throw new Error(`${res.status} ${code}`.trim());
}

module.exports = { ready: Boolean(account), send, message, assertion, loadAccount };
