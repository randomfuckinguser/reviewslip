/*
 * The Reviewslip phones: go on duty, ring when someone presses Call, answer in
 * the browser, and listen to the messages left when nobody could.
 *
 * Two phones on one page, told apart by the address (data-phone on <html>):
 *
 *   /phone/             venues — a venue's own login, from the dashboard's
 *                       Calls page, and the staff it invited (who sign in here)
 *   /phone/reviewslip/  Reviewslip's Sales and Support — admins, from the
 *                       dashboard's Admin, Sales & Support
 *
 * Each has its own sign-in cookie, duty, hours and push, so one browser can
 * keep both open on one login. Every request says which (?phone=).
 *
 * Duty is kept by the server, so a reload, a closed tab or a dropped network
 * never takes anyone off duty — only the button does, or signing out.
 */
(function () {
  'use strict';

  var PHONE = document.documentElement.dataset.phone === 'reviewslip' ? 'reviewslip' : 'venues';
  var BASE = PHONE === 'reviewslip' ? '/phone/reviewslip/' : '/phone/';

  /* ------------------------------------------------------------- words */

  var WORDS = {
    en: {
      brandVenues: 'Reviewslip Phone', brandReviewslip: 'Reviewslip · Sales & Support', menu: 'Menu',
      signOut: 'Sign out', signInTitle: 'Sign in to answer calls',
      signInNote: 'Staff a venue invited sign in here. Venue owners open the phone from their dashboard.',
      rsTitle: 'Sales & Support phone', rsNote: 'Open this phone from the dashboard: Admin, Sales & Support. It signs you in.',
      openDashboard: 'Open the dashboard', email: 'Email', password: 'Password', signIn: 'Sign in',
      newPassword: 'Choose a password', start: 'Start answering calls', inviteTitle: 'Hello {name}',
      inviteNote: 'Set a password to answer calls for {venues}.', expired: 'Your sign-in has ended. Sign in again.',
      tapForSound: 'Tap to turn the ringtone on', mute: 'Mute', unmute: 'Unmute', hangUp: 'Hang up', inCall: 'In a call',
      goOn: 'Go on duty', goOff: 'Go off duty', offDuty: 'Off duty', onDuty: 'On duty', connecting: 'Connecting…',
      reconnecting: 'Reconnecting…', outside: 'Off duty — outside your hours',
      subOff: 'Calls don’t ring here, and the Call buttons offer to leave a message. Go on duty to take calls.',
      subOn: 'This page rings when someone calls. Keep it open — or let your phone ring when it’s closed.',
      subConnecting: 'You’re on duty. Connecting this page so it can ring…',
      subOutside: 'You’re outside your working hours, so you’re off duty and the website shows ‘leave a message’. Keep this page open and you go on duty by yourself when your hours start.',
      takingFor: 'Taking calls for', pushNote: 'On a phone? Let it ring even when this page is closed.', pushTurnOn: 'Turn on',
      pushOn: 'Ringing when closed: on', pushOff: 'Ringing when closed: off', pushBlocked: 'Notifications are blocked in this browser’s settings.',
      pushIos: 'On iPhone, add this page to the Home Screen first (Share, then Add to Home Screen).',
      howItWorks: 'How this works', myHours: 'My hours', tabNew: 'New messages', tabAll: 'Messages', tabCalls: 'Recent calls',
      tabNewShort: 'New', tabAllShort: 'Messages', tabCallsShort: 'Calls', tabTeamShort: 'Who\u2019s on', moreRinging: '{n} more ringing',
      tabTeam: 'Who’s on', vmSub: 'Recorded when nobody on the line could take the call. Playing one marks it heard with your name, so two of you don’t ring the same person back.',
      teamSub: 'Everyone on the lines you answer, line by line, and whether a call would reach them right now. Check it before you step away.',
      groupBy: 'Group by', byTime: 'Time', byLine: 'Line', line: 'Line', allLines: 'All lines',
      noNew: 'No new messages.', none: 'Nothing yet.', noCallsLine: 'No calls on this line yet.', loading: 'Loading…',
      noLines: 'You aren’t on any line yet, so there’s nobody to show.',
      nobodyFree: 'Nobody can take a call on this line right now: callers are offered a message.',
      hoursNote: '', timezone: 'Time zone', save: 'Save', saved: 'Saved', to: 'to',
      incoming: 'Incoming call', aGuest: 'A guest', answer: 'Answer', decline: 'Decline',
      reservations: 'Reservations', frontDesk: 'Front desk', sales: 'Sales', support: 'Support', fromPage: 'From {page}',
      gone: 'Someone else answered first.', micBlocked: 'The microphone is blocked. Allow it for this page to answer.',
      callFailed: 'The call could not connect.', isNew: 'New', heardBy: 'Heard by {name} · {when}', heardByYou: 'Heard by you · {when}',
      heard: 'Heard · {when}', markHeard: 'Mark heard', markUnheard: 'Mark unheard', noContact: 'No number or email left',
      answered: 'Answered', missed: 'Missed', abandoned: 'Hung up', leftMessage: 'Voicemail', live: 'In progress',
      answeredBy: 'by {name}', confirmSignOut: 'Signing out ends the call. Sign out?',
      days: 'Mon,Tue,Wed,Thu,Fri,Sat,Sun', lang: 'ภาษาไทย', you: 'you',
      stAvailable: 'Available', stCall: 'On a call', stHours: 'Outside hours', stClosed: 'Phone closed', stOff: 'Off duty',
      guide: [
        ['Going on duty', 'Press Go on duty. You stay on duty until you press Go off duty or sign out — a reload, a closed tab or a lost connection doesn’t change it. While you’re on duty and this page is open, every call on your lines rings here.'],
        ['When the page is closed', 'Turn on ringing when closed (in the menu, or the note on the card). Your phone then rings with a notification even when this page is closed or asleep; tap it to answer. On iPhone, add the page to the Home Screen first.'],
        ['Answering', 'Everyone free on the line rings at once; the first to press Answer gets the call and the others stop ringing. Decline passes it to the others. If nobody answers in about 30 seconds, the caller is offered a voice message.'],
        ['Your hours', 'Set your working week under My hours. Outside it you show as off duty and callers are offered a message; when your hours start you’re back on by yourself. With no hours, you ring whenever you’re on duty.'],
        ['Messages', 'New messages are the ones nobody has played yet. Playing one marks it Heard by you, so nobody rings the same person twice. Mark unheard hands it back.'],
        ['Who’s on', 'Who’s on shows everyone on your lines and whether a call would reach them now. Check it before you go off duty, so a line isn’t left with nobody.'],
      ],
    },
    th: {
      brandVenues: 'Reviewslip Phone', brandReviewslip: 'Reviewslip · ฝ่ายขายและบริการลูกค้า', menu: 'เมนู',
      signOut: 'ออกจากระบบ', signInTitle: 'เข้าสู่ระบบเพื่อรับสาย',
      signInNote: 'พนักงานที่ได้รับเชิญเข้าสู่ระบบที่นี่ เจ้าของที่พักเปิดโทรศัพท์จากแดชบอร์ด',
      rsTitle: 'โทรศัพท์ฝ่ายขายและบริการลูกค้า', rsNote: 'เปิดโทรศัพท์นี้จากแดชบอร์ด: Admin › Sales & Support ระบบจะเข้าสู่ระบบให้',
      openDashboard: 'เปิดแดชบอร์ด', email: 'อีเมล', password: 'รหัสผ่าน', signIn: 'เข้าสู่ระบบ',
      newPassword: 'ตั้งรหัสผ่าน', start: 'เริ่มรับสาย', inviteTitle: 'สวัสดี {name}',
      inviteNote: 'ตั้งรหัสผ่านเพื่อรับสายของ {venues}', expired: 'หมดเวลาเข้าสู่ระบบ โปรดเข้าสู่ระบบอีกครั้ง',
      tapForSound: 'แตะเพื่อเปิดเสียงเรียกเข้า', mute: 'ปิดไมค์', unmute: 'เปิดไมค์', hangUp: 'วางสาย', inCall: 'กำลังสนทนา',
      goOn: 'เริ่มเข้ากะ', goOff: 'ออกจากกะ', offDuty: 'ไม่อยู่ในกะ', onDuty: 'อยู่ในกะ', connecting: 'กำลังเชื่อมต่อ…',
      reconnecting: 'กำลังเชื่อมต่อใหม่…', outside: 'ไม่อยู่ในกะ — นอกเวลาทำงาน',
      subOff: 'สายจะไม่ดังที่นี่ และปุ่มโทรจะให้ฝากข้อความ กดเริ่มเข้ากะเพื่อรับสาย',
      subOn: 'หน้านี้จะดังเมื่อมีคนโทรเข้า เปิดหน้านี้ไว้ หรือให้โทรศัพท์ดังแม้ปิดหน้านี้',
      subConnecting: 'คุณอยู่ในกะ กำลังเชื่อมต่อหน้านี้ให้พร้อมรับสาย…',
      subOutside: 'ขณะนี้อยู่นอกเวลาทำงาน จึงไม่อยู่ในกะ และเว็บไซต์จะให้ฝากข้อความ เปิดหน้านี้ไว้ แล้วระบบจะเข้ากะให้เองเมื่อถึงเวลาทำงาน',
      takingFor: 'รับสายของ', pushNote: 'ใช้โทรศัพท์มือถือ? ให้ดังแม้ปิดหน้านี้', pushTurnOn: 'เปิด',
      pushOn: 'ดังเมื่อปิดหน้า: เปิด', pushOff: 'ดังเมื่อปิดหน้า: ปิด', pushBlocked: 'การแจ้งเตือนถูกบล็อกในการตั้งค่าเบราว์เซอร์',
      pushIos: 'บน iPhone ให้เพิ่มหน้านี้ไปที่หน้าจอโฮมก่อน (แชร์ แล้วเพิ่มไปยังหน้าจอโฮม)',
      howItWorks: 'วิธีใช้งาน', myHours: 'เวลาทำงาน', tabNew: 'ข้อความใหม่', tabAll: 'ข้อความ', tabCalls: 'สายล่าสุด',
      tabNewShort: 'ใหม่', tabAllShort: 'ข้อความ', tabCallsShort: 'สาย', tabTeamShort: 'ใครอยู่', moreRinging: 'อีก {n} สายกำลังดัง',
      tabTeam: 'ใครอยู่', vmSub: 'บันทึกไว้เมื่อไม่มีใครรับสายได้ เมื่อเปิดฟังจะขึ้นชื่อคุณ เพื่อไม่ให้โทรกลับคนเดียวกันซ้ำ',
      teamSub: 'ทุกคนในสายที่คุณรับ แยกตามสาย และสายจะถึงเขาได้ตอนนี้หรือไม่ ตรวจดูก่อนออกจากกะ',
      groupBy: 'จัดกลุ่มตาม', byTime: 'เวลา', byLine: 'สาย', line: 'สาย', allLines: 'ทุกสาย',
      noNew: 'ไม่มีข้อความใหม่', none: 'ยังไม่มี', noCallsLine: 'ยังไม่มีสายในสายนี้', loading: 'กำลังโหลด…',
      noLines: 'คุณยังไม่ได้อยู่ในสายใด จึงไม่มีรายชื่อ',
      nobodyFree: 'ตอนนี้ไม่มีใครรับสายนี้ได้ ผู้โทรจะได้ฝากข้อความ',
      hoursNote: '', timezone: 'เขตเวลา', save: 'บันทึก', saved: 'บันทึกแล้ว', to: 'ถึง',
      incoming: 'สายเรียกเข้า', aGuest: 'แขก', answer: 'รับสาย', decline: 'ปฏิเสธ',
      reservations: 'ฝ่ายจองห้องพัก', frontDesk: 'แผนกต้อนรับ', sales: 'ฝ่ายขาย', support: 'ฝ่ายบริการลูกค้า', fromPage: 'จาก {page}',
      gone: 'มีคนรับสายไปก่อนแล้ว', micBlocked: 'ไมโครโฟนถูกบล็อก โปรดอนุญาตให้หน้านี้ใช้ไมโครโฟน',
      callFailed: 'ไม่สามารถเชื่อมต่อสายได้', isNew: 'ใหม่', heardBy: '{name} ฟังแล้ว · {when}', heardByYou: 'คุณฟังแล้ว · {when}',
      heard: 'ฟังแล้ว · {when}', markHeard: 'ทำเป็นฟังแล้ว', markUnheard: 'ทำเป็นยังไม่ฟัง', noContact: 'ไม่ได้ฝากเบอร์หรืออีเมล',
      answered: 'รับสาย', missed: 'ไม่ได้รับ', abandoned: 'วางสาย', leftMessage: 'ข้อความเสียง', live: 'กำลังสนทนา',
      answeredBy: 'โดย {name}', confirmSignOut: 'การออกจากระบบจะวางสาย ต้องการออกจากระบบหรือไม่',
      days: 'จ.,อ.,พ.,พฤ.,ศ.,ส.,อา.', lang: 'English', you: 'คุณ',
      stAvailable: 'ว่าง', stCall: 'กำลังคุยสาย', stHours: 'นอกเวลาทำงาน', stClosed: 'ปิดหน้าโทรศัพท์', stOff: 'ไม่อยู่ในกะ',
      guide: [
        ['การเข้ากะ', 'กดเริ่มเข้ากะ คุณจะอยู่ในกะจนกว่าจะกดออกจากกะหรือออกจากระบบ การรีเฟรช ปิดแท็บ หรือเน็ตหลุดจะไม่ทำให้ออกจากกะ ระหว่างอยู่ในกะและเปิดหน้านี้ สายทุกสายของคุณจะดังที่นี่'],
        ['เมื่อปิดหน้านี้', 'เปิด "ดังเมื่อปิดหน้า" (ในเมนู หรือข้อความบนการ์ด) โทรศัพท์จะดังเป็นการแจ้งเตือนแม้ปิดหน้านี้ แตะเพื่อรับสาย บน iPhone ต้องเพิ่มหน้านี้ไปที่หน้าจอโฮมก่อน'],
        ['การรับสาย', 'ทุกคนที่ว่างในสายจะดังพร้อมกัน คนแรกที่กดรับได้สาย คนอื่นหยุดดัง การปฏิเสธจะส่งต่อให้คนอื่น ถ้าไม่มีใครรับภายในประมาณ 30 วินาที ผู้โทรจะได้ฝากข้อความ'],
        ['เวลาทำงาน', 'ตั้งสัปดาห์ทำงานในเมนู เวลาทำงาน นอกเวลาจะแสดงว่าไม่อยู่ในกะ และผู้โทรจะได้ฝากข้อความ เมื่อถึงเวลาทำงานจะกลับเข้ากะเอง ถ้าไม่ตั้งเวลา จะดังทุกครั้งที่อยู่ในกะ'],
        ['ข้อความ', 'ข้อความใหม่คือข้อความที่ยังไม่มีใครฟัง เมื่อเปิดฟังจะขึ้นว่าคุณฟังแล้ว เพื่อไม่ให้โทรกลับซ้ำ กด "ทำเป็นยังไม่ฟัง" เพื่อคืนให้คนอื่น'],
        ['ใครอยู่', 'แสดงทุกคนในสายของคุณ และสายจะถึงเขาได้ตอนนี้หรือไม่ ตรวจดูก่อนออกจากกะ เพื่อไม่ให้สายไม่มีคนรับ'],
      ],
    },
  };
  WORDS.en.hoursNote = 'Tick the days you work. Outside them you show as off duty and callers are offered a message; inside them you’re back on by yourself. With no day ticked, you ring whenever you’re on duty.';
  WORDS.th.hoursNote = 'เลือกวันที่ทำงาน นอกเวลาจะแสดงว่าไม่อยู่ในกะ และผู้โทรจะได้ฝากข้อความ เมื่อถึงเวลาจะกลับเข้ากะเอง ถ้าไม่เลือกวันใดเลย จะดังทุกครั้งที่อยู่ในกะ';

  function readLang() {
    try {
      var saved = localStorage.getItem('rs-phone-lang');
      if (saved && WORDS[saved]) return saved;
    } catch (e) { /* private mode */ }
    return /^th/i.test(navigator.language || '') ? 'th' : 'en';
  }
  var LANG = readLang();

  function t(key, vars) {
    var text = (WORDS[LANG] && WORDS[LANG][key]) || WORDS.en[key] || key;
    if (vars && typeof text === 'string') Object.keys(vars).forEach(function (k) { text = text.split('{' + k + '}').join(vars[k]); });
    return text;
  }

  function remember(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) { /* private mode */ }
    return null;
  }

  /* ----------------------------------------------------------- helpers */

  var SVG = 'http://www.w3.org/2000/svg';

  /** A line icon from a list of SVG path data. */
  function icon(paths) {
    var svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    paths.forEach(function (d) {
      var path = document.createElementNS(SVG, 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    });
    return svg;
  }

  var PHONE_ICON = ['M5 3.5h3.5l1.8 4.4-2.2 1.6a11 11 0 0 0 6.4 6.4l1.6-2.2 4.4 1.8V19a1.6 1.6 0 0 1-1.7 1.6A16.5 16.5 0 0 1 3.4 5.2 1.6 1.6 0 0 1 5 3.5z'];
  var HANGUP_ICON = ['M3.2 13.6c4.9-4.3 12.7-4.3 17.6 0l-1.9 2.6-3.4-1.3-.4-2.5a11 11 0 0 0-6.2 0l-.4 2.5-3.4 1.3z'];

  /** A round call button: the icon in a circle, the word under it (side by side on a computer). */
  function callButton(kind, label, paths, onclick) {
    return el('button', { type: 'button', class: 'callbtn ' + kind, onclick: onclick }, [
      el('span', { class: 'callbtn-ic' }, [icon(paths)]),
      el('span', { class: 'callbtn-l', text: label }),
    ]);
  }

  function initial(name) {
    return (String(name || '').trim().charAt(0) || '?').toUpperCase();
  }

  function $(id) { return document.getElementById(id); }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] == null) return;
      if (k === 'text') node.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function withPhone(path) {
    return path + (path.indexOf('?') === -1 ? '?' : '&') + 'phone=' + PHONE;
  }

  function api(path, opts) {
    opts = opts || {};
    return fetch(withPhone('/api/voice' + path), {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store',
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 401 && ['/login', '/handoff', '/invite'].indexOf(path.split('?')[0]) === -1) {
          showLogin(t('expired'));
          throw new Error(t('expired'));
        }
        if (!r.ok) throw new Error(d.error || 'Something went wrong.');
        return d;
      });
    });
  }

  function clock(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function when(iso) {
    var d = new Date(iso);
    var locale = LANG === 'th' ? 'th-TH' : 'en-GB';
    var sameDay = d.toDateString() === new Date().toDateString();
    return sameDay
      ? d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function desk(item) {
    if (item.venue) return item.team === 'support' ? t('frontDesk') : t('reservations');
    return item.team === 'support' ? t('support') : t('sales');
  }

  /** The line's own name and which desk: "Baanpong Lodge · Reservations". */
  function lineLabel(item) {
    return item.venue ? item.line + ' · ' + desk(item) : item.line;
  }

  var flashTimer = null;
  function flash(message) {
    var box = $('flash');
    box.textContent = message;
    box.hidden = false;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { box.hidden = true; }, 8000);
  }

  function show(id) {
    ['view-login', 'view-invite', 'view-phone'].forEach(function (v) { $(v).hidden = v !== id; });
    $('menu').hidden = id !== 'view-phone';
  }

  /* ------------------------------------------------------------- state */

  var me = null;
  var site = '';
  var ws = null;
  var wsTries = 0;
  var wsTimer = null;
  var ice = [];
  var rings = {};
  var active = null;
  var vmRows = [];
  var callRows = [];
  var tab = 'new';
  var worker = null;
  var pushSub = null;

  /* ------------------------------------------------------------- sound */

  var audioCtx = null;
  var unlocked = false;

  function unlock() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    unlocked = true;
    $('sound').hidden = true;
  }

  // On click, not pointerdown: the prompt goes as the tap ends, so nothing
  // under the finger moves before the tap lands.
  document.addEventListener('click', unlock, true);
  document.addEventListener('keydown', unlock, true);

  var ringTimer = null;

  /** Two short bursts every three seconds, while anything rings. */
  function ringtone(on) {
    clearTimeout(ringTimer);
    if (!on) return;
    function burst() {
      if (audioCtx && audioCtx.state === 'running') {
        [0, 0.45].forEach(function (offset) {
          var start = audioCtx.currentTime + offset;
          var gain = audioCtx.createGain();
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
          gain.gain.setValueAtTime(0.25, start + 0.35);
          gain.gain.linearRampToValueAtTime(0, start + 0.4);
          gain.connect(audioCtx.destination);
          [440, 480].forEach(function (f) {
            var osc = audioCtx.createOscillator();
            osc.frequency.value = f;
            osc.connect(gain);
            osc.start(start);
            osc.stop(start + 0.42);
          });
        });
      }
      if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) {
        navigator.vibrate([400, 200, 400]);
      }
      ringTimer = setTimeout(burst, 3000);
    }
    burst();
  }

  /* ------------------------------------------------------------ sign-in */

  function showLogin(message) {
    stopSocket();
    me = null;
    show('view-login');
    var rs = PHONE === 'reviewslip';
    $('login-title').textContent = rs ? t('rsTitle') : t('signInTitle');
    $('login-note').textContent = rs ? t('rsNote') : t('signInNote');
    $('login-form').hidden = rs;
    var link = $('login-dashboard');
    link.hidden = !site;
    link.textContent = t('openDashboard');
    if (site) link.href = site + (rs ? '/dashboard/calls' : '/dashboard');
    var err = $(rs ? 'login-only-error' : 'login-error');
    err.textContent = message || '';
    err.hidden = !message;
  }

  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    var err = $('login-error');
    err.hidden = true;
    api('/login', { method: 'POST', body: { email: form.email.value, password: form.password.value } })
      .then(load)
      .catch(function (x) { err.textContent = x.message; err.hidden = false; });
  });

  var inviteToken = '';
  $('invite-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('invite-error');
    err.hidden = true;
    api('/invite', { method: 'POST', body: { token: inviteToken, password: e.target.password.value } })
      .then(load)
      .catch(function (x) { err.textContent = x.message; err.hidden = false; });
  });

  /* --------------------------------------------------------------- menu */

  function closeMenu() {
    $('menu-list').hidden = true;
    $('profile').setAttribute('aria-expanded', 'false');
  }

  $('profile').addEventListener('click', function () {
    var list = $('menu-list');
    list.hidden = !list.hidden;
    $('profile').setAttribute('aria-expanded', String(!list.hidden));
  });

  document.addEventListener('click', function (e) {
    if (!$('menu').contains(e.target)) closeMenu();
  });

  $('m-duty').addEventListener('click', function () { closeMenu(); setDuty(!me.agent.onDuty); });
  $('m-hours').addEventListener('click', function () { closeMenu(); openHours(); });
  $('m-push').addEventListener('click', function () { closeMenu(); togglePush(); });
  $('m-guide').addEventListener('click', function () { closeMenu(); openGuide(); });
  $('help').addEventListener('click', openGuide);
  $('m-lang').addEventListener('click', function () {
    closeMenu();
    LANG = LANG === 'th' ? 'en' : 'th';
    remember('rs-phone-lang', LANG);
    paintWords();
    if (me) paintAll();
    else showLogin();
  });

  function signOut() {
    if (active && !window.confirm(t('confirmSignOut'))) return;
    endCall(true);
    closeMenu();
    api('/logout', { method: 'POST' }).catch(function () {}).then(function () { showLogin(); });
  }
  $('m-signout').addEventListener('click', signOut);
  $('foot-signout').addEventListener('click', signOut);

  /* ------------------------------------------------------------ overlays */

  function openOverlay(id) {
    $(id).hidden = false;
    var close = $(id).querySelector('[data-close]');
    if (close) close.focus();
  }

  Array.prototype.forEach.call(document.querySelectorAll('.overlay'), function (o) {
    o.addEventListener('click', function (e) {
      if (e.target === o || e.target.closest('[data-close]')) o.hidden = true;
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') Array.prototype.forEach.call(document.querySelectorAll('.overlay'), function (o) { o.hidden = true; });
  });

  function openGuide() {
    var body = $('guide-body');
    body.innerHTML = '';
    t('guide').forEach(function (part) {
      body.appendChild(el('h3', { text: part[0] }));
      body.appendChild(el('p', { text: part[1] }));
    });
    openOverlay('guide');
  }

  /* ------------------------------------------------------------- words */

  function paintWords() {
    document.documentElement.lang = LANG;
    var brand = PHONE === 'reviewslip' ? t('brandReviewslip') : t('brandVenues');
    $('brand').textContent = brand;
    document.title = brand;
    Array.prototype.forEach.call(document.querySelectorAll('[data-t]'), function (node) {
      node.textContent = t(node.getAttribute('data-t'));
    });
    $('m-lang').textContent = t('lang');
  }

  /* --------------------------------------------------------------- load */

  function load() {
    return api('/me').then(function (data) {
      me = data;
      show('view-phone');
      $('me-name').textContent = me.agent.name;
      $('me-email').textContent = me.agent.email;
      $('avatar').textContent = (me.agent.name || '?').trim().charAt(0).toUpperCase();
      paintAll();
      loadVoicemail();
      if (me.agent.onDuty) startSocket();
      registerWorker();
    });
  }

  /** /me again, quietly: hours starting or ending change what the card says. */
  function refreshMe() {
    if (!me) return;
    api('/me').then(function (d) {
      me = d;
      paintDuty();
      paintPick();
    }).catch(function () {});
  }

  function paintAll() {
    paintDuty();
    paintPick();
    paintPush();
    paintVoicemail();
    if (tab === 'calls') loadCalls();
    if (tab === 'team') loadTeam();
  }

  /* --------------------------------------------------------------- duty */

  /**
   * One of: off (the switch), hours (on, but outside their hours),
   * connecting (on, the socket not open yet) or on.
   */
  function dutyState() {
    if (!me || !me.agent.onDuty) return 'off';
    if (!me.inHours) return 'hours';
    if (!ws || ws.readyState !== 1) return 'connecting';
    return 'on';
  }

  function paintDuty() {
    if (!me) return;
    var state = dutyState();
    $('duty').dataset.duty = state;
    $('profile').dataset.duty = state;
    $('duty-label').textContent = {
      off: t('offDuty'),
      hours: t('outside'),
      connecting: wsTries ? t('reconnecting') : t('connecting'),
      on: t('onDuty'),
    }[state];
    $('duty-sub').textContent = { off: t('subOff'), hours: t('subOutside'), connecting: t('subConnecting'), on: t('subOn') }[state];
    $('duty-on').hidden = me.agent.onDuty;
    $('duty-off').hidden = !me.agent.onDuty;
    $('duty-off-sep').hidden = !me.agent.onDuty;
    $('m-duty').textContent = me.agent.onDuty ? t('goOff') : t('goOn');
    $('sound').hidden = unlocked || !me.agent.onDuty;
    var canPush = me.pushKey && worker && 'PushManager' in window;
    $('push-note').hidden = !(me.agent.onDuty && canPush && !pushSub && !(window.Notification && Notification.permission === 'denied'));
  }

  function setDuty(on) {
    unlock();
    api('/duty', { method: 'PUT', body: { on: on } }).then(function () {
      me.agent.onDuty = on;
      if (on) startSocket();
      else stopSocket();
      paintDuty();
      if (tab === 'team') loadTeam();
    }).catch(function (x) { flash(x.message); });
  }

  $('duty-on').addEventListener('click', function () { setDuty(true); });
  $('duty-off').addEventListener('click', function () { setDuty(false); });

  /** Taking calls for: one chip a line, only with more than one. One stays on. */
  function paintPick() {
    var box = $('duty-pick-list');
    box.innerHTML = '';
    $('duty-pick').hidden = me.lines.length < 2;
    me.lines.forEach(function (line) {
      box.appendChild(el('button', {
        type: 'button',
        class: 'chip',
        'aria-pressed': String(line.taking),
        text: line.name,
        onclick: function () {
          var off = me.lines
            .filter(function (l) { return l.key === line.key ? l.taking : !l.taking; })
            .map(function (l) { return l.key; });
          api('/lines', { method: 'PUT', body: { off: off } })
            .then(function (d) { me.lines = d.lines; paintPick(); if (tab === 'team') loadTeam(); })
            .catch(function (x) { flash(x.message); });
        },
      }));
    });
  }

  /* ------------------------------------------------------------- socket */

  function startSocket() {
    if (ws && ws.readyState <= 1) return;
    clearTimeout(wsTimer);
    ws = new WebSocket(location.origin.replace(/^http/, 'ws') + '/api/voice/ws?as=agent&phone=' + PHONE);
    paintDuty();
    ws.onopen = function () {
      wsTries = 0;
      sendVisibility();
      paintDuty();
    };
    ws.onmessage = function (e) {
      var msg;
      try { msg = JSON.parse(e.data); } catch (x) { return; }
      onMessage(msg);
    };
    ws.onclose = function () {
      ws = null;
      if (active) endCall(false, t('callFailed'));
      clearRings();
      if (!me || !me.agent.onDuty) return paintDuty();
      wsTries += 1;
      paintDuty();
      var wait = Math.min(15000, 1000 * Math.pow(2, Math.min(wsTries, 4)));
      // Ask who we are before trying again: a refused socket may be a session
      // that ended, which /me turns into the sign-in form.
      wsTimer = setTimeout(function () {
        api('/me').then(function (d) { me = d; if (me.agent.onDuty) startSocket(); paintDuty(); }).catch(function () {});
      }, wait);
    };
  }

  function stopSocket() {
    clearTimeout(wsTimer);
    wsTries = 0;
    if (ws) {
      var old = ws;
      ws = null;
      old.onclose = null;
      old.close();
    }
    clearRings();
  }

  function sendWs(msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  function sendVisibility() {
    sendWs({ t: 'visibility', hidden: document.visibilityState === 'hidden' });
  }

  document.addEventListener('visibilitychange', function () {
    sendVisibility();
    if (document.visibilityState === 'visible' && me) {
      refreshMe();
      loadVoicemail();
    }
  });

  function onMessage(msg) {
    if (msg.t === 'hello') {
      ice = msg.ice || [];
    } else if (msg.t === 'ring') {
      rings[msg.call.id] = msg.call;
      paintRings();
      notify(msg.call);
    } else if (msg.t === 'cancelled' || msg.t === 'taken') {
      dropRing(msg.callId);
      if (msg.t === 'cancelled') setTimeout(loadVoicemail, 4000);
    } else if (msg.t === 'gone') {
      dropRing(msg.callId);
      if (active && active.id === msg.callId) endCall(false, t('gone'));
    } else if (msg.t === 'won') {
      if (active && active.id === msg.callId) {
        ice = msg.ice || ice;
        connectCall();
      }
    } else if (msg.t === 'signal') {
      onSignal(msg.data);
    } else if (msg.t === 'ended') {
      if (active && active.id === msg.callId) endCall(false);
    }
  }

  /* -------------------------------------------------------------- rings */

  function clearRings() {
    rings = {};
    paintRings();
  }

  function dropRing(id) {
    delete rings[id];
    closeNotification(id);
    paintRings();
  }

  function paintRings() {
    var box = $('rings');
    box.innerHTML = '';
    var list = Object.keys(rings).map(function (k) { return rings[k]; })
      .sort(function (a, b) { return a.startedAt - b.startedAt; });
    // One call at a time: while you talk, the server rings someone else.
    if (active) list = [];
    list.forEach(function (call, i) {
      if (i === 0) {
        box.appendChild(el('section', { class: 'card ring' }, [
          el('div', { class: 'call-top' }, [
            el('p', { class: 'eyebrow', text: t('incoming') }),
            el('span', { class: 'call-avatar ringing', 'aria-hidden': 'true' }, [call.caller ? initial(call.caller) : icon(PHONE_ICON)]),
            el('h2', { text: call.caller || t('aGuest') }),
            el('p', { class: 'muted', text: call.title + ' · ' + desk(call) }),
            call.page ? el('p', { class: 'muted small', text: t('fromPage', { page: call.page }) }) : null,
            list.length > 1 ? el('p', { class: 'more-ringing', text: t('moreRinging', { n: list.length - 1 }) }) : null,
          ]),
          el('div', { class: 'call-actions' }, [
            callButton('end', t('decline'), HANGUP_ICON, function () { decline(call.id); }),
            callButton('answer', t('answer'), PHONE_ICON, function () { answer(call); }),
          ]),
        ]));
        return;
      }
      box.appendChild(el('section', { class: 'card ring later' }, [
        el('div', {}, [
          el('p', { class: 'eyebrow', text: t('incoming') + ' · ' + call.title + ' · ' + desk(call) }),
          el('h2', { text: call.caller || t('aGuest') }),
        ]),
        el('div', { class: 'row' }, [
          el('button', { type: 'button', class: 'btn danger small', text: t('decline'), onclick: function () { decline(call.id); } }),
          el('button', { type: 'button', class: 'btn answer small', text: t('answer'), onclick: function () { answer(call); } }),
        ]),
      ]));
    });
    // On a phone the ring and the call cover the page; the page behind
    // stays still rather than scrolling under a thumb.
    document.body.dataset.screen = active ? 'call' : list.length ? 'ring' : '';
    ringtone(list.length > 0);
    var brand = PHONE === 'reviewslip' ? t('brandReviewslip') : t('brandVenues');
    document.title = list.length ? '📞 ' + t('incoming') + ' — ' + brand : brand;
  }

  function decline(id) {
    sendWs({ t: 'decline', callId: id });
    dropRing(id);
  }

  /* --------------------------------------------------------------- call */

  function answer(call) {
    unlock();
    ringtone(false);
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then(function (stream) {
        active = { id: call.id, call: call, stream: stream, pc: null, queued: [], since: null, timer: null, muted: false };
        delete rings[call.id];
        closeNotification(call.id);
        paintRings();
        paintCall(t('connecting'));
        sendWs({ t: 'answer', callId: call.id });
      })
      .catch(function () {
        flash(t('micBlocked'));
        paintRings();
      });
  }

  function connectCall() {
    var a = active;
    var pc = new RTCPeerConnection({ iceServers: ice });
    a.pc = pc;
    a.stream.getTracks().forEach(function (tr) { pc.addTrack(tr, a.stream); });
    var audio = el('audio', { autoplay: '' });
    audio.style.display = 'none';
    document.body.appendChild(audio);
    a.audio = audio;
    pc.ontrack = function (e) { audio.srcObject = e.streams[0]; audio.play().catch(function () {}); };
    pc.onicecandidate = function (e) {
      if (e.candidate) sendWs({ t: 'signal', callId: a.id, data: { candidate: e.candidate } });
    };
    pc.onconnectionstatechange = function () {
      if (pc.connectionState === 'connected' && !a.since) {
        a.since = Date.now();
        a.timer = setInterval(function () {
          $('call-time').textContent = clock(Math.round((Date.now() - a.since) / 1000));
        }, 1000);
        $('call-time').textContent = '0:00';
      } else if (pc.connectionState === 'failed') {
        endCall(true, t('callFailed'));
      }
    };
  }

  function onSignal(data) {
    var a = active;
    if (!a || !a.pc || !data) return;
    if (data.sdp) {
      a.pc.setRemoteDescription(data.sdp)
        .then(function () {
          a.queued.forEach(function (c) { a.pc.addIceCandidate(c).catch(function () {}); });
          a.queued = [];
          if (data.sdp.type === 'offer') {
            return a.pc.createAnswer().then(function (ans) { return a.pc.setLocalDescription(ans); }).then(function () {
              sendWs({ t: 'signal', callId: a.id, data: { sdp: a.pc.localDescription } });
            });
          }
        })
        .catch(function () { endCall(true, t('callFailed')); });
    } else if (data.candidate) {
      if (a.pc.remoteDescription) a.pc.addIceCandidate(data.candidate).catch(function () {});
      else a.queued.push(data.candidate);
    }
  }

  function paintCall(status) {
    var a = active;
    $('call').hidden = !a;
    $('duty').hidden = Boolean(a);
    document.body.dataset.screen = a ? 'call' : Object.keys(rings).length ? 'ring' : '';
    if (!a) return;
    $('call-avatar').textContent = a.call.caller ? initial(a.call.caller) : '';
    if (!a.call.caller) $('call-avatar').appendChild(icon(PHONE_ICON));
    $('call-who').textContent = a.call.caller || t('aGuest');
    $('call-line').textContent = a.call.title + ' · ' + desk(a.call);
    $('call-time').textContent = status || (a.since ? clock(Math.round((Date.now() - a.since) / 1000)) : '');
    $('mute-l').textContent = a.muted ? t('unmute') : t('mute');
    $('mute').setAttribute('aria-pressed', String(a.muted));
  }

  function endCall(tellServer, message) {
    var a = active;
    if (!a) return;
    if (tellServer) sendWs({ t: 'hangup', callId: a.id });
    active = null;
    clearInterval(a.timer);
    if (a.pc) try { a.pc.close(); } catch (e) { /* closed */ }
    if (a.stream) a.stream.getTracks().forEach(function (tr) { tr.stop(); });
    if (a.audio) a.audio.remove();
    paintCall();
    paintRings();
    if (message) flash(message);
    if (tab === 'calls') loadCalls();
  }

  $('hang-up').addEventListener('click', function () { endCall(true); });
  $('mute').addEventListener('click', function () {
    if (!active) return;
    active.muted = !active.muted;
    active.stream.getAudioTracks().forEach(function (tr) { tr.enabled = !active.muted; });
    paintCall();
  });

  window.addEventListener('beforeunload', function (e) {
    if (active) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  /* ------------------------------------------------- notifications, push */

  function registerWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE }).then(function (reg) {
      worker = reg;
      if (!('PushManager' in window)) return paintPush();
      return reg.pushManager.getSubscription().then(function (sub) {
        pushSub = sub;
        paintPush();
      });
    }).catch(function () { /* ringing when closed stays off */ });
  }

  /** The page's own ring when it is open but behind other windows. */
  function notify(call) {
    if (document.visibilityState === 'visible' || !worker || !window.Notification || Notification.permission !== 'granted') return;
    worker.showNotification(t('incoming'), {
      body: (call.caller || t('aGuest')) + ' · ' + call.title,
      tag: 'call-' + call.id,
      renotify: true,
      requireInteraction: true,
      icon: '/phone/icon.svg',
      data: { url: BASE + '?call=' + call.id },
    }).catch(function () {});
  }

  function closeNotification(id) {
    if (!worker || !worker.getNotifications) return;
    worker.getNotifications({ tag: 'call-' + id }).then(function (list) {
      list.forEach(function (n) { n.close(); });
    }).catch(function () {});
  }

  function urlKey(base64) {
    var pad = '='.repeat((4 - (base64.length % 4)) % 4);
    var raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function paintPush() {
    var item = $('m-push');
    if (!me || !me.pushKey || !worker || !('PushManager' in window)) {
      // Nothing to switch, but an iPhone outside the Home Screen can be told why.
      var ios = /iPhone|iPad/.test(navigator.userAgent) && !window.navigator.standalone;
      item.hidden = !(me && me.pushKey && ios);
      item.textContent = t('pushIos');
      item.disabled = true;
      paintDuty();
      return;
    }
    item.disabled = false;
    item.hidden = false;
    item.textContent = pushSub ? t('pushOn') : t('pushOff');
    paintDuty();
  }

  function togglePush() {
    if (!worker || !me.pushKey) return;
    if (pushSub) {
      var endpoint = pushSub.endpoint;
      pushSub.unsubscribe()
        .then(function () { return api('/push', { method: 'DELETE', body: { endpoint: endpoint } }); })
        .catch(function () {})
        .then(function () { pushSub = null; paintPush(); });
      return;
    }
    if (window.Notification && Notification.permission === 'denied') return flash(t('pushBlocked'));
    Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') return flash(t('pushBlocked'));
      return worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlKey(me.pushKey) })
        .then(function (s) {
          return api('/push', { method: 'POST', body: { subscription: s.toJSON() } }).then(function () {
            pushSub = s;
            paintPush();
          });
        });
    }).catch(function (x) { flash(x.message); });
  }

  $('push-note-on').addEventListener('click', togglePush);
  $('sound').addEventListener('click', unlock);

  /* ---------------------------------------------------------------- tabs */

  function selectTab(name) {
    tab = name;
    Array.prototype.forEach.call(document.querySelectorAll('.log-tab'), function (b) {
      b.setAttribute('aria-selected', String(b.dataset.tab === name));
    });
    $('panel-vm').hidden = name !== 'new' && name !== 'all';
    $('panel-calls').hidden = name !== 'calls';
    $('panel-team').hidden = name !== 'team';
    if (name === 'new' || name === 'all') {
      paintVoicemail();
      loadVoicemail();
    }
    if (name === 'calls') loadCalls();
    if (name === 'team') loadTeam();
  }

  Array.prototype.forEach.call(document.querySelectorAll('.log-tab'), function (b) {
    b.addEventListener('click', function () { selectTab(b.dataset.tab); });
  });

  /* ---------------------------------------- group by, and one line only */

  /**
   * The Group by switch and the line picker above a list. They only appear
   * when the list holds more than one line; the choice is kept per browser.
   */
  function listBar(kind, rows, bar, select, paint) {
    var names = [];
    rows.forEach(function (r) { if (names.indexOf(r.line) === -1) names.push(r.line); });
    names.sort();
    bar.hidden = names.length < 2;
    var by = remember('rs-phone-' + kind + '-by') || 'time';
    var pick = remember('rs-phone-' + kind + '-line') || '';
    if (pick && names.indexOf(pick) === -1) pick = '';
    Array.prototype.forEach.call(bar.querySelectorAll('.seg-btn'), function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.by === by));
      b.onclick = function () { remember('rs-phone-' + kind + '-by', b.dataset.by); paint(); };
    });
    select.innerHTML = '';
    select.appendChild(el('option', { value: '', text: t('allLines') }));
    names.forEach(function (n) {
      var o = el('option', { value: n, text: n });
      if (n === pick) o.selected = true;
      select.appendChild(o);
    });
    select.onchange = function () { remember('rs-phone-' + kind + '-line', select.value); paint(); };
    var shown = pick ? rows.filter(function (r) { return r.line === pick; }) : rows;
    return { rows: shown, byLine: !bar.hidden && by === 'line' && !pick };
  }

  /** Rows into the box: by time, or under a heading per line. */
  function fill(box, rows, byLine, rowOf, headOf) {
    box.innerHTML = '';
    if (!byLine) {
      rows.forEach(function (r) { box.appendChild(rowOf(r)); });
      return;
    }
    var groups = {};
    var order = [];
    rows.forEach(function (r) {
      if (!groups[r.line]) { groups[r.line] = []; order.push(r.line); }
      groups[r.line].push(r);
    });
    order.sort().forEach(function (name) {
      box.appendChild(el('h3', { class: 'group-h', text: headOf ? headOf(name, groups[name]) : name }));
      groups[name].forEach(function (r) { box.appendChild(rowOf(r)); });
    });
  }

  /* ----------------------------------------------------------- messages */

  function loadVoicemail() {
    if (!me) return Promise.resolve();
    return api('/voicemails').then(function (d) {
      vmRows = d.voicemails;
      paintVoicemail();
    }).catch(function () {});
  }

  function heardTag(v) {
    if (!v.heard) return el('span', { class: 'tag new', text: t('isNew') });
    var at = when(v.heardAt || v.at);
    if (v.heardBy && me && v.heardBy === me.agent.name) return el('span', { class: 'tag', text: t('heardByYou', { when: at }) });
    return el('span', { class: 'tag', text: v.heardBy ? t('heardBy', { name: v.heardBy, when: at }) : t('heard', { when: at }) });
  }

  function setHeard(v, heard) {
    api('/voicemails/' + v.id + '/heard', { method: 'POST', body: { heard: heard } })
      .then(function (d) { vmRows = d.voicemails; paintVoicemail(); })
      .catch(function (x) { flash(x.message); });
  }

  function contactLink(value) {
    var digits = value.replace(/[^\d+]/g, '');
    if (/\S+@\S+\.\S+/.test(value)) return el('a', { href: 'mailto:' + value.trim(), text: value });
    if (digits.length >= 6) return el('a', { href: 'tel:' + digits, text: value });
    return el('span', { text: value });
  }

  function vmRow(v) {
    var audio = el('audio', { controls: '', preload: 'none', src: withPhone('/api/voice/voicemails/' + v.id + '/audio') });
    audio.addEventListener('play', function () { if (!v.heard) setHeard(v, true); }, { once: true });
    return el('div', { class: 'hist-row item' + (v.heard ? '' : ' is-new') }, [
      el('div', { class: 'item-top' }, [
        el('span', { class: 'who', text: v.caller || t('aGuest') }),
        el('span', { class: 'when', text: when(v.at) }),
      ]),
      el('div', { class: 'item-meta' }, [el('span', { class: 'muted', text: lineLabel(v) + ' · ' + clock(v.seconds) }), heardTag(v)]),
      audio,
      el('div', { class: 'item-actions' }, [
        v.contact ? contactLink(v.contact) : el('span', { class: 'muted small', text: t('noContact') }),
        el('button', { type: 'button', class: 'btn small', text: v.heard ? t('markUnheard') : t('markHeard'), onclick: function () { setHeard(v, !v.heard); } }),
      ]),
    ]);
  }

  function paintVoicemail() {
    var fresh = vmRows.filter(function (v) { return !v.heard; });
    $('vm-count').hidden = !fresh.length;
    $('vm-count').textContent = String(fresh.length);
    if (tab !== 'new' && tab !== 'all') return;
    var source = tab === 'new' ? fresh : vmRows;
    var view = listBar('vm', vmRows, $('vm-bar'), $('vm-line'), paintVoicemail);
    var rows = view.rows.filter(function (v) { return source.indexOf(v) !== -1; });
    var box = $('vm-list');
    if (!rows.length) {
      box.innerHTML = '';
      box.appendChild(el('p', { class: 'empty', text: tab === 'new' ? t('noNew') : t('none') }));
      return;
    }
    fill(box, rows, view.byLine, vmRow, function (name, group) {
      var n = group.filter(function (v) { return !v.heard; }).length;
      return n ? name + ' · ' + n + ' ' + t('isNew').toLowerCase() : name;
    });
  }

  /* -------------------------------------------------------------- calls */

  var OUTCOME = { answered: 'answered', voicemail: 'leftMessage', abandoned: 'abandoned', live: 'live', missed: 'missed' };

  function callRow(c) {
    var kind = OUTCOME[c.outcome] ? c.outcome : 'missed';
    var detail = kind === 'answered'
      ? t('answeredBy', { name: c.answeredBy }) + (c.seconds != null ? ' · ' + clock(c.seconds) : '')
      : '';
    return el('div', { class: 'hist-row item' }, [
      el('div', { class: 'item-top' }, [
        el('span', { class: 'who', text: c.caller || t('aGuest') }),
        el('span', { class: 'when', text: when(c.startedAt) }),
      ]),
      el('div', { class: 'item-meta' }, [
        el('span', { class: 'muted', text: lineLabel(c) }),
        el('span', { class: 'tag ' + (kind === 'voicemail' ? 'voicemail' : kind === 'answered' ? 'answered' : ''), text: t(OUTCOME[kind]) }),
        detail ? el('span', { class: 'muted small', text: detail }) : null,
      ]),
    ]);
  }

  function paintCalls() {
    var view = listBar('calls', callRows, $('call-bar'), $('call-line-pick'), paintCalls);
    var box = $('call-list');
    if (!view.rows.length) {
      box.innerHTML = '';
      box.appendChild(el('p', { class: 'empty', text: callRows.length ? t('noCallsLine') : t('none') }));
      return;
    }
    fill(box, view.rows, view.byLine, callRow, function (name, group) {
      var missed = group.filter(function (c) { return c.outcome !== 'answered' && c.outcome !== 'live'; }).length;
      return missed ? name + ' · ' + missed + ' ' + t('missed').toLowerCase() : name;
    });
  }

  function loadCalls() {
    api('/calls').then(function (d) {
      callRows = d.calls;
      paintCalls();
    }).catch(function () {});
  }

  /* --------------------------------------------------------- who's on */

  var STATE_WORD = { available: 'stAvailable', call: 'stCall', hours: 'stHours', closed: 'stClosed', off: 'stOff' };
  var teamTimer = null;

  function loadTeam() {
    clearTimeout(teamTimer);
    if (tab !== 'team' || !me) return;
    var box = $('team-list');
    if (!box.children.length) box.appendChild(el('p', { class: 'empty', text: t('loading') }));
    api('/colleagues').then(function (d) {
      box.innerHTML = '';
      if (!d.lines.length) {
        box.appendChild(el('p', { class: 'empty', text: t('noLines') }));
        return;
      }
      d.lines.forEach(function (line) {
        box.appendChild(el('h3', { class: 'group-h', text: line.name }));
        if (!line.people.some(function (p) { return p.state === 'available'; })) {
          box.appendChild(el('p', { class: 'warn', text: t('nobodyFree') }));
        }
        line.people.forEach(function (p) {
          box.appendChild(el('div', { class: 'hist-row person' }, [
            el('span', { class: 'person-avatar', 'aria-hidden': 'true', text: initial(p.name) }),
            el('span', { class: 'who', text: p.name + (p.you ? ' (' + t('you') + ')' : '') }),
            el('span', { class: 'tag ' + p.state, text: t(STATE_WORD[p.state] || 'stOff') }),
          ]));
        });
      });
    }).catch(function () {}).then(function () {
      // While it's open, every 30 seconds; never while it's closed.
      if (tab === 'team') teamTimer = setTimeout(loadTeam, 30000);
    });
  }

  /* -------------------------------------------------------------- hours */

  var ZONES = ['Asia/Bangkok', 'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Jakarta', 'Asia/Ho_Chi_Minh', 'Asia/Manila',
    'Asia/Hong_Kong', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Kolkata', 'Asia/Dubai', 'Australia/Sydney',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'UTC'];

  function openHours() {
    var days = t('days').split(',');
    var box = $('hours-days');
    box.innerHTML = '';
    for (var d = 1; d <= 7; d++) {
      var shift = (me.hours || []).filter(function (h) { return h.day === d; })[0];
      var check = el('input', { type: 'checkbox', 'data-day': String(d) });
      check.checked = Boolean(shift);
      var from = el('input', { type: 'time', 'data-from': String(d), value: shift ? shift.from : '09:00', 'aria-label': days[d - 1] });
      var to = el('input', { type: 'time', 'data-to': String(d), value: shift ? shift.to : '17:00', 'aria-label': days[d - 1] + ' ' + t('to') });
      from.disabled = to.disabled = !check.checked;
      (function (c, f, tt) {
        c.addEventListener('change', function () { f.disabled = tt.disabled = !c.checked; });
      })(check, from, to);
      box.appendChild(el('div', { class: 'day' }, [el('label', {}, [check, days[d - 1]]), from, el('span', { class: 'muted small', text: t('to') }), to]));
    }
    var tz = $('hours-tz');
    tz.innerHTML = '';
    (ZONES.indexOf(me.timezone) === -1 ? [me.timezone].concat(ZONES) : ZONES).forEach(function (z) {
      var opt = el('option', { value: z, text: z.replace(/_/g, ' ') });
      if (z === me.timezone) opt.selected = true;
      tz.appendChild(opt);
    });
    $('hours-error').hidden = true;
    $('hours-saved').hidden = true;
    openOverlay('hours');
  }

  $('hours-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var hours = [];
    for (var d = 1; d <= 7; d++) {
      if (document.querySelector('[data-day="' + d + '"]').checked) {
        hours.push({
          day: d,
          from: document.querySelector('[data-from="' + d + '"]').value,
          to: document.querySelector('[data-to="' + d + '"]').value,
        });
      }
    }
    var err = $('hours-error');
    err.hidden = true;
    api('/hours', { method: 'PUT', body: { hours: hours, timezone: $('hours-tz').value } })
      .then(function () {
        $('hours-saved').hidden = false;
        refreshMe();
        setTimeout(function () { $('hours').hidden = true; }, 700);
      })
      .catch(function (x) { err.textContent = x.message; err.hidden = false; });
  });

  /* -------------------------------------------------------------- start */

  paintWords();

  // Tokens arrive in the fragment, which never reaches a server log, and are
  // wiped from the address bar before anything else happens.
  var hash = new URLSearchParams(location.hash.slice(1));
  if (location.hash) history.replaceState(null, '', location.pathname);

  fetch('/api/voice/config', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (d) { site = String(d.siteUrl || ''); })
    .catch(function () {})
    .then(function () {
      if (hash.get('handoff')) {
        api('/handoff', { method: 'POST', body: { token: hash.get('handoff') } })
          .then(load)
          .catch(function (x) { showLogin(x.message); });
      } else if (hash.get('invite') && PHONE === 'venues') {
        inviteToken = hash.get('invite');
        api('/invite?token=' + encodeURIComponent(inviteToken))
          .then(function (inv) {
            show('view-invite');
            $('invite-title').textContent = t('inviteTitle', { name: inv.name });
            $('invite-note').textContent = t('inviteNote', { venues: inv.venues || '' });
            $('invite-email').value = inv.email;
          })
          .catch(function (x) { showLogin(x.message); });
      } else {
        load().catch(function () { if (!me) showLogin(); });
      }
    });

  // Every minute, quietly: hours starting or ending, and a message left while
  // the page sat open.
  setInterval(function () {
    if (me && document.visibilityState === 'visible') {
      refreshMe();
      loadVoicemail();
    }
  }, 60000);
})();
