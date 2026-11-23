/*
 * Reviewslip call buttons: a guest presses Call and talks to the venue's desk,
 * or to Reviewslip's Sales or Support, in the browser. When nobody is free
 * they write instead: a conversation the line answers on the dashboard and
 * the phone, read here or from the link in the email of the answer.
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
 * "voicemail" relabels it to write a message, "off" keeps it hidden — so a
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

  /* ------------------------------------------------------------- words */

  var WORDS = {
    en: {
      leave: 'Leave a message', calling: 'Calling', allowMic: 'Allow the microphone to start the call.',
      connecting: 'Connecting…', mute: 'Mute', unmute: 'Unmute', hangUp: 'Hang up', close: 'Close',
      ended: 'Call ended', noAnswer: 'Nobody could answer just now.', away: 'Nobody is free right now.',
      send: 'Send message', sending: 'Sending…', name: 'Your name',
      micBlocked: 'The microphone is blocked. Allow it in your browser, or call the number instead.',
      failed: 'The call could not connect.', callNumber: 'Call {number}',
      error: 'Something went wrong. Try again.',
      writeIntro: 'Write to them instead and they will answer here.', message: 'Message', email: 'Email, so the answer reaches you (optional)', you: 'You', waitingNote: 'Sent. Their answer appears here, and by email if you gave one.', reply: 'Write a reply', closedNote: 'This conversation is closed. Write again to open it.', gone: 'This conversation is no longer here.',
    },
    th: {
      leave: 'ฝากข้อความ', calling: 'กำลังโทรหา', allowMic: 'อนุญาตให้ใช้ไมโครโฟนเพื่อเริ่มโทร',
      connecting: 'กำลังเชื่อมต่อ…', mute: 'ปิดเสียง', unmute: 'เปิดเสียง', hangUp: 'วางสาย', close: 'ปิด',
      ended: 'วางสายแล้ว', noAnswer: 'ขณะนี้ไม่มีผู้รับสาย', away: 'ขณะนี้ไม่มีผู้ว่างรับสาย',
      send: 'ส่งข้อความ', sending: 'กำลังส่ง…', name: 'ชื่อของคุณ',
      micBlocked: 'ไมโครโฟนถูกบล็อก โปรดอนุญาตในเบราว์เซอร์ หรือโทรตามเบอร์แทน',
      failed: 'ไม่สามารถเชื่อมต่อสายได้', callNumber: 'โทร {number}',
      error: 'เกิดข้อผิดพลาด โปรดลองอีกครั้ง',
      writeIntro: 'เขียนข้อความถึงทางเราแทน แล้วจะได้รับคำตอบที่นี่', message: 'ข้อความ', email: 'อีเมล เพื่อรับคำตอบ (ไม่บังคับ)', you: 'คุณ', waitingNote: 'ส่งแล้ว คำตอบจะแสดงที่นี่ และทางอีเมลหากคุณให้ไว้', reply: 'เขียนตอบกลับ', closedNote: 'การสนทนานี้ปิดแล้ว เขียนอีกครั้งเพื่อเปิดใหม่', gone: 'ไม่พบการสนทนานี้แล้ว',
    },
    zh: {
      leave: '留言', calling: '正在呼叫', allowMic: '请允许使用麦克风以开始通话。',
      connecting: '正在连接…', mute: '静音', unmute: '取消静音', hangUp: '挂断', close: '关闭',
      ended: '通话已结束', noAnswer: '暂时无人接听。', away: '目前无人有空。',
      send: '发送留言', sending: '正在发送…', name: '您的姓名',
      micBlocked: '麦克风已被阻止。请在浏览器中允许，或直接拨打电话。',
      failed: '通话无法接通。', callNumber: '拨打 {number}',
      error: '出了点问题，请重试。',
      writeIntro: '请改为留言，他们会在这里回复。', message: '留言', email: '电子邮箱，以便收到回复（选填）', you: '您', waitingNote: '已发送。回复会显示在这里，若留了邮箱也会发到邮箱。', reply: '写回复', closedNote: '此对话已关闭。再次留言即可重新打开。', gone: '此对话已不存在。',
    },
    ja: {
      leave: 'メッセージを残す', calling: '発信中', allowMic: '通話を始めるにはマイクを許可してください。',
      connecting: '接続中…', mute: 'ミュート', unmute: 'ミュート解除', hangUp: '切る', close: '閉じる',
      ended: '通話が終了しました', noAnswer: 'ただいま応答できる者がおりません。', away: '現在、対応できる者がおりません。',
      send: '送信', sending: '送信中…', name: 'お名前',
      micBlocked: 'マイクがブロックされています。ブラウザで許可するか、電話でおかけください。',
      failed: '通話を接続できませんでした。', callNumber: '{number} に電話',
      error: '問題が発生しました。もう一度お試しください。',
      writeIntro: '代わりにメッセージを送ってください。ここに返信が届きます。', message: 'メッセージ', email: 'メールアドレス（返信の受け取り用・任意）', you: 'あなた', waitingNote: '送信しました。返信はここに表示され、メールを入力した場合はメールでも届きます。', reply: '返信を書く', closedNote: 'この会話は終了しています。もう一度書くと再開します。', gone: 'この会話は見つかりません。',
    },
    ko: {
      leave: '메시지 남기기', calling: '전화 거는 중', allowMic: '통화를 시작하려면 마이크를 허용하세요.',
      connecting: '연결 중…', mute: '음소거', unmute: '음소거 해제', hangUp: '끊기', close: '닫기',
      ended: '통화가 종료되었습니다', noAnswer: '지금은 받을 수 있는 사람이 없습니다.', away: '지금은 응대 가능한 사람이 없습니다.',
      send: '메시지 보내기', sending: '보내는 중…', name: '이름',
      micBlocked: '마이크가 차단되었습니다. 브라우저에서 허용하거나 전화로 연락하세요.',
      failed: '통화를 연결할 수 없습니다.', callNumber: '{number}로 전화',
      error: '문제가 발생했습니다. 다시 시도하세요.',
      writeIntro: '대신 메시지를 남기시면 여기에서 답변드립니다.', message: '메시지', email: '답변 받을 이메일 (선택)', you: '나', waitingNote: '보냈습니다. 답변은 여기에 표시되며, 이메일을 남기셨다면 이메일로도 보내드립니다.', reply: '답장 쓰기', closedNote: '이 대화는 종료되었습니다. 다시 쓰면 다시 열립니다.', gone: '이 대화를 더 이상 찾을 수 없습니다.',
    },
    es: {
      leave: 'Dejar un mensaje', calling: 'Llamando a', allowMic: 'Permite el micrófono para empezar la llamada.',
      connecting: 'Conectando…', mute: 'Silenciar', unmute: 'Activar sonido', hangUp: 'Colgar', close: 'Cerrar',
      ended: 'Llamada finalizada', noAnswer: 'Nadie ha podido contestar ahora.', away: 'Ahora mismo no hay nadie disponible.',
      send: 'Enviar mensaje', sending: 'Enviando…', name: 'Tu nombre',
      micBlocked: 'El micrófono está bloqueado. Permítelo en el navegador o llama al número.',
      failed: 'No se pudo conectar la llamada.', callNumber: 'Llamar al {number}',
      error: 'Algo salió mal. Inténtalo de nuevo.',
      writeIntro: 'Escríbeles y te responderán aquí.', message: 'Mensaje', email: 'Correo, para recibir la respuesta (opcional)', you: 'Tú', waitingNote: 'Enviado. La respuesta aparecerá aquí, y por correo si lo has dejado.', reply: 'Escribe una respuesta', closedNote: 'Esta conversación está cerrada. Escribe de nuevo para reabrirla.', gone: 'Esta conversación ya no está disponible.',
    },
    fr: {
      leave: 'Laisser un message', calling: 'Appel vers', allowMic: 'Autorisez le micro pour lancer l’appel.',
      connecting: 'Connexion…', mute: 'Couper le micro', unmute: 'Réactiver le micro', hangUp: 'Raccrocher', close: 'Fermer',
      ended: 'Appel terminé', noAnswer: 'Personne n’a pu répondre pour le moment.', away: 'Personne n’est disponible pour le moment.',
      send: 'Envoyer le message', sending: 'Envoi…', name: 'Votre nom',
      micBlocked: 'Le micro est bloqué. Autorisez-le dans le navigateur, ou appelez le numéro.',
      failed: 'L’appel n’a pas pu aboutir.', callNumber: 'Appeler le {number}',
      error: 'Une erreur s’est produite. Réessayez.',
      writeIntro: 'Écrivez-leur et ils vous répondront ici.', message: 'Message', email: 'E-mail, pour recevoir la réponse (facultatif)', you: 'Vous', waitingNote: 'Envoyé. La réponse s’affichera ici, et par e-mail si vous en avez laissé un.', reply: 'Écrire une réponse', closedNote: 'Cette conversation est fermée. Écrivez à nouveau pour la rouvrir.', gone: 'Cette conversation n’est plus disponible.',
    },
    de: {
      leave: 'Nachricht hinterlassen', calling: 'Anruf bei', allowMic: 'Erlauben Sie das Mikrofon, um den Anruf zu starten.',
      connecting: 'Verbinden…', mute: 'Stumm', unmute: 'Ton an', hangUp: 'Auflegen', close: 'Schließen',
      ended: 'Anruf beendet', noAnswer: 'Gerade konnte niemand abnehmen.', away: 'Gerade ist niemand frei.',
      send: 'Nachricht senden', sending: 'Wird gesendet…', name: 'Ihr Name',
      micBlocked: 'Das Mikrofon ist blockiert. Erlauben Sie es im Browser oder rufen Sie die Nummer an.',
      failed: 'Der Anruf konnte nicht verbunden werden.', callNumber: '{number} anrufen',
      error: 'Etwas ist schiefgelaufen. Bitte erneut versuchen.',
      writeIntro: 'Schreiben Sie stattdessen, die Antwort erscheint hier.', message: 'Nachricht', email: 'E-Mail für die Antwort (optional)', you: 'Sie', waitingNote: 'Gesendet. Die Antwort erscheint hier, und per E-Mail, falls angegeben.', reply: 'Antwort schreiben', closedNote: 'Diese Unterhaltung ist geschlossen. Schreiben Sie erneut, um sie wieder zu öffnen.', gone: 'Diese Unterhaltung gibt es nicht mehr.',
    },
    it: {
      leave: 'Lascia un messaggio', calling: 'Chiamata a', allowMic: 'Consenti il microfono per iniziare la chiamata.',
      connecting: 'Connessione…', mute: 'Disattiva audio', unmute: 'Riattiva audio', hangUp: 'Riaggancia', close: 'Chiudi',
      ended: 'Chiamata terminata', noAnswer: 'Nessuno ha potuto rispondere ora.', away: 'Al momento nessuno è disponibile.',
      send: 'Invia messaggio', sending: 'Invio…', name: 'Il tuo nome',
      micBlocked: 'Il microfono è bloccato. Consentilo nel browser o chiama il numero.',
      failed: 'Impossibile collegare la chiamata.', callNumber: 'Chiama il {number}',
      error: 'Qualcosa è andato storto. Riprova.',
      writeIntro: 'Scrivi loro e ti risponderanno qui.', message: 'Messaggio', email: 'Email, per ricevere la risposta (facoltativa)', you: 'Tu', waitingNote: 'Inviato. La risposta apparirà qui, e via email se l’hai indicata.', reply: 'Scrivi una risposta', closedNote: 'Questa conversazione è chiusa. Scrivi di nuovo per riaprirla.', gone: 'Questa conversazione non è più disponibile.',
    },
    pt: {
      leave: 'Deixar mensagem', calling: 'A ligar para', allowMic: 'Permita o microfone para iniciar a chamada.',
      connecting: 'A ligar…', mute: 'Silenciar', unmute: 'Ativar som', hangUp: 'Desligar', close: 'Fechar',
      ended: 'Chamada terminada', noAnswer: 'Ninguém pôde atender agora.', away: 'Ninguém está disponível agora.',
      send: 'Enviar mensagem', sending: 'A enviar…', name: 'O seu nome',
      micBlocked: 'O microfone está bloqueado. Permita-o no navegador ou ligue para o número.',
      failed: 'Não foi possível ligar a chamada.', callNumber: 'Ligar para {number}',
      error: 'Algo correu mal. Tente de novo.',
      writeIntro: 'Escreva-lhes e responderão aqui.', message: 'Mensagem', email: 'Email, para receber a resposta (opcional)', you: 'Você', waitingNote: 'Enviado. A resposta aparece aqui, e por email se o indicou.', reply: 'Escreva uma resposta', closedNote: 'Esta conversa está fechada. Escreva de novo para a reabrir.', gone: 'Esta conversa já não está disponível.',
    },
    nl: {
      leave: 'Bericht achterlaten', calling: 'Bellen naar', allowMic: 'Sta de microfoon toe om het gesprek te starten.',
      connecting: 'Verbinden…', mute: 'Dempen', unmute: 'Dempen opheffen', hangUp: 'Ophangen', close: 'Sluiten',
      ended: 'Gesprek beëindigd', noAnswer: 'Er kon nu niemand opnemen.', away: 'Er is nu niemand beschikbaar.',
      send: 'Bericht versturen', sending: 'Versturen…', name: 'Je naam',
      micBlocked: 'De microfoon is geblokkeerd. Sta hem toe in je browser, of bel het nummer.',
      failed: 'Het gesprek kon niet worden verbonden.', callNumber: '{number} bellen',
      error: 'Er ging iets mis. Probeer het opnieuw.',
      writeIntro: 'Schrijf ze en ze antwoorden hier.', message: 'Bericht', email: 'E-mail, voor het antwoord (optioneel)', you: 'Jij', waitingNote: 'Verzonden. Het antwoord verschijnt hier, en per e-mail als je die hebt opgegeven.', reply: 'Schrijf een antwoord', closedNote: 'Dit gesprek is gesloten. Schrijf opnieuw om het te heropenen.', gone: 'Dit gesprek is er niet meer.',
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
    '.rsv-area{min-height:72px;resize:vertical;line-height:1.45}' +
    '.rsv-msgs{display:grid;gap:8px;max-height:min(320px,45vh);overflow-y:auto;overscroll-behavior:contain;padding:2px}' +
    '.rsv-msg{display:grid;gap:2px;max-width:88%;justify-self:start;padding:8px 10px;border-radius:10px;background:var(--rsv-soft)}' +
    '.rsv-me{justify-self:end;background:var(--rsv-accent);color:var(--rsv-on-accent)}' +
    '.rsv-who{font-size:12px;opacity:.75}' +
    '.rsv-said{white-space:pre-wrap;overflow-wrap:anywhere}' +
    '.rsv-err{color:#dc2626;font-size:13px;margin:0}' +
    '.rsv-time{font-variant-numeric:tabular-nums}' +
    /* On a phone: a sheet along the bottom, the page dimmed behind it, buttons big enough for a thumb. */
    '@media (max-width:600px){.rsv{left:0;right:0;bottom:0;width:auto;max-width:none;border-radius:18px 18px 0 0;border-bottom:0;' +
    'padding:20px 18px calc(20px + env(safe-area-inset-bottom));gap:16px;font-size:15px;box-shadow:0 0 0 100vmax rgba(0,0,0,.45)}' +
    '.rsv-dot{width:52px;height:52px}.rsv-dot svg{width:24px;height:24px}.rsv-title{font-size:17px}.rsv-sub{font-size:14px}' +
    '.rsv-btn{min-height:50px;border-radius:14px;font-size:16px}.rsv-in{min-height:46px;font-size:16px}}';

  var ICON = {
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
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
    stopChat();
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
        // Nobody could take it: write to them instead.
        var b = c.btn;
        c.left = true;
        cleanup();
        writeTo(b, msg.why || 'away');
      } else if (msg.t === 'ended') {
        ended(c);
      } else if (msg.t === 'error') {
        failed(c);
      }
    };
    ws.onclose = function () {
      if (call === c && !c.left) failed(c);
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

  /* ------------------------------------------------- write instead of call */

  // A conversation the guest started on a line: its key, kept in this browser
  // so pressing the button again opens it. The server keeps only a hash.
  var CHAT_POLL_MS = 8000;
  var chat = null;

  function storedToken(key) {
    try { return localStorage.getItem('rsv-chat:' + key) || ''; } catch (e) { return ''; }
  }

  function storeToken(key, token) {
    try {
      if (token) localStorage.setItem('rsv-chat:' + key, token);
      else localStorage.removeItem('rsv-chat:' + key);
    } catch (e) { /* storage off: the emailed link still opens it */ }
  }

  function stopChat() {
    if (chat) clearTimeout(chat.timer);
    chat = null;
  }

  function api(path, opts) {
    return fetch(API + '/api/voice' + path, Object.assign({ credentials: 'omit', cache: 'no-store' }, opts || {}))
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) {
            var err = new Error(d.error || t('error'));
            err.status = r.status;
            throw err;
          }
          return d;
        });
      });
  }

  function post(path, body) {
    return api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  /**
   * Nobody can answer (the line said so, or the call rang out): write to
   * them instead. A conversation already going on this line opens instead.
   */
  function writeTo(btn, why) {
    var key = keyOf(btn);
    var token = storedToken(key);
    if (token) return openThread(token, key, btn);
    compose(btn, why);
  }

  function compose(btn, why) {
    stopChat();
    var key = keyOf(btn);
    var title = why === 'timeout' || why === 'declined' ? t('noAnswer') : why ? t('away') : btn.dataset.voiceLeave || t('leave');
    var name = el('input', { class: 'rsv-in', type: 'text', maxlength: '80', autocomplete: 'name' });
    name.value = btn.dataset.voiceCaller || window.VOICE_CALLER || '';
    var email = el('input', { class: 'rsv-in', type: 'email', maxlength: '160', autocomplete: 'email' });
    var body = el('textarea', { class: 'rsv-in rsv-area', maxlength: '2000', rows: '4' });
    var err = el('p', { class: 'rsv-err', role: 'alert' });
    err.hidden = true;
    var sendBtn = button(t('send'), 'rsv-main', function () {
      sendBtn.disabled = true;
      sendBtn.textContent = t('sending');
      err.hidden = true;
      post('/chat', {
        line: btn.dataset.voiceLine,
        team: btn.dataset.voiceTeam || 'sales',
        name: name.value,
        email: email.value,
        body: body.value,
        page: location.href,
      }).then(function (d) {
        storeToken(key, d.token);
        showThread(d.token, key, d.chat, btn);
      }).catch(function (e) {
        err.textContent = e.message || t('error');
        err.hidden = false;
        sendBtn.disabled = false;
        sendBtn.textContent = t('send');
      });
    });
    draw({
      title: title,
      sub: t('writeIntro'),
      icon: ICON.chat,
      closable: true,
      body: [
        el('label', { class: 'rsv-lbl' }, [document.createTextNode(t('name')), name]),
        el('label', { class: 'rsv-lbl' }, [document.createTextNode(t('email')), email]),
        el('label', { class: 'rsv-lbl' }, [document.createTextNode(t('message')), body]),
        err,
        el('div', { class: 'rsv-row' }, [sendBtn]),
      ],
    });
    (name.value ? body : name).focus({ preventScroll: true });
  }

  function openThread(token, key, btn) {
    api('/chat/' + encodeURIComponent(token)).then(function (d) {
      showThread(token, key || d.chat.key, d.chat, btn);
    }).catch(function (e) {
      if (e.status === 404) {
        if (key) storeToken(key, '');
        if (btn) return compose(btn);
        return draw({ title: t('gone'), closable: true, icon: ICON.chat });
      }
      draw({ title: t('error'), closable: true, icon: ICON.chat });
    });
  }

  function when(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString(lang(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function messageList(data) {
    var list = el('div', { class: 'rsv-msgs', role: 'log' });
    data.messages.forEach(function (m) {
      list.appendChild(el('div', { class: 'rsv-msg' + (m.fromGuest ? ' rsv-me' : '') }, [
        el('span', { class: 'rsv-who', text: (m.fromGuest ? t('you') : m.name || data.line) + ' · ' + when(m.at) }),
        el('span', { class: 'rsv-said', text: m.body }),
      ]));
    });
    return list;
  }

  /** The conversation: what was said, a box to answer in, kept fresh while open. */
  function showThread(token, key, data, btn) {
    stopChat();
    if (key && data.key && key !== data.key) key = data.key;
    if (data.key) storeToken(data.key, token);
    chat = { token: token, key: key || data.key, count: data.messages.length, timer: null };
    var current = chat;
    var reply = el('textarea', { class: 'rsv-in rsv-area', maxlength: '2000', rows: '2', 'aria-label': t('reply'), placeholder: t('reply') });
    var err = el('p', { class: 'rsv-err', role: 'alert' });
    err.hidden = true;
    var sendBtn = button(t('send'), 'rsv-main', function () {
      if (!reply.value.trim()) return reply.focus();
      sendBtn.disabled = true;
      err.hidden = true;
      post('/chat/' + encodeURIComponent(token), { body: reply.value }).then(function (d) {
        if (chat === current) showThread(token, current.key, d.chat, btn);
      }).catch(function (e) {
        err.textContent = e.message || t('error');
        err.hidden = false;
        sendBtn.disabled = false;
      });
    });
    var waiting = data.messages.length && data.messages[data.messages.length - 1].fromGuest;
    var note = data.status === 'closed' ? t('closedNote') : waiting ? t('waitingNote') : '';
    var list = messageList(data);
    draw({
      title: data.line,
      sub: note,
      icon: ICON.chat,
      closable: true,
      body: [list, el('label', { class: 'rsv-lbl' }, [reply]), err, el('div', { class: 'rsv-row' }, [sendBtn])],
    });
    list.scrollTop = list.scrollHeight;
    reply.focus({ preventScroll: true });

    // Answers arrive while it is open; the box being typed in is kept.
    function poll() {
      current.timer = setTimeout(function () {
        if (chat !== current) return;
        if (document.visibilityState !== 'visible') return poll();
        api('/chat/' + encodeURIComponent(token)).then(function (d) {
          if (chat !== current) return;
          if (d.chat.messages.length !== current.count && !reply.value.trim()) return showThread(token, current.key, d.chat, btn);
          poll();
        }).catch(function () { if (chat === current) poll(); });
      }, CHAT_POLL_MS);
    }
    poll();
  }

  /* ------------------------------------------------------------ wiring */

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest(TRIGGER);
    if (!btn || btn.hidden || !supported) return;
    e.preventDefault();
    if (call || chat) return;
    // Nobody free on the line: straight to writing, no microphone asked for.
    if (btn.dataset.voiceState === 'voicemail') writeTo(btn);
    else start(btn);
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

  // The link in the email of an answer: the conversation, opened on the page
  // it was written from. The key is after the #, so it reaches no server; it
  // comes off the address bar at once.
  var linked = /[#&]rs-chat=([A-Za-z0-9_-]{20,64})/.exec(location.hash);
  if (linked) {
    history.replaceState(null, '', location.pathname + location.search);
    openThread(linked[1], '', null);
  }
})();
