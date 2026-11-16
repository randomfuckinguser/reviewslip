'use strict';

/**
 * Ringing the Phone app: what goes to Firebase, and the signed assertion that
 * pays for it. Neither needs a network.
 *
 *   node --test test/
 */

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

const fcm = require('../fcm');

test('a ring is data only, high priority, and lives as long as the ring', () => {
  const m = fcm.message('tok', { t: 'ring', callId: 'c1', caller: null, seconds: 45 }, 45);
  assert.deepStrictEqual(m, {
    message: {
      token: 'tok',
      data: { t: 'ring', callId: 'c1', seconds: '45' },
      android: { priority: 'HIGH', ttl: '45s' },
    },
  });
  // A notification block would be drawn by Android instead of ringing.
  assert.strictEqual(m.message.notification, undefined);
});

test('the assertion is a JWT Google can check with the account key', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const acc = {
    email: 'phone@example.iam.gserviceaccount.com',
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    tokenUri: 'https://oauth2.googleapis.com/token',
  };
  const jwt = fcm.assertion(acc, 1000);
  const [head, body, sig] = jwt.split('.');
  assert.ok(crypto.verify('RSA-SHA256', Buffer.from(`${head}.${body}`), publicKey, Buffer.from(sig, 'base64url')));
  const claims = JSON.parse(Buffer.from(body, 'base64url'));
  assert.strictEqual(claims.iss, acc.email);
  assert.strictEqual(claims.aud, acc.tokenUri);
  assert.strictEqual(claims.exp - claims.iat, 3600);
  assert.match(claims.scope, /firebase\.messaging/);
});

test('no service account means app ringing is simply off', () => {
  assert.strictEqual(fcm.loadAccount({}), null);
});
