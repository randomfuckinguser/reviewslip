'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const codes = require('../signincode');
const emails = require('../emails');

test('a code is six digits, leading zeros kept', () => {
  for (let i = 0; i < 200; i++) assert.match(codes.newCode(), /^\d{6}$/);
});

test('a typed code is read the way people type it', () => {
  assert.equal(codes.cleanCode('123456'), '123456');
  assert.equal(codes.cleanCode(' 123 456 '), '123456');
  assert.equal(codes.cleanCode('123-456'), '123456');
  assert.equal(codes.cleanCode('12345'), null);
  assert.equal(codes.cleanCode('12345a'), null);
  assert.equal(codes.cleanCode(''), null);
});

test('only the hash is kept, and it matches only its own address and code', () => {
  const stored = codes.hashCode('Noi@Example.com', '042517');
  assert.doesNotMatch(stored, /042517/);
  assert.equal(codes.matches(stored, 'noi@example.com', '042517'), true);
  assert.equal(codes.matches(stored, ' NOI@example.com ', '042517'), true);
  assert.equal(codes.matches(stored, 'noi@example.com', '042518'), false);
  assert.equal(codes.matches(stored, 'someone@example.com', '042517'), false);
  // Salted: the same code for the same address is stored differently each time.
  assert.notEqual(codes.hashCode('noi@example.com', '042517'), stored);
});

test('guessing is limited: a few tries a code, a few codes an hour', () => {
  assert.ok(codes.MAX_ATTEMPTS <= 5);
  assert.ok(codes.MAX_PER_HOUR <= 6);
  assert.ok(codes.CODE_MINUTES <= 15);
});

test('the invite email carries its code, and asks for no password', () => {
  const mail = emails.voiceInviteEmail({ name: 'Noi', venue: 'Baan Pong Lodge', by: 'owner@example.com', url: 'https://x/phone/#invite=abc', code: '042517' });
  assert.match(mail.text, /Your code: 042517/);
  assert.match(mail.html, /042517/);
  assert.doesNotMatch(mail.text, /password/i);
  assert.match(mail.text, /https:\/\/x\/phone\/#invite=abc/);
});

test('the sign-in email has the code in its subject, for the notification', () => {
  const mail = emails.codeEmail({ code: '042517', minutes: 15 });
  assert.equal(mail.subject, '042517 is your Reviewslip code');
  assert.match(mail.text, /15 minutes/);
});
