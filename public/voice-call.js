/*
 * Reviewslip call buttons: a guest presses Call and talks to the venue's desk,
 * or to Reviewslip's Sales or Support, in the browser. When nobody is free
 * they leave a voice message instead.
 *
 * One script per page:
 *
 *   <script defer src="https://api.reviewslip.com/voice-call.js"></script>
 *
 * and any number of buttons, each saying which line it rings:
 *
 *   <button type="button" data-rs-call data-voice-line="baanponglodge"
 *           data-voice-team="sales" hidden>
 *     <span data-voice-label>Call Reservations</span>
 *   </button>
 *
 *   data-voice-line    a venue's address, or "reviewslip"
 *   data-voice-team    sales | support (Reviewslip's line picks one; a venue
 *                      has one desk and only shows it to whoever answers)
 *   data-voice-caller  the caller's name, when the page knows it
 *   data-voice-phone   a number to show if the browser cannot call
 *   data-voice-leave   the button's words when only a message can be left
 *
 * data-rs-call, not the Vibe Crafted portal's data-voice-call: Reviewslip's
 * own Sales and Support buttons ring the portal through its widget, and the
 * two widgets must never both answer one click. A data-voice-call button that
 * names a line (data-voice-line) is still taken, for pages written before.
 *
 * A button stays hidden until its line answers: "open" shows it as it is,
 * "voicemail" relabels it to leave a message, "off" keeps it hidden — so a
 * phone link beside it stays the fallback. Buttons added later (a page that
 * navigates without reloading) are picked up on their own.
 *
 * The script tag may carry data-voice-api (defaults to where the script came
 * from), data-voice-lang (defaults to the page's lang) and data-voice-accent
 * (a CSS colour for the panel's main button).
 *
 * Audio goes browser to browser (WebRTC). The server only rings and passes
 * the messages that connect the two — see voicehub.js.
 */
(function () {
  'use strict';
  if (window.ReviewslipVoice) {
    window.ReviewslipVoice.refresh();
    return;
  }

  var script = document.currentScript;
  var API = ((script && script.dataset.voiceApi) || (script ? new URL(script.src).origin : location.origin)).replace(/\/$/, '');
  var ACCENT = script && script.dataset.voiceAccent;
  var POLL_MS = 45000;
  var TRIGGER = '[data-rs-call], [data-voice-call][data-voice-line]';
  var MAX_SECONDS = 120;

  /* ------------------------------------------------------------- words */

  var WORDS = {
    en: {
      leave: 'Leave a message', calling: 'Calling', allowMic: 'Allow the microphone to start the call.',
      connecting: 'Connecting…', mute: 'Mute', unmute: 'Unmute', hangUp: 'Hang up', close: 'Close',
      ended: 'Call ended', noAnswer: 'Nobody could answer just now.', away: 'Nobody is free right now.',
      leaveIntro: 'Leave a short message and they will get back to you.', record: 'Record message',
      stop: 'Stop', again: 'Record again', send: 'Send message', sending: 'Sending…', name: 'Your name',
      contact: 'Phone or email, for a call back', sent: 'Message sent. They will get back to you.',
      micBlocked: 'The microphone is blocked. Allow it in your browser, or call the number instead.',
      failed: 'The call could not connect.', callNumber: 'Call {number}', upTo: 'Up to 2 minutes.',
      error: 'Something went wrong. Try again.', recording: 'Recording',
    },
    th: {
      leave: 'ฝากข้อความ', calling: 'กำลังโทรหา', allowMic: 'อนุญาตให้ใช้ไมโครโฟนเพื่อเริ่มโทร',
      connecting: 'กำลังเชื่อมต่อ…', mute: 'ปิดเสียง', unmute: 'เปิดเสียง', hangUp: 'วางสาย', close: 'ปิด',
      ended: 'วางสายแล้ว', noAnswer: 'ขณะนี้ไม่มีผู้รับสาย', away: 'ขณะนี้ไม่มีผู้ว่างรับสาย',
      leaveIntro: 'ฝากข้อความสั้น ๆ แล้วทางเราจะติดต่อกลับ', record: 'อัดข้อความ',
      stop: 'หยุด', again: 'อัดใหม่', send: 'ส่งข้อความ', sending: 'กำลังส่ง…', name: 'ชื่อของคุณ',
      contact: 'เบอร์โทรหรืออีเมลสำหรับติดต่อกลับ', sent: 'ส่งข้อความแล้ว ทางเราจะติดต่อกลับ',
      micBlocked: 'ไมโครโฟนถูกบล็อก โปรดอนุญาตในเบราว์เซอร์ หรือโทรตามเบอร์แทน',
      failed: 'ไม่สามารถเชื่อมต่อสายได้', callNumber: 'โทร {number}', upTo: 'ไม่เกิน 2 นาที',
      error: 'เกิดข้อผิดพลาด โปรดลองอีกครั้ง', recording: 'กำลังอัด',
    },
    zh: {
      leave: '留言', calling: '正在呼叫', allowMic: '请允许使用麦克风以开始通话。',
      connecting: '正在连接…', mute: '静音', unmute: '取消静音', hangUp: '挂断', close: '关闭',
      ended: '通话已结束', noAnswer: '暂时无人接听。', away: '目前无人有空。',
      leaveIntro: '请留下简短留言，我们会回复您。', record: '录制留言',
      stop: '停止', again: '重新录制', send: '发送留言', sending: '正在发送…', name: '您的姓名',
      contact: '电话或电子邮箱，方便回电', sent: '留言已发送，我们会回复您。',
      micBlocked: '麦克风已被阻止。请在浏览器中允许，或直接拨打电话。',
      failed: '通话无法接通。', callNumber: '拨打 {number}', upTo: '最长 2 分钟。',
      error: '出了点问题，请重试。', recording: '正在录音',
    },
    ja: {
      leave: 'メッセージを残す', calling: '発信中', allowMic: '通話を始めるにはマイクを許可してください。',
      connecting: '接続中…', mute: 'ミュート', unmute: 'ミュート解除', hangUp: '切る', close: '閉じる',
      ended: '通話が終了しました', noAnswer: 'ただいま応答できる者がおりません。', away: '現在、対応できる者がおりません。',
      leaveIntro: '短いメッセージを残していただければ、折り返しご連絡します。', record: '録音する',
      stop: '停止', again: '録り直す', send: '送信', sending: '送信中…', name: 'お名前',
      contact: '折り返し用の電話番号またはメール', sent: '送信しました。折り返しご連絡します。',
      micBlocked: 'マイクがブロックされています。ブラウザで許可するか、電話でおかけください。',
      failed: '通話を接続できませんでした。', callNumber: '{number} に電話', upTo: '最大2分。',
      error: '問題が発生しました。もう一度お試しください。', recording: '録音中',
    },
    ko: {
      leave: '메시지 남기기', calling: '전화 거는 중', allowMic: '통화를 시작하려면 마이크를 허용하세요.',
      connecting: '연결 중…', mute: '음소거', unmute: '음소거 해제', hangUp: '끊기', close: '닫기',
      ended: '통화가 종료되었습니다', noAnswer: '지금은 받을 수 있는 사람이 없습니다.', away: '지금은 응대 가능한 사람이 없습니다.',
      leaveIntro: '짧은 메시지를 남기시면 연락드리겠습니다.', record: '메시지 녹음',
      stop: '중지', again: '다시 녹음', send: '메시지 보내기', sending: '보내는 중…', name: '이름',
      contact: '회신받을 전화번호 또는 이메일', sent: '메시지를 보냈습니다. 연락드리겠습니다.',
      micBlocked: '마이크가 차단되었습니다. 브라우저에서 허용하거나 전화로 연락하세요.',
      failed: '통화를 연결할 수 없습니다.', callNumber: '{number}로 전화', upTo: '최대 2분.',
      error: '문제가 발생했습니다. 다시 시도하세요.', recording: '녹음 중',
    },
    es: {
      leave: 'Dejar un mensaje', calling: 'Llamando a', allowMic: 'Permite el micrófono para empezar la llamada.',
      connecting: 'Conectando…', mute: 'Silenciar', unmute: 'Activar sonido', hangUp: 'Colgar', close: 'Cerrar',
      ended: 'Llamada finalizada', noAnswer: 'Nadie ha podido contestar ahora.', away: 'Ahora mismo no hay nadie disponible.',
      leaveIntro: 'Deja un mensaje breve y te responderán.', record: 'Grabar mensaje',
      stop: 'Detener', again: 'Grabar de nuevo', send: 'Enviar mensaje', sending: 'Enviando…', name: 'Tu nombre',
      contact: 'Teléfono o correo, para devolverte la llamada', sent: 'Mensaje enviado. Te responderán.',
      micBlocked: 'El micrófono está bloqueado. Permítelo en el navegador o llama al número.',
      failed: 'No se pudo conectar la llamada.', callNumber: 'Llamar al {number}', upTo: 'Hasta 2 minutos.',
      error: 'Algo salió mal. Inténtalo de nuevo.', recording: 'Grabando',
    },
    fr: {
      leave: 'Laisser un message', calling: 'Appel vers', allowMic: 'Autorisez le micro pour lancer l’appel.',
      connecting: 'Connexion…', mute: 'Couper le micro', unmute: 'Réactiver le micro', hangUp: 'Raccrocher', close: 'Fermer',
      ended: 'Appel terminé', noAnswer: 'Personne n’a pu répondre pour le moment.', away: 'Personne n’est disponible pour le moment.',
      leaveIntro: 'Laissez un court message et on vous rappellera.', record: 'Enregistrer un message',
      stop: 'Arrêter', again: 'Recommencer', send: 'Envoyer le message', sending: 'Envoi…', name: 'Votre nom',
      contact: 'Téléphone ou e-mail, pour vous rappeler', sent: 'Message envoyé. On vous recontactera.',
      micBlocked: 'Le micro est bloqué. Autorisez-le dans le navigateur, ou appelez le numéro.',
      failed: 'L’appel n’a pas pu aboutir.', callNumber: 'Appeler le {number}', upTo: '2 minutes maximum.',
      error: 'Une erreur s’est produite. Réessayez.', recording: 'Enregistrement',
    },
    de: {
      leave: 'Nachricht hinterlassen', calling: 'Anruf bei', allowMic: 'Erlauben Sie das Mikrofon, um den Anruf zu starten.',
      connecting: 'Verbinden…', mute: 'Stumm', unmute: 'Ton an', hangUp: 'Auflegen', close: 'Schließen',
      ended: 'Anruf beendet', noAnswer: 'Gerade konnte niemand abnehmen.', away: 'Gerade ist niemand frei.',
      leaveIntro: 'Hinterlassen Sie eine kurze Nachricht, wir melden uns.', record: 'Nachricht aufnehmen',
      stop: 'Stopp', again: 'Neu aufnehmen', send: 'Nachricht senden', sending: 'Wird gesendet…', name: 'Ihr Name',
      contact: 'Telefon oder E-Mail für den Rückruf', sent: 'Nachricht gesendet. Wir melden uns.',
      micBlocked: 'Das Mikrofon ist blockiert. Erlauben Sie es im Browser oder rufen Sie die Nummer an.',
      failed: 'Der Anruf konnte nicht verbunden werden.', callNumber: '{number} anrufen', upTo: 'Bis zu 2 Minuten.',
      error: 'Etwas ist schiefgelaufen. Bitte erneut versuchen.', recording: 'Aufnahme',
    },
    it: {
      leave: 'Lascia un messaggio', calling: 'Chiamata a', allowMic: 'Consenti il microfono per iniziare la chiamata.',
      connecting: 'Connessione…', mute: 'Disattiva audio', unmute: 'Riattiva audio', hangUp: 'Riaggancia', close: 'Chiudi',
      ended: 'Chiamata terminata', noAnswer: 'Nessuno ha potuto rispondere ora.', away: 'Al momento nessuno è disponibile.',
      leaveIntro: 'Lascia un breve messaggio e ti ricontatteranno.', record: 'Registra messaggio',
      stop: 'Ferma', again: 'Registra di nuovo', send: 'Invia messaggio', sending: 'Invio…', name: 'Il tuo nome',
      contact: 'Telefono o email, per richiamarti', sent: 'Messaggio inviato. Ti ricontatteranno.',
      micBlocked: 'Il microfono è bloccato. Consentilo nel browser o chiama il numero.',
      failed: 'Impossibile collegare la chiamata.', callNumber: 'Chiama il {number}', upTo: 'Fino a 2 minuti.',
      error: 'Qualcosa è andato storto. Riprova.', recording: 'Registrazione',
    },
    pt: {
      leave: 'Deixar mensagem', calling: 'A ligar para', allowMic: 'Permita o microfone para iniciar a chamada.',
      connecting: 'A ligar…', mute: 'Silenciar', unmute: 'Ativar som', hangUp: 'Desligar', close: 'Fechar',
      ended: 'Chamada terminada', noAnswer: 'Ninguém pôde atender agora.', away: 'Ninguém está disponível agora.',
      leaveIntro: 'Deixe uma mensagem curta e entrarão em contacto.', record: 'Gravar mensagem',
      stop: 'Parar', again: 'Gravar de novo', send: 'Enviar mensagem', sending: 'A enviar…', name: 'O seu nome',
      contact: 'Telefone ou email, para retorno', sent: 'Mensagem enviada. Entrarão em contacto.',
      micBlocked: 'O microfone está bloqueado. Permita-o no navegador ou ligue para o número.',
      failed: 'Não foi possível ligar a chamada.', callNumber: 'Ligar para {number}', upTo: 'Até 2 minutos.',
      error: 'Algo correu mal. Tente de novo.', recording: 'A gravar',
    },
    nl: {
      leave: 'Bericht achterlaten', calling: 'Bellen naar', allowMic: 'Sta de microfoon toe om het gesprek te starten.',
      connecting: 'Verbinden…', mute: 'Dempen', unmute: 'Dempen opheffen', hangUp: 'Ophangen', close: 'Sluiten',
      ended: 'Gesprek beëindigd', noAnswer: 'Er kon nu niemand opnemen.', away: 'Er is nu niemand beschikbaar.',
      leaveIntro: 'Laat een kort bericht achter, dan nemen ze contact op.', record: 'Bericht opnemen',
      stop: 'Stoppen', again: 'Opnieuw opnemen', send: 'Bericht versturen', sending: 'Versturen…', name: 'Je naam',
      contact: 'Telefoon of e-mail, om terug te bellen', sent: 'Bericht verstuurd. Ze nemen contact op.',
      micBlocked: 'De microfoon is geblokkeerd. Sta hem toe in je browser, of bel het nummer.',
      failed: 'Het gesprek kon niet worden verbonden.', callNumber: '{number} bellen', upTo: 'Maximaal 2 minuten.',
      error: 'Er ging iets mis. Probeer het opnieuw.', recording: 'Opnemen',
    },
  };

  function lang() {
    var raw = (script && script.dataset.voiceLang) || document.documentElement.lang || navigator.language || 'en';
    var short = String(raw).toLowerCase().slice(0, 2);
    return WORDS[short] ? short : 'en';
  }

  function t(key, vars) {
    var text = WORDS[lang()][key] || WORDS.en[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { text = text.replace('{' + k + '}', vars[k]); });
    return text;
  }

  /* ----------------------------------------------------------- support */

  var supported = Boolean(
    window.WebSocket && window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia
  );

  /* ------------------------------------------------------------ status */

  var statuses = {};
  var pending = {};

  function keyOf(btn) {
    return (btn.dataset.voiceLine || '').toLowerCase() + '|' + (btn.dataset.voiceTeam === 'support' ? 'support' : 'sales');
  }

  function fetchStatus(key) {
    if (pending[key]) return pending[key];
    var parts = key.split('|');
    pending[key] = fetch(API + '/api/voice/status?line=' + encodeURIComponent(parts[0]) + '&team=' + parts[1], {
      credentials: 'omit',
      cache: 'no-store',
    })
      .then(function (r) { return r.ok ? r.json() : { status: 'off' }; })
      .then(function (d) { statuses[key] = { value: d.status || 'off', at: Date.now() }; })
      .catch(function () { /* keep what we had */ })
      .then(function () { delete pending[key]; paint(); });
    return pending[key];
  }

  function buttons() {
    return Array.prototype.slice.call(document.querySelectorAll(TRIGGER));
  }

  function paint() {
    buttons().forEach(function (btn) {
      if (!supported || !btn.dataset.voiceLine) { btn.hidden = true; return; }
      var s = statuses[keyOf(btn)];
      var value = s ? s.value : 'off';
      var label = btn.querySelector('[data-voice-label]') || btn;
      if (btn.dataset.voiceOpenLabel === undefined) btn.dataset.voiceOpenLabel = label.textContent.trim();
      if (value === 'off') { btn.hidden = true; return; }
      var text = value === 'voicemail' ? btn.dataset.voiceLeave || t('leave') : btn.dataset.voiceOpenLabel;
      // Only when it differs: a write is a DOM change, which the observer
      // below would answer with another paint.
      if (label.textContent !== text) label.textContent = text;
      btn.dataset.voiceState = value;
      btn.hidden = false;
    });
  }

  function refresh(force) {
    if (!supported) return paint();
    var keys = {};
    buttons().forEach(function (btn) { if (btn.dataset.voiceLine) keys[keyOf(btn)] = true; });
    Object.keys(keys).forEach(function (key) {
      var s = statuses[key];
      if (force || !s || Date.now() - s.at > POLL_MS - 1000) fetchStatus(key);
    });
    paint();
  }

  /* ------------------------------------------------------------- panel */

  var STYLE =
    '.rsv{--rsv-bg:#fff;--rsv-fg:#111;--rsv-muted:#666;--rsv-line:#e5e5e5;--rsv-soft:#f4f4f5;--rsv-accent:' + (ACCENT || '#111') + ';--rsv-on-accent:#fff;' +
    'position:fixed;right:16px;bottom:16px;z-index:2147483000;width:320px;max-width:calc(100vw - 32px);box-sizing:border-box;' +
    'background:var(--rsv-bg);color:var(--rsv-fg);border:1px solid var(--rsv-line);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.18);' +
    'font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px;display:grid;gap:12px}' +
    '.rsv[data-dark]{--rsv-bg:#18181b;--rsv-fg:#fafafa;--rsv-muted:#a1a1aa;--rsv-line:#2e2e33;--rsv-soft:#232327;' + (ACCENT ? '' : '--rsv-accent:#fafafa;--rsv-on-accent:#111;') + '}' +
    '.rsv *{box-sizing:border-box}' +
    '.rsv-head{display:flex;align-items:center;gap:10px}' +
    '.rsv-dot{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:var(--rsv-soft);flex:none}' +
    '.rsv-dot svg{width:20px;height:20px}' +
    '.rsv-ring .rsv-dot{animation:rsv-pulse 1.4s ease-in-out infinite}' +
    '@keyframes rsv-pulse{0%,100%{box-shadow:0 0 0 0 rgba(127,127,127,.35)}50%{box-shadow:0 0 0 10px rgba(127,127,127,0)}}' +
    '@media (prefers-reduced-motion:reduce){.rsv-ring .rsv-dot{animation:none}}' +
    '.rsv-title{font-weight:600;font-size:15px;margin:0}' +
    '.rsv-sub{color:var(--rsv-muted);font-size:13px;margin:0}' +
    '.rsv-x{margin-left:auto;background:none;border:0;color:var(--rsv-muted);cursor:pointer;padding:4px;border-radius:6px;font:inherit;line-height:0}' +
    '.rsv-x:hover{color:var(--rsv-fg)}' +
    '.rsv-row{display:flex;gap:8px;flex-wrap:wrap}' +
    '.rsv-btn{flex:1;min-height:40px;padding:8px 12px;border-radius:10px;border:1px solid var(--rsv-line);background:var(--rsv-bg);color:var(--rsv-fg);font:inherit;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;text-decoration:none;white-space:nowrap}' +
    '.rsv-btn:hover{background:var(--rsv-soft)}' +
    '.rsv-btn:focus-visible,.rsv-x:focus-visible,.rsv-in:focus-visible{outline:2px solid var(--rsv-accent);outline-offset:2px}' +
    '.rsv-main{background:var(--rsv-accent);border-color:var(--rsv-accent);color:var(--rsv-on-accent)}' +
    '.rsv-main:hover{background:var(--rsv-accent);opacity:.9}' +
    '.rsv-end{background:#dc2626;border-color:#dc2626;color:#fff}' +
    '.rsv-end:hover{background:#b91c1c}' +
    '.rsv-btn[disabled]{opacity:.6;cursor:default}' +
    '.rsv-in{width:100%;min-height:38px;padding:8px 10px;border-radius:8px;border:1px solid var(--rsv-line);background:var(--rsv-bg);color:var(--rsv-fg);font:inherit}' +
    '.rsv-lbl{display:grid;gap:4px;font-size:13px;color:var(--rsv-muted)}' +
    '.rsv audio{width:100%;height:36px}' +
    '.rsv-err{color:#dc2626;font-size:13px;margin:0}' +
    '.rsv-time{font-variant-numeric:tabular-nums}' +
    /* On a phone: a sheet along the bottom, the page dimmed behind it, buttons big enough for a thumb. */
    '@media (max-width:600px){.rsv{left:0;right:0;bottom:0;width:auto;max-width:none;border-radius:18px 18px 0 0;border-bottom:0;' +
    'padding:20px 18px calc(20px + env(safe-area-inset-bottom));gap:16px;font-size:15px;box-shadow:0 0 0 100vmax rgba(0,0,0,.45)}' +
    '.rsv-dot{width:52px;height:52px}.rsv-dot svg{width:24px;height:24px}.rsv-title{font-size:17px}.rsv-sub{font-size:14px}' +
    '.rsv-btn{min-height:50px;border-radius:14px;font-size:16px}.rsv-in{min-height:46px;font-size:16px}.rsv audio{height:44px}}';

  var ICON = {
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  };

  var panel = null;

  function isDark() {
    var root = document.documentElement;
    if (root.classList.contains('dark') || root.dataset.theme === 'dark') return true;
    if (root.classList.contains('light') || root.dataset.theme === 'light') return false;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function openPanel() {
    if (!document.getElementById('rsv-style')) {
      document.head.appendChild(el('style', { id: 'rsv-style', text: STYLE }));
    }
    if (!panel) {
      panel = el('div', { class: 'rsv', role: 'dialog', 'aria-live': 'polite' });
      document.body.appendChild(panel);
    }
    if (isDark()) panel.setAttribute('data-dark', '');
    else panel.removeAttribute('data-dark');
    return panel;
  }

  function closePanel() {
    if (panel) panel.remove();
    panel = null;
  }

  /** Draws one state: an icon, a title and line under it, then the body. */
  function draw(opts) {
    var p = openPanel();
    p.className = 'rsv' + (opts.ring ? ' rsv-ring' : '');
    p.innerHTML = '';
    var head = el('div', { class: 'rsv-head' }, [
      el('span', { class: 'rsv-dot', html: opts.icon || ICON.phone }),
      el('div', {}, [
        el('p', { class: 'rsv-title', text: opts.title }),
        opts.sub ? el('p', { class: 'rsv-sub' + (opts.timer ? ' rsv-time' : ''), text: opts.sub }) : null,
      ]),
      opts.closable ? el('button', { class: 'rsv-x', type: 'button', 'aria-label': t('close'), html: ICON.x, onclick: finish }) : null,
    ]);
    p.appendChild(head);
    (opts.body || []).forEach(function (n) { if (n) p.appendChild(n); });
    var focus = p.querySelector('[data-focus]') || p.querySelector('button');
    if (focus) focus.focus({ preventScroll: true });
    return p;
  }

  function button(text, cls, onclick, extra) {
    var attrs = { class: 'rsv-btn ' + (cls || ''), type: 'button', text: text, onclick: onclick };
    Object.keys(extra || {}).forEach(function (k) { attrs[k] = extra[k]; });
    return el('button', attrs);
  }

  function telLink(btn) {
    var number = btn && btn.dataset.voicePhone;
    if (!number) return null;
    return el('a', { class: 'rsv-btn', href: 'tel:' + number.replace(/[^\d+]/g, ''), text: t('callNumber', { number: number }) });
  }

  /* -------------------------------------------------------------- call */

  var call = null;

  function clock(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /** Thailand's ringback: 425 Hz, one second on, four off. */
  function ringback() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return function () {};
    var ctx = new Ctx();
    var gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    var osc = ctx.createOscillator();
    osc.frequency.value = 425;
    osc.connect(gain);
    osc.start();
    var on = true;
    function tick() {
      gain.gain.setTargetAtTime(on ? 0.06 : 0, ctx.currentTime, 0.02);
      timer = setTimeout(tick, on ? 1000 : 4000);
      on = !on;
    }
    var timer = setTimeout(tick, 0);
    return function stop() {
      clearTimeout(timer);
      try { osc.stop(); ctx.close(); } catch (e) { /* already closed */ }
    };
  }

  function wsUrl() {
    return API.replace(/^http/, 'ws') + '/api/voice/ws?as=caller';
  }

  function start(btn) {
    if (call) return;
    call = { btn: btn, stream: null, ws: null, pc: null, queued: [], stopRing: null, timer: null, id: null, muted: false };
    draw({ title: t('calling') + ' …', sub: t('allowMic'), icon: ICON.mic, closable: true });

    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then(function (stream) {
        if (!call) return stream.getTracks().forEach(function (tr) { tr.stop(); });
        call.stream = stream;
        connect();
      })
      .catch(function () {
        if (!call) return;
        var c = call;
        cleanup();
        draw({
          title: t('failed'),
          sub: t('micBlocked'),
          closable: true,
          body: [el('div', { class: 'rsv-row' }, [telLink(c.btn), button(t('close'), '', finish)])],
        });
      });
  }

  function connect() {
    var c = call;
    var label = (c.btn.dataset.voiceOpenLabel || '').trim();
    draw({ title: label || t('calling'), sub: t('connecting'), ring: true, body: [hangupRow()] });

    var ws = new WebSocket(wsUrl());
    c.ws = ws;
    ws.onopen = function () {
      ws.send(JSON.stringify({
        t: 'call',
        line: c.btn.dataset.voiceLine,
        team: c.btn.dataset.voiceTeam || 'sales',
        name: c.btn.dataset.voiceCaller || window.VOICE_CALLER || '',
        page: location.href,
      }));
    };
    ws.onmessage = function (e) {
      var msg;
      try { msg = JSON.parse(e.data); } catch (err) { return; }
      if (call !== c) return;
      if (msg.t === 'ringing') {
        c.id = msg.callId;
        if (!c.stopRing) c.stopRing = ringback();
        draw({ title: label || t('calling'), sub: t('calling') + ' …', ring: true, body: [hangupRow()] });
      } else if (msg.t === 'answered') {
        stopRing(c);
        talk(c, msg);
      } else if (msg.t === 'signal') {
        onSignal(c, msg.data);
      } else if (msg.t === 'noanswer') {
        c.id = msg.callId;
        stopRing(c);
        voicemail(c, msg.why);
      } else if (msg.t === 'ended') {
        ended(c);
      } else if (msg.t === 'error') {
        failed(c);
      }
    };
    ws.onclose = function () {
      if (call === c && !c.recording && !c.left) failed(c);
    };
  }

  function stopRing(c) {
    if (c.stopRing) c.stopRing();
    c.stopRing = null;
  }

  function hangupRow() {
    return el('div', { class: 'rsv-row' }, [button(t('hangUp'), 'rsv-end', hangup, { 'data-focus': '' })]);
  }

  function hangup() {
    if (call && call.ws && call.ws.readyState === 1) call.ws.send(JSON.stringify({ t: 'hangup' }));
    var c = call;
    if (c) c.left = true;
    cleanup();
    closePanel();
  }

  function talk(c, msg) {
    var pc = new RTCPeerConnection({ iceServers: msg.ice || [] });
    c.pc = pc;
    c.stream.getTracks().forEach(function (tr) { pc.addTrack(tr, c.stream); });
    var audio = el('audio', { autoplay: '' });
    audio.style.display = 'none';
    document.body.appendChild(audio);
    c.audio = audio;
    pc.ontrack = function (e) { audio.srcObject = e.streams[0]; audio.play().catch(function () {}); };
    pc.onicecandidate = function (e) {
      if (e.candidate) send(c, { t: 'signal', data: { candidate: e.candidate } });
    };
    pc.onconnectionstatechange = function () {
      if (pc.connectionState === 'connected' && !c.since) {
        c.since = Date.now();
        tickTalk(c, msg.name);
      } else if (pc.connectionState === 'failed') {
        send(c, { t: 'hangup' });
        failed(c);
      }
    };
    draw({ title: msg.name || '', sub: t('connecting'), body: [talkRow(c)] });
    pc.createOffer()
      .then(function (offer) { return pc.setLocalDescription(offer); })
      .then(function () { send(c, { t: 'signal', data: { sdp: pc.localDescription } }); })
      .catch(function () { failed(c); });
  }

  function talkRow(c) {
    var mute = button(c.muted ? t('unmute') : t('mute'), '', function () {
      c.muted = !c.muted;
      c.stream.getAudioTracks().forEach(function (tr) { tr.enabled = !c.muted; });
      mute.textContent = c.muted ? t('unmute') : t('mute');
      mute.setAttribute('aria-pressed', String(c.muted));
    }, { 'aria-pressed': String(c.muted) });
    return el('div', { class: 'rsv-row' }, [mute, button(t('hangUp'), 'rsv-end', hangup, { 'data-focus': '' })]);
  }

  function tickTalk(c, name) {
    draw({ title: name || '', sub: clock(0), timer: true, body: [talkRow(c)] });
    c.timer = setInterval(function () {
      var sub = panel && panel.querySelector('.rsv-sub');
      if (sub) sub.textContent = clock(Math.round((Date.now() - c.since) / 1000));
    }, 1000);
  }

  function onSignal(c, data) {
    if (!c.pc || !data) return;
    if (data.sdp) {
      c.pc.setRemoteDescription(data.sdp).then(function () {
        c.queued.forEach(function (cand) { c.pc.addIceCandidate(cand).catch(function () {}); });
        c.queued = [];
      }).catch(function () { failed(c); });
    } else if (data.candidate) {
      if (c.pc.remoteDescription) c.pc.addIceCandidate(data.candidate).catch(function () {});
      else c.queued.push(data.candidate);
    }
  }

  function send(c, msg) {
    if (c.ws && c.ws.readyState === 1) c.ws.send(JSON.stringify(msg));
  }

  function ended(c) {
    var seconds = c.since ? Math.round((Date.now() - c.since) / 1000) : 0;
    c.left = true;
    cleanup();
    draw({ title: t('ended'), sub: seconds ? clock(seconds) : '', closable: true });
    setTimeout(function () { if (!call) closePanel(); }, 4000);
  }

  function failed(c) {
    if (call !== c) return;
    c.left = true;
    cleanup();
    draw({
      title: t('failed'),
      closable: true,
      body: [el('div', { class: 'rsv-row' }, [telLink(c.btn), button(t('close'), '', finish)])],
    });
  }

  /** Ends everything but the panel. The microphone goes off here. */
  function cleanup() {
    var c = call;
    call = null;
    if (!c) return;
    stopRing(c);
    clearInterval(c.timer);
    if (c.recorder && c.recorder.state === 'recording') {
      try { c.recorder.stop(); } catch (e) { /* stopped */ }
    }
    if (c.pc) try { c.pc.close(); } catch (e) { /* closed */ }
    if (c.ws && c.ws.readyState <= 1) try { c.ws.close(); } catch (e) { /* closed */ }
    if (c.stream) c.stream.getTracks().forEach(function (tr) { tr.stop(); });
    if (c.audio) c.audio.remove();
    refresh(true);
  }

  function finish() {
    if (call && call.ws && call.ws.readyState === 1 && !call.left) call.ws.send(JSON.stringify({ t: 'hangup' }));
    cleanup();
    closePanel();
  }

  /* --------------------------------------------------------- voicemail */

  function recorderType() {
    if (!window.MediaRecorder) return null;
    var types = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];
    for (var i = 0; i < types.length; i++) if (MediaRecorder.isTypeSupported(types[i])) return types[i];
    return '';
  }

  function voicemail(c, why) {
    c.recording = true;
    if (c.ws) try { c.ws.close(); } catch (e) { /* closed */ }
    var type = recorderType();
    if (type === null) {
      c.left = true;
      cleanup();
      return draw({
        title: why === 'timeout' || why === 'declined' ? t('noAnswer') : t('away'),
        closable: true,
        body: [el('div', { class: 'rsv-row' }, [telLink(c.btn), button(t('close'), '', finish)])],
      });
    }
    c.mime = type;
    var title = why === 'timeout' || why === 'declined' ? t('noAnswer') : t('away');
    draw({
      title: title,
      sub: t('leaveIntro') + ' ' + t('upTo'),
      icon: ICON.mic,
      closable: true,
      body: [el('div', { class: 'rsv-row' }, [button(t('record'), 'rsv-main', function () { record(c, title); }, { 'data-focus': '' })])],
    });
  }

  function record(c, title) {
    var chunks = [];
    var rec;
    try {
      rec = new MediaRecorder(c.stream, c.mime ? { mimeType: c.mime, audioBitsPerSecond: 24000 } : undefined);
    } catch (e) {
      rec = new MediaRecorder(c.stream);
    }
    c.recorder = rec;
    var began = Date.now();
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = function () {
      clearInterval(c.timer);
      if (call !== c) return;
      var seconds = Math.max(1, Math.round((Date.now() - began) / 1000));
      var blob = new Blob(chunks, { type: (rec.mimeType || c.mime || 'audio/webm').split(';')[0] });
      review(c, title, blob, seconds);
    };
    rec.start(1000);
    draw({
      title: t('recording'),
      sub: clock(0) + ' / ' + clock(MAX_SECONDS),
      timer: true,
      icon: ICON.mic,
      ring: true,
      body: [el('div', { class: 'rsv-row' }, [button(t('stop'), 'rsv-main', function () { rec.stop(); }, { 'data-focus': '' })])],
    });
    c.timer = setInterval(function () {
      var s = Math.round((Date.now() - began) / 1000);
      var sub = panel && panel.querySelector('.rsv-sub');
      if (sub) sub.textContent = clock(s) + ' / ' + clock(MAX_SECONDS);
      if (s >= MAX_SECONDS && rec.state === 'recording') rec.stop();
    }, 500);
  }

  function review(c, title, blob, seconds) {
    var url = URL.createObjectURL(blob);
    var name = el('input', { class: 'rsv-in', type: 'text', maxlength: '80', autocomplete: 'name' });
    name.value = c.btn.dataset.voiceCaller || window.VOICE_CALLER || '';
    var contact = el('input', { class: 'rsv-in', type: 'text', maxlength: '120', autocomplete: 'tel' });
    var err = el('p', { class: 'rsv-err', role: 'alert' });
    err.hidden = true;
    var sendBtn = button(t('send'), 'rsv-main', function () {
      sendBtn.disabled = true;
      sendBtn.textContent = t('sending');
      err.hidden = true;
      toBase64(blob).then(function (audio) {
        return fetch(API + '/api/voice/voicemail', {
          method: 'POST',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callId: c.id, mime: blob.type, audio: audio, seconds: seconds, name: name.value, contact: contact.value,
          }),
        });
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) throw new Error(d.error || t('error'));
        });
      }).then(function () {
        URL.revokeObjectURL(url);
        c.left = true;
        cleanup();
        draw({ title: t('sent'), closable: true, body: [el('div', { class: 'rsv-row' }, [button(t('close'), '', finish, { 'data-focus': '' })])] });
      }).catch(function (e) {
        err.textContent = e.message || t('error');
        err.hidden = false;
        sendBtn.disabled = false;
        sendBtn.textContent = t('send');
      });
    }, { 'data-focus': '' });

    draw({
      title: title,
      sub: clock(seconds),
      icon: ICON.mic,
      closable: true,
      body: [
        el('audio', { controls: '', src: url, preload: 'metadata' }),
        el('label', { class: 'rsv-lbl' }, [document.createTextNode(t('name')), name]),
        el('label', { class: 'rsv-lbl' }, [document.createTextNode(t('contact')), contact]),
        err,
        el('div', { class: 'rsv-row' }, [
          button(t('again'), '', function () { URL.revokeObjectURL(url); record(c, title); }),
          sendBtn,
        ]),
      ],
    });
  }

  function toBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(',')[1] || ''); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /* ------------------------------------------------------------ wiring */

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest(TRIGGER);
    if (!btn || btn.hidden || !supported) return;
    e.preventDefault();
    start(btn);
  });

  var queued = null;
  new MutationObserver(function (changes) {
    // The panel's own clock ticking is not a new button.
    if (changes.every(function (m) { return panel && panel.contains(m.target); })) return;
    clearTimeout(queued);
    queued = setTimeout(function () {
      var fresh = buttons().some(function (b) { return !statuses[keyOf(b)] && b.dataset.voiceLine; });
      if (fresh) refresh(); else paint();
    }, 150);
  }).observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') refresh();
  });
  setInterval(function () { if (document.visibilityState === 'visible' && !call) refresh(); }, POLL_MS);

  window.ReviewslipVoice = { refresh: function () { refresh(true); } };
  refresh(true);
})();
