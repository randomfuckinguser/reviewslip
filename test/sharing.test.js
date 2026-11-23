'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const share = require('../sharerules');
const chat = require('../chatrules');
const emails = require('../emails');

test('the owner may do anything', () => {
  assert.equal(share.allowed('owner', 'DELETE', ''), true);
  assert.equal(share.allowed('owner', 'POST', '/sharing'), true);
});

test('Full Access is everything but deleting the business and sharing it', () => {
  assert.equal(share.allowed('manager', 'PATCH', ''), true);
  assert.equal(share.allowed('manager', 'POST', '/rates'), true);
  assert.equal(share.allowed('manager', 'DELETE', '/rooms/4'), true);
  assert.equal(share.allowed('manager', 'DELETE', ''), false);
  assert.equal(share.allowed('manager', 'GET', '/sharing'), true);
  assert.equal(share.allowed('manager', 'POST', '/sharing'), false);
  assert.equal(share.allowed('manager', 'DELETE', '/sharing/3'), false);
});

test('Front Desk reads everything and changes only the desk’s work', () => {
  for (const path of ['', '/rates', '/market', '/checklist', '/sharing']) {
    assert.equal(share.allowed('frontdesk', 'GET', path), true, path);
  }
  for (const [method, path] of [
    ['POST', '/bookings'],
    ['PATCH', '/bookings/12'],
    ['POST', '/bookings/12/payment'],
    ['PATCH', '/guests/3'],
    ['PATCH', '/customers/8'],
    ['POST', '/tm30/notified'],
    ['POST', '/chats/5/reply'],
    ['POST', '/rooms/2/status'],
    ['POST', '/rooms/2/housekeeping'],
  ]) {
    assert.equal(share.allowed('frontdesk', method, path), true, `${method} ${path}`);
  }
  for (const [method, path] of [
    ['PATCH', ''],
    ['DELETE', ''],
    ['POST', '/rates'],
    ['POST', '/rooms'],
    ['DELETE', '/rooms/2'],
    ['PUT', '/market'],
    ['POST', '/checklist'],
    ['POST', '/sharing'],
    ['POST', '/housekeeping/pin'],
    ['POST', '/voice/staff'],
  ]) {
    assert.equal(share.allowed('frontdesk', method, path), false, `${method} ${path}`);
  }
});

test('nobody else gets anything', () => {
  assert.equal(share.allowed(null, 'GET', ''), false);
  assert.equal(share.allowed('guest', 'GET', ''), false);
});

test('sharing needs an address and one of the two levels', () => {
  assert.deepEqual(share.checkShare({ email: ' Ann@Example.com ', role: 'frontdesk' }), {
    ok: true,
    value: { email: 'ann@example.com', role: 'frontdesk' },
  });
  assert.equal(share.checkShare({ email: 'nope', role: 'manager' }).ok, false);
  assert.equal(share.checkShare({ email: 'a@b.co', role: 'owner' }).ok, false);
});

test('a message needs a name and something to say; the email is optional', () => {
  assert.deepEqual(chat.checkOpen({ name: ' Ann ', email: '', body: ' Is breakfast included? ' }), {
    ok: true,
    value: { name: 'Ann', email: '', body: 'Is breakfast included?' },
  });
  assert.equal(chat.checkOpen({ name: '', body: 'hi' }).ok, false);
  assert.equal(chat.checkOpen({ name: 'Ann', body: '   ' }).ok, false);
  assert.equal(chat.checkOpen({ name: 'Ann', email: 'not-an-email', body: 'hi' }).ok, false);
  assert.equal(chat.checkOpen({ name: 'Ann', body: 'x'.repeat(chat.BODY_MAX + 1) }).ok, false);
});

test('a guest writing opens it; the line answering waits on the guest', () => {
  assert.equal(chat.nextStatus(true), chat.OPEN);
  assert.equal(chat.nextStatus(false), chat.ANSWERED);
});

test('the key is made again from its nonce, and only well-formed keys are looked up', () => {
  const nonce = chat.newNonce();
  const token = chat.tokenFor(nonce);
  assert.equal(chat.tokenFor(nonce), token);
  assert.notEqual(chat.tokenFor(chat.newNonce()), token);
  assert.equal(chat.cleanToken(token), token);
  assert.equal(chat.cleanToken('short'), '');
  assert.equal(chat.cleanToken('../../etc/passwd/aaaaaaaaaaaaaaaaaaaa'), '');
});

test('the guest is emailed an answer only when not looking at the conversation', () => {
  const now = Date.parse('2026-11-23T10:00:00Z');
  assert.equal(chat.emailGuest({ email: '', seenAt: null }, now), false);
  assert.equal(chat.emailGuest({ email: 'a@b.co', seenAt: null }, now), true);
  assert.equal(chat.emailGuest({ email: 'a@b.co', seenAt: '2026-11-23T09:59:30Z' }, now), false);
  assert.equal(chat.emailGuest({ email: 'a@b.co', seenAt: '2026-11-23T09:50:00Z' }, now), true);
});

test('the emails say who, what and where to answer', () => {
  const line = emails.chatEmail({ line: 'Baanpong Lodge', name: 'Ann', body: 'Late check-in?', url: 'https://x/m' });
  assert.match(line.subject, /Baanpong Lodge.*Ann/);
  assert.match(line.text, /Late check-in\?/);
  const guest = emails.chatReplyEmail({ line: 'Baanpong Lodge', name: 'Ann', body: 'Yes, any time.', url: 'https://x/#rs-chat=k' });
  assert.match(guest.text, /#rs-chat=k/);
  const shared = emails.shareEmail({ venue: 'Baanpong Lodge', by: 'o@x.co', role: 'Front Desk', hasAccount: false, url: 'https://x/login' });
  assert.match(shared.text, /Front Desk/);
  assert.match(shared.text, /code/);
});
