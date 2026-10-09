/* app.js — the CLS Practical Trainer.
   Views: home (two doors) · walk (walkthrough) · order ("What's next?") · setup + live (full run) · mark (self-mark vs rubric)
          · rubric · log · bp (BP Lab, js/bp.js).
   Storage: localStorage keys prefixed `cls.` (every jeremyspm.github.io tool shares one origin). Theme: `hub.theme`. */
(function () {
  'use strict';
  const D = window.CLS_DATA, V = window.Voice;
  const $ = (s, el) => (el || document).querySelector(s);
  const view = $('#view');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const RUNS = { vs: 'Vital signs', ma: 'Medication administration' };
  const LEVELS = [['coach', 'Coach', 'everything shown'], ['prompt', 'Prompt', 'step names only'], ['exam', 'Exam', 'nothing shown']];

  /* ---------------- storage ---------------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('cls.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('cls.' + k, JSON.stringify(v)); } catch (e) { } },
  };
  const settings = Object.assign({ level: 'coach', speak: true, listen: true, curve: 'some', drug: 'random', awake: true, rate: 1, voice: 'natural' }, store.get('settings', {}));
  const saveSettings = () => { store.set('settings', settings); V.mode = settings.voice; };
  V.mode = settings.voice;
  const log = () => store.get('log', []);
  const addLog = e => { const l = log(); l.push(e); store.set('log', l.slice(-400)); };
  const seen = () => store.get('seen', {});
  const markSeen = k => { const s = seen(); s[k] = Date.now(); store.set('seen', s); };
  const drill = () => store.get('drill', {});

  /* ---------------- helpers ---------------- */
  function fill(str, ctx) {
    if (str == null) return str;
    return String(str).replace(/\{(\w+)\}/g, (m, k) => (ctx && ctx[k] != null ? ctx[k] : m));
  }
  function pickDrug(d) { return d === 'para' || d === 'meto' ? d : (Math.random() < 0.5 ? 'para' : 'meto'); }
  function steps(run, drug) {
    const ctx = run === 'ma' ? D.FILL[drug || 'para'] : {};
    const cap = x => (x ? x.charAt(0).toUpperCase() + x.slice(1) : x); // a line may open with {generic}
    return D.STEPS[run].map(s => Object.assign({}, s, {
      t: fill(s.t, ctx), cue: fill(s.cue, ctx), line: cap(fill(s.line, ctx)),
      keys: s.keys ? s.keys.map(g => g.map(a => fill(a, ctx))) : null,
    }));
  }
  const youStep = s => s.kind === 'do' || s.kind === 'say';
  const rubricText = id => { for (const r of Object.values(D.RUBRIC)) for (const sec of r.sections) for (const [k, t] of sec.lines) if (k === id) return t; return id; };
  const short = (t, n) => (t.length > n ? t.slice(0, n - 1).trim() + '…' : t);
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const speakable = s => String(s || ''); // Voice.speak makes it sayable (V.speakable) — one place, so recorded-clip keys match
  function toast(msg, ms) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, ms || 2600);
  }
  let actx = null;
  function blip(ok) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = ok ? 880 : 220; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.18, actx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + (ok ? 0.18 : 0.3));
      o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + 0.35);
    } catch (e) { }
    if (navigator.vibrate) try { navigator.vibrate(ok ? 18 : [40, 40, 40]); } catch (e) { }
  }
  function srcChip(src) {
    if (!src) return '';
    const s = D.SRC[src[0]] || { label: src[0], full: src[0] };
    return `<button class="chip src" data-full="${esc(s.full + (src[1] ? ' — ' + src[1] : ''))}">${esc(s.label)}${src[1] ? ' · ' + esc(src[1]) : ''}</button>`;
  }
  function lineChips(ids) {
    return (ids || []).map(id => `<span class="chip rub" title="${esc(rubricText(id))}">✓ ${esc(short(rubricText(id), 34))}</span>`).join('');
  }
  view.addEventListener('click', e => {
    const c = e.target.closest('.chip.src'); if (c) toast(c.dataset.full, 5200);
    const h = e.target.closest('[data-href]'); if (h) location.href = h.dataset.href;   // pages outside the router (paper.html)
  });

  /* ---------------- theme, header, sheet ---------------- */
  $('#themeBtn').onclick = () => {
    const now = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', now);
    try { localStorage.setItem('hub.theme', now); } catch (e) { }
  };
  $('#backBtn').onclick = () => { stopAll(); location.hash = '#home'; };
  function setHeader(title, sub, back) {
    $('#title').textContent = title; $('#subtitle').textContent = sub || '';
    $('#backBtn').hidden = !back;
    document.title = title === 'CLS Practical Trainer' ? title : title + ' · CLS Trainer';
  }
  function openSheet(html) {
    $('#sheetBody').innerHTML = html + '<div class="btns"><button class="btn block" data-close>Close</button></div>';
    $('#sheet').hidden = false; $('#sheetScrim').hidden = false;
    $('#sheet').scrollTop = 0;
  }
  function closeSheet() { $('#sheet').hidden = true; $('#sheetScrim').hidden = true; }
  $('#sheetScrim').onclick = closeSheet;
  $('#sheet').addEventListener('click', e => {
    if (e.target.closest('[data-close]')) closeSheet();
    const c = e.target.closest('.chip.src'); if (c) toast(c.dataset.full, 5200);
  });
  $('#helpBtn').onclick = () => openSheet(helpHtml());

  function helpHtml() {
    const srcs = Object.values(D.SRC).map(s => `<li><b>${esc(s.label)}</b>: ${esc(s.full)}</li>`).join('');
    return `<h2>What is this?</h2>
      <p>A rehearsal partner for the two CLS practicals: <b>Vital Signs</b> (722.556) and <b>Medication Administration</b> (722.544). Both are Met / Not Met, and the assessor ticks every line on a sheet. This app is built from those sheets.</p>
      <h3>The ways to practise</h3>
      <p><b>Walkthrough</b>: the whole run, step by step, with what to do, what to say, and which rubric line it earns.<br>
      <b>What’s next?</b>: you’re shown where you are and pick the next step. This catches order mistakes, like pumping the cuff before the stethoscope is on.<br>
      <b>Live run</b>: do it for real, out loud. The app speaks as the patient and the RN, listens for your key words, and throws in curveballs. At the end you mark yourself against the real rubric.<br>
      <b>BP Lab</b>: the two-step blood pressure on a simulated gauge, with tapping sounds and a pulse you feel through the phone.</p>
      <h3>Listening</h3>
      <p>${V.srSupported ? 'Your browser can listen. ' : '<b>This browser can’t listen</b> (Firefox can’t). Open the page in Chrome on your phone for the mic. Everything else works here. '}The mic only ticks off key words (like “date of birth”). It isn’t marking your English. Chrome sends the audio to Google to turn it into text; nothing else leaves your phone.</p>
      <h3>The voices</h3>
      <p>Mr Luke, the RN and the model lines are <b>pre-recorded</b> with Kokoro, a neural text-to-speech voice, so they sound the same on every phone and work offline once played. Anything that isn’t recorded uses your phone’s own voice. You can switch to “Phone’s own” in the Live run set-up.</p>
      <h3>Can it see me?</h3>
      <p>No. It can’t see your hands or your readings. When you tap <b>Done</b>, it believes you, so be your own assessor.</p>
      <h3>Where the content comes from</h3>
      <p>Each step has a source chip; tap it to see the full reference. The model lines come from the course’s own demo videos where one exists.</p>
      <ul class="small">${srcs}</ul>
      <h3>For the admin (future you)</h3>
      <p class="small muted">Content: <code>js/data.js</code> (rubric text verbatim, steps, curveballs, drugs). Engine: <code>js/app.js</code>; voice: <code>js/voice.js</code>; BP Lab: <code>js/bp.js</code>. Progress lives in this browser only, in localStorage keys starting <code>cls.</code> (log, drill, seen, settings, rnq). Checks: <code>node tests/check.mjs</code> and <code>node tests/drive.mjs</code>. Voices: after any wording change run <code>node tools/voice-jobs.mjs</code> then <code>python tools/render_voices.py</code> (Kokoro, local); the check fails until every line has a clip. Demo transcripts: <code>D:\\lecture-recordings\\2026-10-08-cls\\</code>.</p>`;
  }

  /* ---------------- router ---------------- */
  let cleanup = null;
  function stopAll() {
    if (cleanup) { try { cleanup(); } catch (e) { } cleanup = null; }
    V.stopSpeaking(); V.stopListening(); V.onHeard = null; V.onState = null;
    releaseWake();
  }
  function route() {
    stopAll(); closeSheet();
    const h = (location.hash || '#home').slice(1);
    const [name, arg, arg2] = h.split('/');
    window.scrollTo(0, 0);
    if (name === 'walk') return walkView(arg || 'vs', arg2);
    if (name === 'order') return orderView(arg || 'vs', arg2 || 'all');
    if (name === 'setup') return setupView(arg || 'vs');
    if (name === 'live') return liveView(arg || 'vs');
    if (name === 'rubric') return rubricView(arg || 'vs');
    if (name === 'rnq') return rnqView(arg || 'vs', arg2);
    if (name === 'chart') return chartView(arg === 'ma' ? 'ma' : arg === 'read' ? 'read' : 'vs');
    if (name === 'cuff') return cuffView();
    if (name === 'log') return logView();
    if (name === 'bp') return bpView();
    return homeView();
  }
  window.addEventListener('hashchange', route);

  /* ---------------- decide for me ---------------- */
  function bestLevelMet(run) {
    let best = -1;
    for (const e of log()) if (e.type === 'live' && e.run === run && e.met) best = Math.max(best, LEVELS.findIndex(l => l[0] === e.level));
    return best;
  }
  function chartClean(run) { return log().some(e => e.type === 'chart' && e.run === run && e.right === e.total); }
  function cuffStreak() { const L = log().filter(e => e.type === 'cuff'); let n = 0; for (let i = L.length - 1; i >= 0 && L[i].first; i--) n++; return n; }
  function cuffToday() { const d = new Date().toDateString(); return log().some(e => e.type === 'cuff' && new Date(e.t).toDateString() === d); }
  function cuffLine() {
    if (!store.get('cuffArrived', false)) return 'For when your cuff arrives: first-try readings, target 10 in a row';
    const n = log().filter(e => e.type === 'cuff').length;
    return n ? `First-try streak ${cuffStreak()} of 10 · ${n} real readings` : 'Log your first real reading';
  }
  function rnqPassed(run) { return log().some(e => e.type === 'rnq' && e.run === run && e.total >= 8 && e.right / e.total >= 0.8); }
  function orderClean(run, scope) { return log().some(e => e.type === 'order' && e.run === run && e.scope === scope && e.misses === 0); }
  function weakSteps(run) {
    const d = drill(); return D.STEPS[run].filter(s => d[s.id] && d[s.id].miss > 0 && (d[s.id].streak || 0) < 2).map(s => s.id);
  }
  function plan() {
    const s = seen(), L = log();
    if (!s['walk-vs']) return { href: '#walk/vs', t: 'Read the vital signs run once', why: 'Start here: the whole run in one read, about 5 minutes. Every step, word for word from the course demo.' };
    if (!orderClean('vs', 'bp')) return { href: '#order/vs/bp', t: 'What’s next? BP only', why: 'The two-step order is where you got stopped. Get one clean run of the BP sequence.' };
    if (!L.some(e => e.type === 'bp' && e.ok)) return { href: '#bp', t: 'BP Lab: one clean reading', why: 'Feel the pulse go, hear the taps, and watch the needle fall at 2–3 mmHg a second.' };
    if (!rnqPassed('vs')) return { href: '#rnq/vs', t: 'The RN asks: vital signs', why: 'Ten questions your preceptor could ask: normal ranges, the two-step, charting. Get 8 or more right in one go.' };
    if (store.get('cuffArrived', false) && cuffStreak() < 10 && !cuffToday()) return { href: '#cuff', t: 'Real cuff: take one reading', why: `Your first-try streak is ${cuffStreak()} of 10. One real reading on a real arm beats ten simulated ones.` };
    const vsLvl = bestLevelMet('vs');
    if (vsLvl < 0) return { href: '#setup/vs', t: 'Live run: vital signs (Coach)', why: 'Say it out loud with everything on screen. The app plays Mr Luke and your preceptor.', level: 'coach' };
    if (!chartClean('vs')) return { href: '#chart/vs', t: 'Chart it: one clean column', why: '“Accurately documents findings directly on vital signs chart” is a rubric line. Plot a set of obs: X, number, arrows.' };
    if (!s.paper) return { href: 'paper.html', t: 'Chart on the real paper chart', why: 'The actual chart from Janine’s deck. Print it (or use a pen), chart two stories on Mr Luke, then check the answers drawn on the same chart.' };
    if (!s['walk-ma']) return { href: '#walk/ma', t: 'Read the med admin run once', why: 'Same patient, Mr Luke. Joan’s role play, step by step.' };
    if (!orderClean('ma', 'all')) return { href: '#order/ma/all', t: 'What’s next? Med admin', why: 'Lock in the order: chart → drug → expiry → bedside → Ask, Build, Check → sign.' };
    if (!rnqPassed('ma')) return { href: '#rnq/ma', t: 'The RN asks: med admin', why: 'The rights, the two drugs, and Ask–Build–Check. Get 8 or more right in one go.' };
    if (!seen().chartsim) return { href: '#chart/ma', t: 'Sign Mr Luke’s med chart (Chart Sim)', why: 'Three rubric lines: correct medication; correct date, time, dose; appropriate initials. Do his four rounds on the real 8-day chart.' };
    const maLvl = bestLevelMet('ma');
    const weak = weakSteps('vs').concat(weakSteps('ma'));
    if (weak.length) return { href: '#order/' + (weakSteps('vs').length ? 'vs' : 'ma') + '/weak', t: 'Fix your weak steps', why: weak.length + ' step' + (weak.length > 1 ? 's' : '') + ' you’ve missed in “What’s next?” and haven’t got right twice since.' };
    if (maLvl < vsLvl) return { href: '#setup/ma', t: 'Live run: med admin (' + LEVELS[Math.min(2, maLvl + 1)][1] + ')', why: 'Bring med admin up to the level you’ve reached on vital signs.', level: LEVELS[Math.min(2, maLvl + 1)][0] };
    if (vsLvl < 2) return { href: '#setup/vs', t: 'Live run: vital signs (' + LEVELS[vsLvl + 1][1] + ')', why: 'You met it at ' + LEVELS[vsLvl][1] + '. Step up: less on screen.', level: LEVELS[vsLvl + 1][0] };
    if (maLvl < 2) return { href: '#setup/ma', t: 'Live run: med admin (' + LEVELS[maLvl + 1][1] + ')', why: 'Step up: less on screen.', level: LEVELS[maLvl + 1][0] };
    const lastExam = run => Math.max(0, ...L.filter(e => e.type === 'live' && e.run === run && e.level === 'exam' && e.met).map(e => +new Date(e.t)));
    const run = lastExam('vs') <= lastExam('ma') ? 'vs' : 'ma';
    return { href: '#setup/' + run, t: 'Exam run: ' + RUNS[run].toLowerCase(), why: 'Both are Met at Exam level. Keep them warm: this one is the longest since you last ran it.', level: 'exam' };
  }

  /* ---------------- home ---------------- */
  function homeView() {
    setHeader('CLS Practical Trainer', 'Vital signs · Medication administration', false);
    const L = log(), p = plan();
    const lives = L.filter(e => e.type === 'live');
    const mets = lives.filter(e => e.met).length;
    const bpOk = L.filter(e => e.type === 'bp' && e.ok).length;
    const today = new Date().toDateString();
    const todayN = L.filter(e => new Date(e.t).toDateString() === today).length;
    view.innerHTML = `
      ${L.length ? `<div class="stats">
        <div class="stat"><b class="num">${todayN}</b><span>reps today</span></div>
        <div class="stat"><b class="num">${mets}</b><span>runs marked Met</span></div>
        <div class="stat"><b class="num">${bpOk}</b><span>clean BP Lab reads</span></div></div>`
        : `<div class="card flat"><b>No practice logged yet.</b><p class="muted small">Tap “Decide for me” and it’ll start you on the right thing. Your progress stays on this phone.</p></div>`}
      <button class="door" id="decide"><b>⚡ Decide for me: ${esc(p.t)}</b><span>${esc(p.why)}</span></button>
      <div class="eyebrow">Or pick it yourself</div>
      <h3>🩺 Vital signs <span class="small muted">· your resit</span></h3>
      <div class="grid2">
        <button class="row" data-go="#walk/vs"><span class="ic">📖</span><span class="tx"><b>Walkthrough</b><span>Every step + what to say</span></span></button>
        <button class="row" data-go="#order/vs/bp"><span class="ic">🔢</span><span class="tx"><b>What’s next? · BP</b><span>The two-step order</span></span></button>
        <button class="row" data-go="#bp"><span class="ic">🎚️</span><span class="tx"><b>BP Lab</b><span>Gauge, pulse, the taps</span></span></button>
        <button class="row" data-go="#setup/vs"><span class="ic">🎙️</span><span class="tx"><b>Live run</b><span>Out loud, start to finish</span></span></button>
      </div>
      <button class="row" data-go="#rnq/vs"><span class="ic">🗣️</span><span class="tx"><b>The RN asks… · vital signs</b><span>${rnqLine('vs')}</span></span><span class="go">›</span></button>
      <button class="row" data-go="#chart/vs"><span class="ic">📝</span><span class="tx"><b>Chart it</b><span>Plot the obs on the NZ vital signs chart, 24-hour time, spot the abnormal</span></span><span class="go">›</span></button>
      <button class="row" data-href="paper.html"><span class="ic">🖨️</span><span class="tx"><b>Real chart practice</b><span>The actual chart from Janine’s deck: print it, chart two stories, check the answers drawn on it</span></span><span class="go">›</span></button>
      <button class="row" data-go="#cuff"><span class="ic">🩺</span><span class="tx"><b>Real cuff log</b><span>${cuffLine()}</span></span><span class="go">›</span></button>
      <h3>💊 Medication administration <span class="small muted">· Mr Luke</span></h3>
      <div class="grid2">
        <button class="row" data-go="#walk/ma"><span class="ic">📖</span><span class="tx"><b>Walkthrough</b><span>Chart → bedside → sign</span></span></button>
        <button class="row" data-go="#order/ma/all"><span class="ic">🔢</span><span class="tx"><b>What’s next?</b><span>The whole order</span></span></button>
        <button class="row" data-go="#setup/ma"><span class="ic">🎙️</span><span class="tx"><b>Live run</b><span>Paracetamol or metoprolol</span></span></button>
        <button class="row" data-go="#rubric/ma"><span class="ic">📋</span><span class="tx"><b>The marking sheet</b><span>Every line, word for word</span></span></button>
      </div>
      <button class="row" data-go="#rnq/ma"><span class="ic">🗣️</span><span class="tx"><b>The RN asks… · med admin</b><span>${rnqLine('ma')}</span></span><span class="go">›</span></button>
      <button class="row" data-go="#chart/ma"><span class="ic">✍️</span><span class="tx"><b>Sign the med chart</b><span>Mr Luke’s real 8-day chart in Chart Sim: four rounds, Giv/Chck, W and R</span></span><span class="go">›</span></button>
      <div class="eyebrow">More</div>
      <button class="row" data-go="#order/vs/all"><span class="ic">🔢</span><span class="tx"><b>What’s next? · whole vital signs run</b><span>Chart to hand hygiene</span></span><span class="go">›</span></button>
      <button class="row" data-go="#rubric/vs"><span class="ic">📋</span><span class="tx"><b>Vital signs marking sheet</b><span>Every line, word for word</span></span><span class="go">›</span></button>
      <button class="row" data-go="#log"><span class="ic">📈</span><span class="tx"><b>Your log</b><span>${L.length ? L.length + ' entries' : 'Nothing yet'}</span></span><span class="go">›</span></button>      <p class="small faint" style="margin-top:18px">Built from your two marking sheets, Janine’s vital signs demo, Joan’s med admin role play, and their decks. Tap <b>?</b> for how it works and where each piece came from.</p>`;
    $('#decide').onclick = () => { if (p.level) { settings.level = p.level; saveSettings(); } if (p.href[0] === '#') location.hash = p.href; else location.href = p.href; };
    view.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { location.hash = b.dataset.go; });
  }

  /* ---------------- walkthrough ---------------- */
  function walkView(run, drugArg) {
    const drug = run === 'ma' ? (drugArg === 'meto' ? 'meto' : 'para') : null;
    setHeader('Walkthrough', RUNS[run] + (drug ? ' · ' + D.DRUGS[drug].generic : ''), true);
    markSeen('walk-' + run);
    const S = steps(run, drug);
    let html = '';
    if (run === 'ma') {
      html += `<div class="seg" role="tablist">
        <button class="${drug === 'para' ? 'on' : ''}" data-drug="para">Paracetamol 1 g qid</button>
        <button class="${drug === 'meto' ? 'on' : ''}" data-drug="meto">Metoprolol CR 47.5 mg daily</button></div>
        <div class="card"><b>The scenario</b><p class="small">${esc('Mr Luke, 79, long-standing heart failure and high blood pressure. His BP has been higher than usual and he has recurrent backache, so his GP added paracetamol 1 g PO qid and metoprolol succinate CR 47.5 mg PO daily. On the day you’re given ONE of the two.')}</p><div class="chips">${srcChip(['brief-ma', 'Scenario'])}</div></div>`;
    } else {
      html += `<div class="card"><b>The patient: ${esc(D.PATIENT.title)}</b><p class="small">${esc(D.PATIENT.name)} · DOB ${esc(D.PATIENT.dob)} · NHI ${esc(D.PATIENT.nhi)}. Same patient as the med admin scenario.</p><p class="small muted">${esc(D.PATIENT.note)}</p></div>`;
    }
    html += `<div class="btns"><button class="btn primary" id="playAll">▶ Play the whole scene</button><button class="btn" data-go="#rubric/${run}">📋 Marking sheet</button></div>`;
    let ph = '';
    S.forEach((s, i) => {
      if (s.ph !== ph) { ph = s.ph; html += `<div class="phase"><h3>${esc(ph)}</h3></div>`; }
      const who = s.kind === 'pt' ? '<span class="who pt">Mr Luke</span>' : s.kind === 'rn' ? '<span class="who rn">Your RN</span>' : s.kind === 'say' ? `<span class="who you">You say${s.to === 'rn' ? ' → RN' : ''}</span>` : '<span class="who do">You do</span>';
      const cls = s.kind === 'pt' ? 'pt' : s.kind === 'rn' ? 'rn' : '';
      html += `<div class="step ${s.trap ? 'trapstep' : ''}" id="st-${s.id}">
        <div class="hd">${who}<b>${esc(s.kind === 'pt' || s.kind === 'rn' ? '' : s.t)}</b>${s.line ? `<button class="play" data-play="${i}" aria-label="Play this line">▶</button>` : ''}</div>
        ${s.cue ? `<p class="cue">${esc(s.cue)}</p>` : ''}
        ${s.line ? `<div class="say ${cls}">“${esc(s.line)}”</div>` : ''}
        ${s.trap ? `<div class="trapnote">⚠️ ${esc(s.trap)}</div>` : ''}
        <div class="chips">${srcChip(s.src)}${lineChips(s.lines)}</div></div>`;
    });
    html += `<div class="btns"><button class="btn primary" data-go="#order/${run}/${run === 'vs' ? 'bp' : 'all'}">Next: What’s next? drill</button><button class="btn" data-go="#setup/${run}">Live run</button></div>`;
    view.innerHTML = html;
    view.querySelectorAll('[data-drug]').forEach(b => b.onclick = () => { location.hash = '#walk/ma/' + b.dataset.drug; });
    view.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { location.hash = b.dataset.go; });
    const voiceOf = s => s.kind === 'pt' ? 'pt' : s.kind === 'rn' ? 'rn' : 'you';
    view.querySelectorAll('[data-play]').forEach(b => b.onclick = () => { V.stopSpeaking(); const s = S[+b.dataset.play]; V.speak(speakable(s.line), voiceOf(s)); });
    let playing = false;
    $('#playAll').onclick = async () => {
      if (playing) { playing = false; V.stopSpeaking(); $('#playAll').textContent = '▶ Play the whole scene'; return; }
      if (!V.ttsSupported && !V.clips) return toast('This browser can’t speak. Try Chrome.');
      playing = true; $('#playAll').textContent = '■ Stop';
      for (const s of S) {
        if (!playing) break;
        const el = $('#st-' + s.id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (s.line) await V.speak(speakable(s.line), voiceOf(s));
        else await V.speak(s.t, 'you');
        await new Promise(r => setTimeout(r, 350));
      }
      playing = false; const b = $('#playAll'); if (b) b.textContent = '▶ Play the whole scene';
    };
    cleanup = () => { playing = false; };
  }

  /* ---------------- order drill ("What's next?") ---------------- */
  function orderView(run, scope) {
    const S = steps(run, run === 'ma' ? 'para' : null).filter(youStep);
    let targets;
    if (scope === 'bp') targets = S.filter(s => s.bp);
    else if (scope === 'weak') { const w = weakSteps(run); targets = S.filter(s => w.includes(s.id)); }
    else targets = S;
    setHeader('What’s next?', RUNS[run] + (scope === 'bp' ? ' · BP two-step' : scope === 'weak' ? ' · your weak steps' : ' · whole run'), true);
    if (!targets.length) {
      view.innerHTML = `<div class="card good"><b>Nothing to fix here.</b><p class="small">No weak steps on ${esc(RUNS[run].toLowerCase())}. Every step you’ve missed, you’ve since got right twice in a row.</p></div><div class="btns"><button class="btn primary" onclick="location.hash='#order/${run}/all'">Run the whole order</button></div>`;
      return;
    }
    const st = { i: 0, misses: [], answered: false };
    const d = drill();
    function distractors(target) {
      const idx = S.indexOf(target);
      const pool = [];
      for (let k = 1; k <= 5; k++) if (S[idx + k]) pool.push({ s: S[idx + k], w: k <= 2 ? 5 : 2 }); // jumping ahead: the classic error
      for (let k = 1; k <= 3; k++) if (S[idx - k]) pool.push({ s: S[idx - k], w: 1 });
      S.forEach(s => { if (s !== target && !pool.some(p => p.s === s)) pool.push({ s, w: 0.3 }); });
      const out = [], titles = new Set([target.t]);
      while (out.length < 3 && pool.length) {
        const tot = pool.reduce((a, p) => a + p.w, 0); let r = Math.random() * tot, j = 0;
        for (; j < pool.length; j++) { r -= pool[j].w; if (r <= 0) break; }
        const [p] = pool.splice(Math.min(j, pool.length - 1), 1);
        if (!titles.has(p.s.t)) { titles.add(p.s.t); out.push(p.s); }
      }
      return out;
    }
    function render() {
      const target = targets[st.i];
      const idx = S.indexOf(target);
      const before = S.slice(Math.max(0, idx - 4), idx);
      const opts = shuffle([target].concat(distractors(target)));
      const pct = Math.round(100 * st.i / targets.length);
      view.innerHTML = `
        <div class="progress"><i style="width:${pct}%"></i></div>
        <div class="small muted">${st.i + 1} of ${targets.length} · ${esc(target.ph)}</div>
        <ul class="chain">${idx > 4 ? '<li class="more">…</li>' : ''}${before.map(s => `<li class="ok">${esc(s.t)}</li>`).join('') || '<li class="more">You’re at the start.</li>'}</ul>
        <div class="q">What do you do next?</div>
        <div id="opts">${opts.map(o => `<button class="opt" data-id="${o.id}">${esc(o.t)}</button>`).join('')}</div>
        <div id="fb"></div>`;
      view.querySelectorAll('.opt').forEach(b => b.onclick = () => answer(b, target));
    }
    function answer(btn, target) {
      if (st.answered) return; st.answered = true;
      const ok = btn.dataset.id === target.id;
      const rec = d[target.id] || { seen: 0, miss: 0, streak: 0 };
      rec.seen++; if (ok) rec.streak = (rec.streak || 0) + 1; else { rec.miss++; rec.streak = 0; st.misses.push(target.id); }
      d[target.id] = rec; store.set('drill', d);
      blip(ok);
      view.querySelectorAll('.opt').forEach(b => { b.disabled = true; if (b.dataset.id === target.id) b.classList.add('right'); else if (b === btn) b.classList.add('wrong'); });
      const chosen = S.find(s => s.id === btn.dataset.id);
      $('#fb').innerHTML = `<div class="card ${ok ? 'good' : 'bad'}">
        <b>${ok ? 'Yes.' : 'Not yet. Next is: ' + esc(target.t)}</b>
        ${!ok && chosen && S.indexOf(chosen) > S.indexOf(target) ? `<p class="small">“${esc(chosen.t)}” comes later. Jumping ahead is exactly how steps get missed.</p>` : ''}
        ${target.cue ? `<p class="small">${esc(target.cue)}</p>` : ''}
        ${target.trap ? `<div class="trapnote">⚠️ ${esc(target.trap)}</div>` : ''}
        <div class="chips">${srcChip(target.src)}</div></div>
        <div class="btns"><button class="btn primary block" id="nextQ">${st.i + 1 < targets.length ? 'Next' : 'See how you did'}</button></div>`;
      $('#nextQ').onclick = () => { st.i++; st.answered = false; if (st.i < targets.length) render(); else done(); };
      $('#nextQ').focus();
    }
    function done() {
      addLog({ type: 'order', t: new Date().toISOString(), run, scope, total: targets.length, misses: st.misses.length, missed: st.misses });
      const clean = st.misses.length === 0;
      view.innerHTML = `<div class="card ${clean ? 'good' : 'warn'}">
        <div class="verdict ${clean ? 'met' : ''}">${clean ? 'Clean run ✓' : st.misses.length + ' to fix'}</div>
        <p>${targets.length - st.misses.length} of ${targets.length} right first time.</p>
        ${st.misses.length ? '<ul class="checklist">' + st.misses.map(id => { const s = S.find(x => x.id === id); return `<li><i>✗</i><span>${esc(s.t)}</span></li>`; }).join('') + '</ul>' : '<p class="small muted">Do one more clean run tomorrow to make it stick.</p>'}
      </div>
      <div class="btns">
        <button class="btn primary" id="again">${clean ? 'Again' : 'Again, same order'}</button>
        ${st.misses.length ? `<button class="btn" id="weak">Only the ones I missed</button>` : ''}
        <button class="btn" data-go="#setup/${run}">Live run</button>
        <button class="btn" data-go="#home">Home</button></div>`;
      $('#again').onclick = () => route();
      const w = $('#weak'); if (w) w.onclick = () => { location.hash = '#order/' + run + '/weak'; };
      view.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { location.hash = b.dataset.go; });
    }
    render();
  }

  /* ---------------- live run: setup ---------------- */
  function setupView(run) {
    setHeader('Live run', RUNS[run], true);
    const segs = (name, opts) => `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(settings[name]) === String(v) ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
    view.innerHTML = `
      <div class="card"><b>How this works</b><p class="small">Prop your phone up and do it for real on a person, a pillow, or the air. The app plays ${run === 'vs' ? 'Mr Luke and your preceptor' : 'Mr Luke and your RN'}. When it’s your line, say it out loud. When it’s an action, do it, then tap <b>Done</b>.</p></div>
      ${run === 'ma' ? `<div class="field"><label>Which drug did your RN give you?</label>${segs('drug', [['random', 'Surprise me'], ['para', 'Paracetamol'], ['meto', 'Metoprolol']])}</div>` : ''}
      <div class="field"><label>How much is on screen</label>${segs('level', LEVELS.map(l => [l[0], l[1]]))}
        <p class="small muted" id="lvlNote"></p></div>
      <div class="field"><label>Curveballs (wrong wristband, an allergy, an expired pack…)</label>${segs('curve', [['off', 'Off'], ['some', 'Some'], ['lots', 'Lots']])}</div>
      <label class="toggle"><input type="checkbox" id="optSpeak" ${settings.speak ? 'checked' : ''} ${V.ttsSupported || V.clips ? '' : 'disabled'}> The app speaks the patient and RN lines</label>
      <div class="field"><label>Voice</label>${segs('voice', [['natural', 'Natural (recorded)'], ['device', 'Phone’s own']])}
        <p class="small muted">${V.clips ? 'Natural = lines pre-recorded with a neural voice (Kokoro). Anything not recorded falls back to your phone’s voice.' : 'The recorded voices didn’t load (offline on first visit?), so your phone’s voice is used.'}</p></div>
      <label class="toggle"><input type="checkbox" id="optListen" ${settings.listen && V.srSupported ? 'checked' : ''} ${V.srSupported ? '' : 'disabled'}> Listen to me and tick off my key words</label>
      ${V.srSupported ? '' : '<div class="card warn small"><b>Listening isn’t available in this browser.</b> Firefox can’t do speech recognition. Open this page in Chrome on your phone to use the mic. Here you’ll tap “Said it” instead.</div>'}
      <label class="toggle"><input type="checkbox" id="optAwake" ${settings.awake ? 'checked' : ''}> Keep the screen on during the run</label>
      <div class="btns"><button class="btn primary block" id="go">Start the run</button></div>`;
    const notes = { coach: 'Coach: each step shows what to do and the exact words. Start here.', prompt: 'Prompt: only the step name. Tap “Peek” if you’re stuck; peeks are counted.', exam: 'Exam: nothing on screen, like the real thing. Only the patient and RN talk.' };
    const setNote = () => { $('#lvlNote').textContent = notes[settings.level]; };
    setNote();
    view.querySelectorAll('[data-seg]').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => {
      settings[g.dataset.seg] = b.dataset.v; saveSettings();
      g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); setNote();
    }));
    $('#optSpeak').onchange = e => { settings.speak = e.target.checked; saveSettings(); };
    $('#optListen').onchange = e => { settings.listen = e.target.checked; saveSettings(); };
    $('#optAwake').onchange = e => { settings.awake = e.target.checked; saveSettings(); };
    $('#go').onclick = () => {
      // a user gesture: unlock audio + speech on mobile before the run starts
      try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (e) { }
      if (V.ttsSupported && settings.speak) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); }
      location.hash = '#live/' + run;
    };
  }

  /* ---------------- wake lock ---------------- */
  let wake = null;
  async function holdWake() { try { if (settings.awake && navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch (e) { wake = null; } }
  function releaseWake() { try { if (wake) wake.release(); } catch (e) { } wake = null; }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && wake === null && location.hash.startsWith('#live')) holdWake(); });

  /* ---------------- live run ---------------- */
  let lastRun = null;
  function liveView(run) {
    const drug = run === 'ma' ? pickDrug(settings.drug) : null;
    const ctx = run === 'ma' ? D.FILL[drug] : {};
    const base = steps(run, drug);
    // curveballs
    const pool = shuffle(D.CURVE.filter(c => c.run === run && (!c.drug || c.drug === drug)));
    const n = settings.curve === 'lots' ? 4 : settings.curve === 'some' ? 2 : 0;
    const chosen = [], usedAt = new Set();
    for (const c of pool) { if (chosen.length >= n) break; if (usedAt.has(c.at)) continue; usedAt.add(c.at); chosen.push(c); }
    const seq = [];
    base.forEach(s => {
      seq.push(s);
      chosen.filter(c => c.at === s.id).forEach(c => seq.push(Object.assign({}, c, { kind: 'cb', ph: s.ph, t: 'Curveball', line: fill(c.line, ctx), title: fill(c.title, ctx) })));
    });
    const R = { run, drug, level: settings.level, seq, i: 0, start: Date.now(), res: {}, peeks: 0, cbs: [] };
    lastRun = R;
    const listenOn = settings.listen && V.srSupported;
    setHeader(run === 'vs' ? 'Live: vital signs' : 'Live: med admin', (drug ? D.DRUGS[drug].order + ' · ' : '') + LEVELS.find(l => l[0] === R.level)[1] + ' level', true);
    holdWake();
    let timer = setInterval(() => { const e = $('#elapsed'); if (e) e.textContent = clock(Date.now() - R.start); }, 1000);
    let advT = null, peekLvl = 0;
    cleanup = () => { clearInterval(timer); clearTimeout(advT); };
    if (listenOn) {
      V.onState = (s, d) => {
        const m = $('#mic'); if (!m) return;
        m.classList.toggle('on', s === 'on');
        const lab = $('#micLab');
        if (lab) lab.textContent = s === 'on' ? 'Listening…' : s === 'paused' ? 'Paused while the app talks' : s === 'denied' ? 'Mic blocked. Allow it in the browser’s site settings, or tap “Said it”.' : s === 'error' ? 'Speech recognition needs internet. Tap “Said it”.' : 'Mic off';
      };
      V.onHeard = (fin, interim) => onHeard(fin, interim);
      V.listen();
    }
    function clock(ms) { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
    function cur() { return R.seq[R.i]; }
    function render() {
      clearTimeout(advT); peekLvl = 0;
      const s = cur(); if (!s) return finish();
      V.clearHeard();
      const pct = Math.round(100 * R.i / R.seq.length);
      const lvl = R.level;
      const isYou = youStep(s);
      let body = '';
      if (s.kind === 'pt' || s.kind === 'rn') {
        body = `<span class="who ${s.kind}">${s.kind === 'pt' ? 'Mr Luke' : 'Your RN'}</span><div class="say ${s.kind}" style="font-size:18px">“${esc(s.line)}”</div>`;
      } else if (s.kind === 'cb') {
        const opts = shuffle(s.opts.map((o, k) => ({ o, k })));
        body = `<span class="who" style="color:var(--hard);background:var(--gHard)">Curveball</span>
          ${s.line ? `<div class="say ${s.who === 'rn' ? 'rn' : 'pt'}" style="font-size:18px">“${esc(s.line)}”</div>` : `<div class="bigt">${esc(s.title)}</div>`}
          <div class="q" style="font-size:16px">What do you do?</div>
          ${opts.map(x => `<button class="opt" data-k="${x.k}">${esc(x.o)}</button>`).join('')}<div id="cbfb"></div>`;
      } else {
        const tag = s.kind === 'say' ? `<span class="who you">Your line${s.to === 'rn' ? ' → RN' : ' → Mr Luke'}</span>` : '<span class="who do">Your action</span>';
        if (lvl === 'coach') {
          body = `${tag}<div class="bigt">${esc(s.t)}</div>${s.cue ? `<p class="cue">${esc(s.cue)}</p>` : ''}${s.line ? `<div class="say">“${esc(s.line)}”</div>` : ''}${s.trap ? `<div class="trapnote">⚠️ ${esc(s.trap)}</div>` : ''}`;
        } else if (lvl === 'prompt') {
          body = `${tag}<div class="bigt">${esc(s.t)}</div><div id="peekbox"></div>`;
        } else {
          body = `${tag}<div class="bigt faint">Your move…</div><div id="peekbox"></div>`;
        }
        if (s.kind === 'say' && listenOn && s.keys) {
          body += `<div class="keys" id="keys">${s.keys.map((g, k) => `<span class="chip wait" data-g="${k}">${lvl === 'exam' ? 'key point ' + (k + 1) : esc(g[0])}</span>`).join('')}</div>`;
        }
      }
      view.innerHTML = `
        <div class="live-top"><span>${esc(s.ph)}</span><span class="sp"></span><span class="num">${R.i + 1}/${R.seq.length}</span><span>·</span><span class="num" id="elapsed">${clock(Date.now() - R.start)}</span></div>
        <div class="progress"><i style="width:${pct}%"></i></div>
        <div class="stage ${s.kind === 'cb' ? 'cb' : ''}">${body}
          ${listenOn && s.kind === 'say' ? `<div class="mic" id="mic"><span class="dot"></span><span id="micLab">Listening…</span><span class="heard" id="heard"></span></div>` : ''}
        </div>
        <div class="live-actions" id="acts"></div>`;
      const acts = $('#acts');
      const btn = (label, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + (cls || ''); b.textContent = label; b.onclick = fn; acts.appendChild(b); return b; };
      if (isYou) {
        btn('←', 'narrow', back).setAttribute('aria-label', 'Back one step');
        if (lvl !== 'coach') btn('Peek', 'narrow', peek);
        btn('Skip ✗', 'narrow bad', () => complete('skipped'));
        btn(s.kind === 'say' ? 'Said it ✓' : 'Done ✓', 'primary', () => complete(s.kind === 'say' && R.heardAll ? 'heard' : 'done'));
        R.heardAll = false;
        if (listenOn && V.onState) V.onState(V.state);
      } else if (s.kind === 'pt' || s.kind === 'rn') {
        btn('←', 'narrow', back);
        btn('🔁 Again', 'narrow', () => V.speak(speakable(s.line), s.kind));
        btn('Next', 'primary', () => complete('done'));
        if (settings.speak && (V.ttsSupported || V.clips)) {
          V.speak(speakable(s.line), s.kind).then(() => { if (cur() === s) advT = setTimeout(() => { if (cur() === s) complete('done'); }, 700); });
        }
      } else if (s.kind === 'cb') {
        if (settings.speak && (V.ttsSupported || V.clips) && s.line) V.speak(speakable(s.line), s.who === 'rn' ? 'rn' : 'pt');
        view.querySelectorAll('.stage .opt').forEach(b => b.onclick = () => {
          if (b.disabled) return;
          const ok = b.dataset.k === '0';
          blip(ok);
          view.querySelectorAll('.stage .opt').forEach(x => { x.disabled = true; if (x.dataset.k === '0') x.classList.add('right'); else if (x === b) x.classList.add('wrong'); });
          $('#cbfb').innerHTML = `<div class="card ${ok ? 'good' : 'bad'} small"><b>${ok ? 'Safe call.' : 'Not safe.'}</b> ${esc(s.why)}<div class="chips">${srcChip(s.src)}</div></div>`;
          R.cbs.push({ id: s.id, ok, lines: s.lines });
          acts.innerHTML = ''; btn('Carry on', 'primary', () => complete(ok ? 'done' : 'missed'));
          acts.querySelector('.btn').focus();
        });
      }
    }
    function peek() {
      const s = cur(); const box = $('#peekbox'); if (!box) return;
      R.peeks++; peekLvl++;
      if (R.level === 'exam' && peekLvl === 1) { box.innerHTML = `<div class="bigt">${esc(s.t)}</div>`; return; }
      box.innerHTML = (R.level === 'exam' ? `<div class="bigt">${esc(s.t)}</div>` : '') + (s.cue ? `<p class="cue">${esc(s.cue)}</p>` : '') + (s.line ? `<div class="say">“${esc(s.line)}”</div>` : '');
      R.res[s.id] = Object.assign(R.res[s.id] || {}, { peek: true });
    }
    function onHeard(fin, interim) {
      const s = cur(); if (!s || s.kind !== 'say' || !s.keys) return;
      const h = $('#heard'); if (h) h.textContent = (fin + ' ' + interim).trim().slice(-90);
      const got = V.match(fin + ' ' + interim, s.keys);
      got.forEach((g, k) => { const c = view.querySelector(`[data-g="${k}"]`); if (c && g && !c.classList.contains('ok')) { c.classList.remove('wait'); c.classList.add('ok'); c.textContent = '✓ ' + c.textContent; } });
      if (got.length && got.every(Boolean)) {
        R.heardAll = true;
        clearTimeout(advT);
        advT = setTimeout(() => { if (cur() === s) { blip(true); complete('heard'); } }, 1300);
      }
    }
    function complete(status) {
      const s = cur(); if (!s) return;
      clearTimeout(advT);
      if (s.kind !== 'cb') R.res[s.id] = Object.assign(R.res[s.id] || {}, { status });
      V.stopSpeaking();
      R.i++;
      if (R.i >= R.seq.length) finish(); else render();
      window.scrollTo(0, 0);
    }
    function back() { clearTimeout(advT); V.stopSpeaking(); if (R.i > 0) { R.i--; render(); } }
    function finish() {
      clearInterval(timer); V.stopListening(); V.stopSpeaking(); releaseWake();
      R.secs = Math.round((Date.now() - R.start) / 1000);
      markView(R);
    }
    render();
  }

  /* ---------------- self-mark against the rubric ---------------- */
  function markView(R) {
    setHeader('Mark yourself', RUNS[R.run] + ' · ' + Math.floor(R.secs / 60) + ' min ' + (R.secs % 60) + ' s', true);
    const rub = D.RUBRIC[R.run];
    const marks = {};
    const stepsFor = id => R.seq.filter(s => s.kind !== 'cb' && (s.lines || []).includes(id));
    for (const sec of rub.sections) for (const [id] of sec.lines) {
      const ss = stepsFor(id);
      const skipped = ss.some(s => R.res[s.id] && R.res[s.id].status === 'skipped');
      const missedCb = R.cbs.some(c => !c.ok && (c.lines || []).includes(id));
      marks[id] = !(skipped || missedCb);
    }
    const why = id => {
      const ss = stepsFor(id).filter(s => R.res[s.id] && R.res[s.id].status === 'skipped').map(s => 'skipped: ' + s.t);
      const cb = R.cbs.filter(c => !c.ok && (c.lines || []).includes(id)).map(c => 'curveball missed');
      return ss.concat(cb).join(' · ');
    };
    function paint() {
      const all = Object.values(marks).every(Boolean);
      view.innerHTML = `
        <div class="card"><p class="small">Pre-filled from what you tapped and said. <b>The app can’t see your hands</b>, so go down the list like the assessor would and be honest. One ✗ anywhere means Not Met.</p>
        ${R.peeks ? `<p class="small">You peeked ${R.peeks} time${R.peeks > 1 ? 's' : ''}.</p>` : ''}
        ${R.cbs.length ? `<p class="small">Curveballs: ${R.cbs.filter(c => c.ok).length} of ${R.cbs.length} handled safely.</p>` : ''}</div>
        ${rub.sections.map(sec => `<div class="eyebrow">${esc(sec.h)}</div><div class="card">${sec.lines.map(([id, t]) => `
          <div class="rline"><div class="t">${esc(t)}${why(id) ? `<div class="small" style="color:var(--bad)">${esc(why(id))}</div>` : ''}</div>
          <div class="tog"><button class="y ${marks[id] ? 'on' : ''}" data-id="${id}" data-v="1" aria-label="Met">✓</button><button class="n ${marks[id] ? '' : 'on'}" data-id="${id}" data-v="0" aria-label="Not met">✗</button></div></div>`).join('')}</div>`).join('')}
        <div class="card ${all ? 'good' : 'bad'}"><div class="verdict ${all ? 'met' : 'nm'}">${all ? 'Met' : 'Not Met'}</div>
          <p class="small">${all ? 'Every line ticked.' : Object.values(marks).filter(v => !v).length + ' line(s) not met.'}</p></div>
        <div class="btns"><button class="btn primary block" id="save">Save this run</button></div>`;
      view.querySelectorAll('.tog button').forEach(b => b.onclick = () => { marks[b.dataset.id] = b.dataset.v === '1'; const y = window.scrollY; paint(); window.scrollTo(0, y); });
      $('#save').onclick = save;
    }
    function save() {
      const met = Object.values(marks).every(Boolean);
      const failed = Object.keys(marks).filter(k => !marks[k]);
      addLog({ type: 'live', t: new Date().toISOString(), run: R.run, drug: R.drug, level: R.level, secs: R.secs, peeks: R.peeks, cbs: R.cbs.map(c => ({ id: c.id, ok: c.ok })), met, failed });
      const li = LEVELS.findIndex(l => l[0] === R.level);
      const up = met && li < 2 ? LEVELS[li + 1] : null;
      const fixSteps = R.seq.filter(s => s.kind !== 'cb' && (s.lines || []).some(id => failed.includes(id)) && youStep(s));
      view.innerHTML = `<div class="card ${met ? 'good' : 'warn'}"><div class="verdict ${met ? 'met' : 'nm'}">${met ? 'Met ✓' : 'Not Met, this time'}</div>
        <p>${met ? (up ? 'Next time, step up to <b>' + up[1] + '</b>: ' + up[2] + '.' : 'Met at Exam level. That’s the real thing. Keep it warm with a run every day or two.') : 'Saved. Below are the steps that carry the lines you missed. Run them in “What’s next?” or read them in the walkthrough, then go again.'}</p>
        ${!met && fixSteps.length ? '<ul class="checklist">' + fixSteps.slice(0, 8).map(s => `<li><i>→</i><span>${esc(s.t)}</span></li>`).join('') + '</ul>' : ''}</div>
        <div class="btns">
          ${up ? `<button class="btn primary" id="up">Run again at ${up[1]}</button>` : `<button class="btn primary" id="again">Run again</button>`}
          <button class="btn" data-go="#walk/${R.run}">Walkthrough</button>
          <button class="btn" data-go="#home">Home</button></div>`;
      const u = $('#up'); if (u) u.onclick = () => { settings.level = up[0]; saveSettings(); location.hash = '#setup/' + R.run; };
      const a = $('#again'); if (a) a.onclick = () => { location.hash = '#setup/' + R.run; };
      view.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { location.hash = b.dataset.go; });
    }
    paint();
  }

  /* ---------------- "The RN asks…" question drill ---------------- */
  const RNQ = window.CLS_RNQ || [];
  const rnqStats = () => store.get('rnq', {});
  function rnqPool(run, drug) {
    return RNQ.filter(q => (q.run === run || q.run === 'both') && (!q.drug || !drug || drug === 'both' || q.drug === drug));
  }
  function rnqLine(run) {
    const pool = rnqPool(run, 'both'), st = rnqStats();
    const solid = pool.filter(q => st[q.id] && (st[q.id].streak || 0) >= 2).length;
    return solid ? `${solid} of ${pool.length} solid (right twice in a row)` : `${pool.length} questions ${run === 'vs' ? 'your preceptor' : 'your RN'} could ask`;
  }
  function rnqView(run, mode) {
    const RN = run === 'vs' ? 'Your preceptor' : 'Your RN';
    setHeader('The RN asks…', RUNS[run], true);
    if (!mode) {
      const st = rnqStats();
      const drugSeg = run === 'ma' ? `<div class="field"><label>Which drug?</label><div class="seg" data-seg="rnqDrug">${[['both', 'Both'], ['para', 'Paracetamol'], ['meto', 'Metoprolol']].map(([v, l]) => `<button data-v="${v}" class="${(settings.rnqDrug || 'both') === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>` : '';
      const pool = rnqPool(run, settings.rnqDrug || 'both');
      const topics = [...new Set(pool.map(q => q.topic))];
      view.innerHTML = `
        <div class="card"><b>${RN} will ask you things during the assessment.</b><p class="small">In Janine’s demo, Joan asked for every normal range and “what’s your responsibility if one is abnormal?”. Joan’s med admin brief says the RN asks you to describe Ask, Build, Check at the end. Answer short: one fact a line.</p></div>
        ${drugSeg}
        <button class="row" data-mode="say"><span class="ic">🎙️</span><span class="tx"><b>Say it</b><span>${RN} asks out loud; you answer out loud${V.srSupported ? ' and the mic ticks your key points' : ' (tap to reveal; the mic needs Chrome)'}</span></span><span class="go">›</span></button>
        <button class="row" data-mode="pick"><span class="ic">👆</span><span class="tx"><b>Pick</b><span>Same questions, four options, instant feedback</span></span><span class="go">›</span></button>
        <button class="row" data-mode="read"><span class="ic">📖</span><span class="tx"><b>Read them all</b><span>Every question with its short answer and source</span></span><span class="go">›</span></button>
        <div class="eyebrow">What’s in it</div>
        <div class="card">${topics.map(t => { const qs = pool.filter(q => q.topic === t); const solid = qs.filter(q => st[q.id] && (st[q.id].streak || 0) >= 2).length; return `<div class="rline"><div class="t"><b>${esc(t)}</b><div class="small muted">${qs.length} questions · ${solid} solid</div></div></div>`; }).join('')}</div>
        <p class="small faint">A session is 10 questions, weakest first: ones you’ve missed, then ones you haven’t seen. “Solid” means right twice in a row.</p>`;
      view.querySelectorAll('[data-seg]').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => { settings.rnqDrug = b.dataset.v; saveSettings(); route(); }));
      view.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { location.hash = '#rnq/' + run + '/' + b.dataset.mode; });
      return;
    }
    const pool = rnqPool(run, settings.rnqDrug || 'both');
    if (mode === 'read') {
      setHeader('The RN asks…', RUNS[run] + ' · all ' + pool.length, true);
      const topics = [...new Set(pool.map(q => q.topic))];
      view.innerHTML = topics.map(t => `<div class="phase"><h3>${esc(t)}</h3></div>` + pool.filter(q => q.topic === t).map(q => `
        <div class="step"><div class="hd"><span class="who rn">${RN}</span><button class="play" data-say="${q.id}" aria-label="Hear the question">▶</button></div>
        <p class="cue"><b>${esc(q.q)}</b></p><div class="say">${esc(q.a).replace(/\n/g, '<br>')}</div><div class="chips">${srcChip(q.src)}</div></div>`).join('')).join('');
      view.querySelectorAll('[data-say]').forEach(b => b.onclick = () => { V.stopSpeaking(); const q = RNQ.find(x => x.id === b.dataset.say); V.speak(speakable(q.q), 'rn'); });
      return;
    }
    // a session: 10 questions, weakest first
    const st = rnqStats();
    const score = q => { const s = st[q.id]; if (!s) return 1 + Math.random() * 0.5; return (s.streak || 0) * 2 - (s.wrong || 0) + Math.random() * 0.5 + (s.streak >= 2 ? 3 : 0); };
    const set = pool.slice().sort((a, b) => score(a) - score(b)).slice(0, 10);
    const S = { i: 0, right: 0, missed: [], revealed: false };
    const listenOn = mode === 'say' && settings.listen && V.srSupported;
    let advT = null;
    cleanup = () => { clearTimeout(advT); };
    if (listenOn) {
      V.onHeard = (fin, interim) => {
        const q = set[S.i]; if (!q || S.revealed) return;
        const h = $('#heard'); if (h) h.textContent = (fin + ' ' + interim).trim().slice(-90);
        const got = V.match(fin + ' ' + interim, q.keys);
        got.forEach((g, k) => { const c = view.querySelector(`[data-g="${k}"]`); if (c && g && !c.classList.contains('ok')) { c.classList.remove('wait'); c.classList.add('ok'); c.textContent = '✓ ' + c.textContent; } });
        if (got.length && got.every(Boolean)) { clearTimeout(advT); advT = setTimeout(() => { if (set[S.i] === q && !S.revealed) { blip(true); reveal(true); } }, 1200); }
      };
      V.onState = s => { const lab = $('#micLab'); if (lab) lab.textContent = s === 'on' ? 'Listening…' : s === 'paused' ? 'Paused while the RN talks' : s === 'denied' ? 'Mic blocked: tap “Show answer” instead' : s === 'error' ? 'Needs internet: tap “Show answer”' : 'Mic off'; const m = $('#mic'); if (m) m.classList.toggle('on', s === 'on'); };
      V.listen();
    }
    function render() {
      clearTimeout(advT); S.revealed = false;
      const q = set[S.i]; if (!q) return done();
      V.clearHeard();
      const pct = Math.round(100 * S.i / set.length);
      let body = `<span class="who rn">${RN}</span><div class="bigt">${esc(q.q)}</div>`;
      if (mode === 'pick') {
        body += shuffle(q.opts.map((o, k) => ({ o, k }))).map(x => `<button class="opt" data-k="${x.k}">${esc(x.o)}</button>`).join('') + '<div id="fb"></div>';
      } else {
        body += listenOn ? `<div class="keys">${q.keys.map((g, k) => `<span class="chip wait" data-g="${k}">key point ${k + 1}</span>`).join('')}</div>
          <div class="mic" id="mic"><span class="dot"></span><span id="micLab">Listening…</span><span class="heard" id="heard"></span></div>` : '<p class="small muted">Say your answer out loud, then show the answer.</p>';
        body += '<div id="fb"></div>';
      }
      view.innerHTML = `<div class="live-top"><span>${esc(q.topic)}</span><span class="sp"></span><span class="num">${S.i + 1}/${set.length}</span></div>
        <div class="progress"><i style="width:${pct}%"></i></div><div class="stage">${body}</div><div class="live-actions" id="acts"></div>`;
      const acts = $('#acts');
      if (mode === 'pick') {
        view.querySelectorAll('.stage .opt').forEach(b => b.onclick = () => {
          if (S.revealed) return;
          const ok = b.dataset.k === '0';
          view.querySelectorAll('.stage .opt').forEach(x => { x.disabled = true; if (x.dataset.k === '0') x.classList.add('right'); else if (x === b) x.classList.add('wrong'); });
          reveal(ok);
        });
        if (settings.speak && (V.ttsSupported || V.clips)) V.speak(speakable(q.q), 'rn');
      } else {
        const sb = document.createElement('button'); sb.className = 'btn primary'; sb.textContent = 'Show answer'; sb.onclick = () => reveal(null); acts.appendChild(sb);
        const rb = document.createElement('button'); rb.className = 'btn narrow'; rb.textContent = '🔁'; rb.setAttribute('aria-label', 'Hear the question again'); rb.onclick = () => V.speak(speakable(q.q), 'rn'); acts.prepend(rb);
        if (V.ttsSupported || V.clips) V.speak(speakable(q.q), 'rn');
      }
    }
    function reveal(ok) {
      if (S.revealed) return; S.revealed = true; clearTimeout(advT);
      const q = set[S.i];
      const fb = $('#fb'), acts = $('#acts');
      const ans = `<div class="say" style="font-style:normal">${esc(q.a).replace(/\n/g, '<br>')}</div><div class="chips">${srcChip(q.src)}</div>`;
      if (ok !== null) {
        blip(ok);
        fb.innerHTML = `<div class="card ${ok ? 'good' : 'bad'}"><b>${ok ? 'Yes.' : 'Not quite. The short answer:'}</b>${ans}</div>`;
        record(q, ok);
        acts.innerHTML = '';
        const nb = document.createElement('button'); nb.className = 'btn primary'; nb.textContent = S.i + 1 < set.length ? 'Next' : 'See how you did'; nb.onclick = next; acts.appendChild(nb); nb.focus();
      } else {
        fb.innerHTML = `<div class="card"><b>The short answer:</b>${ans}<p class="small muted">Did you say that, in your own words?</p></div>`;
        acts.innerHTML = '';
        const y = document.createElement('button'); y.className = 'btn good'; y.textContent = 'I got it ✓'; y.onclick = () => { record(q, true); next(); };
        const n = document.createElement('button'); n.className = 'btn bad'; n.textContent = 'Missed it ✗'; n.onclick = () => { record(q, false); next(); };
        acts.appendChild(n); acts.appendChild(y);
      }
    }
    function record(q, ok) {
      const all = rnqStats(); const s = all[q.id] || { seen: 0, right: 0, wrong: 0, streak: 0 };
      s.seen++; if (ok) { s.right++; s.streak = (s.streak || 0) + 1; S.right++; } else { s.wrong++; s.streak = 0; S.missed.push(q.id); }
      s.last = Date.now(); all[q.id] = s; store.set('rnq', all);
    }
    function next() { V.stopSpeaking(); S.i++; render(); window.scrollTo(0, 0); }
    function done() {
      V.stopListening();
      addLog({ type: 'rnq', t: new Date().toISOString(), run, mode, total: set.length, right: S.right, missed: S.missed });
      const pass = set.length >= 8 && S.right / set.length >= 0.8;
      view.innerHTML = `<div class="card ${pass ? 'good' : 'warn'}"><div class="verdict ${pass ? 'met' : ''}">${S.right} / ${set.length}</div>
        <p>${pass ? 'Solid. Next session serves the ones you’re least sure of.' : 'Saved. The ones you missed come back first next time.'}</p>
        ${S.missed.length ? '<div class="eyebrow">Missed: the short answers</div>' + S.missed.map(id => { const q = RNQ.find(x => x.id === id); return `<div class="step"><p class="cue"><b>${esc(q.q)}</b></p><div class="say" style="font-style:normal">${esc(q.a).replace(/\n/g, '<br>')}</div></div>`; }).join('') : ''}</div>
        <div class="btns"><button class="btn primary" id="again">Another 10</button><button class="btn" data-go="#home">Home</button></div>`;
      $('#again').onclick = () => route();
      view.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { location.hash = b.dataset.go; });
    }
    render();
  }

  /* ---------------- rubric (read-only) ---------------- */
  function rubricView(run) {
    const rub = D.RUBRIC[run];
    setHeader('Marking sheet', RUNS[run], true);
    const S = steps(run, 'para');
    view.innerHTML = `<div class="card"><b>${esc(rub.title)}</b><p class="small">${esc(rub.rule)}</p><div class="chips">${srcChip([run === 'vs' ? 'rub-vs' : 'rub-ma', 'verbatim'])}</div></div>
      ${rub.sections.map(sec => `<div class="eyebrow">${esc(sec.h)}</div><div class="card">${sec.lines.map(([id, t]) => {
        const by = S.filter(s => (s.lines || []).includes(id) && youStep(s));
        return `<div class="rline"><div class="t">${esc(t)}<div class="small muted">${by.length ? 'Earned by: ' + by.map(s => esc(s.t)).join(' · ') : ''}</div></div></div>`;
      }).join('')}</div>`).join('')}
      ${run === 'ma' ? `<div class="eyebrow">The two drugs</div>${['para', 'meto'].map(k => { const d = D.DRUGS[k]; return `<div class="card"><b>${esc(d.order)}</b>
        <p class="small"><b>Generic:</b> ${esc(d.generic)} (brands: ${esc(d.brands)}) · <b>Class:</b> ${esc(d.klass)}</p>
        <p class="small"><b>For Mr Luke:</b> ${esc(d.indication)} · <b>Dose:</b> ${esc(d.tabs)} · <b>Frequency:</b> ${esc(d.freq)}</p>
        <p class="small"><b>Common adverse effects:</b> ${esc(d.adverse)}</p>
        <p class="small"><b>Right time:</b> ${esc(d.lastDose)}</p>
        <ul class="checklist small">${d.considerations.map(c => `<li><i>•</i><span>${esc(c)}</span></li>`).join('')}</ul>
        <div class="chips">${d.src.map(srcChip).join('')}</div></div>`; }).join('')}`
        : `<div class="eyebrow">Normal adult ranges (say ALL of them to the RN)</div><div class="card">${D.NORMALS.map(n => `<div class="rline"><div class="t"><b>${esc(n.name)}: ${esc(n.range)}</b><div class="small muted">${esc(n.extra)}</div><div class="chips">${srcChip(n.src)}</div></div></div>`).join('')}</div>`}`;
  }

  /* ---------------- log ---------------- */
  function logView() {
    setHeader('Your log', 'Stays on this phone', true);
    const L = log().slice().reverse();
    if (!L.length) { view.innerHTML = '<div class="card flat"><b>Nothing logged yet.</b><p class="small muted">Every drill, live run and BP Lab reading lands here.</p></div>'; return; }
    const fmt = t => new Date(t).toLocaleString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    view.innerHTML = L.slice(0, 120).map(e => {
      if (e.type === 'live') return `<div class="row"><span class="ic">${e.met ? '✅' : '❌'}</span><span class="tx"><b>${esc(RUNS[e.run])} · ${esc(e.level)}${e.drug ? ' · ' + esc(D.DRUGS[e.drug].generic) : ''}</b><span>${fmt(e.t)} · ${Math.round(e.secs / 60)} min · ${e.met ? 'Met' : (e.failed || []).length + ' line(s) not met'}${e.peeks ? ' · ' + e.peeks + ' peeks' : ''}</span></span></div>`;
      if (e.type === 'order') return `<div class="row"><span class="ic">🔢</span><span class="tx"><b>What’s next? · ${esc(RUNS[e.run])} · ${esc(e.scope)}</b><span>${fmt(e.t)} · ${e.total - e.misses}/${e.total} first time</span></span></div>`;
      if (e.type === 'chart') return `<div class="row"><span class="ic">${e.run === 'vs' ? '📝' : '✍️'}</span><span class="tx"><b>${e.run === 'vs' ? 'Chart it' : 'Sign the med chart'}${e.kind ? ' · ' + esc(e.kind) : ''}</b><span>${fmt(e.t)} · ${e.right}/${e.total}</span></span></div>`;
      if (e.type === 'cuff') return `<div class="row"><span class="ic">${e.first ? '🎯' : '🔁'}</span><span class="tx"><b>Real cuff · ${e.first ? 'first try' : 'took more than one go'}${e.mine ? ' · ' + esc(e.mine) : ''}</b><span>${fmt(e.t)}${(e.problems || []).length ? ' · ' + esc(e.problems.join(', ')) : ''}</span></span></div>`;
      if (e.type === 'rnq') return `<div class="row"><span class="ic">🗣️</span><span class="tx"><b>The RN asks… · ${esc(RUNS[e.run])} · ${esc(e.mode)}</b><span>${fmt(e.t)} · ${e.right}/${e.total} right</span></span></div>`;
      if (e.type === 'bp') return `<div class="row"><span class="ic">${e.ok ? '🎯' : '🎚️'}</span><span class="tx"><b>BP Lab · you read ${esc(e.you)} (true ${esc(e.truth)})</b><span>${fmt(e.t)} · ${esc(e.note || '')}</span></span></div>`;
      return '';
    }).join('') + `<div class="btns"><button class="btn bad" id="wipe">Clear my log</button></div>`;
    $('#wipe').onclick = () => { if (confirm('Clear every logged run and drill on this phone?')) { store.set('log', []); store.set('drill', {}); store.set('seen', {}); route(); } };
  }

  /* ---------------- stage 3: Chart it, Sign the med chart, Real cuff ---------------- */
  const chartApi = () => ({ D, esc, srcChip, blip, toast, shuffle, addLog, log, store });
  function chartView(kind) {
    if (kind === 'ma') return chartSimCard();
    setHeader('Chart it', kind === 'read' ? 'Read the chart · Janine’s slides 38–39' : 'NZ adult vital signs chart', true);
    if (kind === 'read') window.CLS_CHART.mountRead(view, chartApi()); else window.CLS_CHART.mountVS(view, chartApi());
  }
  /* Signing the med chart lives in Chart Sim (pharm-final/chart.html): the NZ 8-Day National Medication Chart redrawn box
     for box, with Mr Luke added as a patient (8 Oct 2026). One chart, one place: this card just opens it. */
  const CHART_SIM = 'https://jeremyspm.github.io/pharm-final/chart.html#luke';
  function chartSimCard() {
    setHeader('Sign the med chart', 'Mr Luke’s real 8-day chart, in Chart Sim', true);
    view.innerHTML = `
      <div class="card"><b>Mr Luke is a patient in Chart Sim.</b>
        <p class="small">Chart Sim is the NZ 8-Day National Medication Chart redrawn box for box: the same chart as Mr Luke’s on Canvas. His page has his real details (NHI DGY 2963, Dr Penny Black, Janine Craig “JC” in the sample initials) and the two new orders from your CLS brief.</p>
        <ul class="checklist small">
          <li><i>1</i><span><b>Read:</b> questions from his chart (NHI, allergies, what’s due, the 4 g maximum…)</span></li>
          <li><i>2</i><span><b>Chart it:</b> four rounds: sign your metoprolol with Janine’s check · his first paracetamol · pulse 52, so <b>W</b> (withheld) · he refuses, so <b>R</b></span></li>
        </ul>
        <p class="small muted">Tap to fill, or write with your finger or a pen. It marks the right box, the right day and time, your initials AND the RN’s check.</p></div>
      <div class="btns"><a class="btn primary block" id="openCS" href="${CHART_SIM}">Open Mr Luke’s chart</a></div>
      <div class="card small"><b>Why there and not here?</b> Chart Sim already is a one-to-one copy of the chart you’ll sign, with 10 other patients your cohort uses. One chart, kept right in one place.</div>`;
    $('#openCS').onclick = () => markSeen('chartsim');
  }
  function cuffView() {
    setHeader('Real cuff', 'Your own readings, logged', true);
    window.CLS_CHART.mountCuff(view, chartApi());
  }

  /* ---------------- BP Lab ---------------- */
  function bpView() {
    setHeader('BP Lab', 'Two-step blood pressure', true);
    cleanup = window.CLS_BP.mount(view, {
      blip, toast, srcChip, esc,
      onResult: r => addLog(Object.assign({ type: 'bp', t: new Date().toISOString() }, r)),
    });
  }

  /* ---------------- offline ---------------- */
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { }); });
  }
  window.CLS_APP = { steps, fill, plan, D };
  route();
})();
