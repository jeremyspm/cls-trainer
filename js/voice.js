/* voice.js — the app SPEAKS as the patient and the RN (speechSynthesis, every modern browser)
   and LISTENS for your lines (SpeechRecognition: Chrome / Edge / Samsung Internet; NOT Firefox).
   Listening is paused while the app itself is talking, so it never "hears" its own voice. */
(function () {
  'use strict';
  const synth = window.speechSynthesis || null;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  const V = {
    ttsSupported: !!synth,
    srSupported: !!SR,
    listening: false,      // the user wants the mic on
    state: 'off',          // off | on | paused | denied | error
    heard: '',             // final transcript since the last clearHeard()
    interim: '',
    onHeard: null,         // (finalText, interimText) => void
    onState: null,         // (state, detail) => void
    rateScale: 1,
  };

  /* ---------- speaking ---------- */
  let voices = [];
  const pick = {};
  function loadVoices() {
    if (!synth) return;
    voices = synth.getVoices() || [];
    const en = voices.filter(v => /^en(-|_|$)/i.test(v.lang));
    const pref = ['en-NZ', 'en-AU', 'en-GB', 'en-IE', 'en-US'];
    const byLang = (list) => list.slice().sort((a, b) => {
      const ia = pref.findIndex(p => a.lang.replace('_', '-').toLowerCase().startsWith(p.toLowerCase()));
      const ib = pref.findIndex(p => b.lang.replace('_', '-').toLowerCase().startsWith(p.toLowerCase()));
      return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib);
    });
    const male = /male(?!.*female)|david|george|daniel|james|ryan|liam|guy|fred|mark|thomas|william|rishi|aaron|arthur|gordon|lee/i;
    const female = /female|zira|hazel|karen|catherine|susan|sonia|natasha|libby|moira|fiona|samantha|serena|kate|heather|aria|jenny|clara|molly|hayley|tessa|matilda/i;
    const sorted = byLang(en.length ? en : voices);
    pick.pt = sorted.find(v => male.test(v.name)) || sorted[0] || null;
    pick.rn = sorted.find(v => female.test(v.name) && v !== pick.pt) || sorted.find(v => v !== pick.pt) || sorted[0] || null;
    pick.you = sorted.find(v => v !== pick.pt && v !== pick.rn) || pick.rn || sorted[0] || null;
  }
  if (synth) {
    loadVoices();
    if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', loadVoices);
    else synth.onvoiceschanged = loadVoices;
  }

  const TONE = { pt: { pitch: 0.85, rate: 0.92 }, rn: { pitch: 1.08, rate: 1.0 }, you: { pitch: 1.0, rate: 1.0 } };
  let speaking = 0;

  V.speak = function (text, who) {
    return new Promise(resolve => {
      if (!synth || !text) return resolve(false);
      if (!voices.length) loadVoices();
      const u = new SpeechSynthesisUtterance(text.replace(/[“”"]/g, ''));
      const t = TONE[who] || TONE.you;
      u.pitch = t.pitch; u.rate = t.rate * V.rateScale;
      const v = pick[who] || pick.you;
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-NZ';
      speaking++;
      pauseForSpeech();
      let done = false;
      const finish = () => { if (done) return; done = true; speaking = Math.max(0, speaking - 1); setTimeout(resumeAfterSpeech, 250); resolve(true); };
      u.onend = finish; u.onerror = finish;
      // Chrome on Android sometimes never fires onend; a length-based timeout guarantees progress.
      setTimeout(finish, 2500 + text.length * 95 / (u.rate || 1));
      synth.speak(u);
    });
  };
  V.stopSpeaking = function () { if (synth) synth.cancel(); speaking = 0; resumeAfterSpeech(); };
  V.isSpeaking = () => speaking > 0;

  /* ---------- listening ---------- */
  let rec = null, restartTimer = null, pausedBySpeech = false;
  function setState(s, d) { V.state = s; if (V.onState) V.onState(s, d); }

  function makeRec() {
    const r = new SR();
    r.lang = 'en-NZ';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onstart = () => setState('on');
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) V.heard += ' ' + res[0].transcript;
        else interim += ' ' + res[0].transcript;
      }
      V.interim = interim.trim();
      if (V.onHeard) V.onHeard(V.heard.trim(), V.interim);
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { V.listening = false; setState('denied', e.error); }
      else if (e.error === 'network') setState('error', 'network');
      // 'no-speech' and 'aborted' just restart via onend
    };
    r.onend = () => {
      rec = null;
      if (V.listening && !pausedBySpeech && V.state !== 'denied') {
        clearTimeout(restartTimer);
        restartTimer = setTimeout(startRec, 200);
      } else if (V.state === 'on') setState(pausedBySpeech ? 'paused' : 'off');
    };
    return r;
  }
  function startRec() {
    if (!SR || rec || !V.listening || pausedBySpeech) return;
    try { rec = makeRec(); rec.start(); } catch (err) { rec = null; }
  }
  function stopRec() { if (rec) { try { rec.abort(); } catch (e) { } rec = null; } }
  function pauseForSpeech() { if (V.listening) { pausedBySpeech = true; stopRec(); setState('paused'); } }
  function resumeAfterSpeech() {
    if (speaking > 0) return;
    if (pausedBySpeech) { pausedBySpeech = false; if (V.listening) startRec(); }
  }

  V.listen = function () { if (!SR) return false; V.listening = true; if (!V.isSpeaking()) startRec(); return true; };
  V.stopListening = function () { V.listening = false; pausedBySpeech = false; clearTimeout(restartTimer); stopRec(); setState('off'); };
  V.clearHeard = function () { V.heard = ''; V.interim = ''; if (V.onHeard) V.onHeard('', ''); };

  /* ---------- matching ----------
     keys = [ ['full name','your name'], ['date of birth','birthday','born'] ]
     Every group must be heard; any one alternative satisfies a group. */
  V.norm = function (s) {
    return ' ' + String(s || '').toLowerCase()
      .replace(/[’']/g, '')
      .replace(/[^a-z0-9āēīōū]+/g, ' ')
      .replace(/\s+/g, ' ').trim() + ' ';
  };
  V.match = function (text, keys) {
    const n = V.norm(text);
    return (keys || []).map(group => group.some(alt => n.includes(' ' + V.norm(alt).trim())));
  };

  window.Voice = V;
})();
