/* bp.js — BP Lab: the two-step manual blood pressure on a simulated aneroid gauge.
   Step 1: feel the pulse (the phone buzzes each beat while cuff pressure < systolic), pump past where it vanishes, +30,
           let it down, tap when the pulse comes back = estimated systolic. Deflate fully, wait 30 s.
   Step 2: stethoscope ON first, pump to estimate + 30, release 2–3 mmHg/s, tap the first sound and where it disappears.
   The physics are deliberately simple; what it trains is ORDER, VALVE CONTROL and LISTENING. */
(function () {
  'use strict';

  const MAXP = 300, A0 = -135, A1 = 135; // gauge sweep in degrees

  function mount(root, api) {
    const { blip, toast, srcChip, esc } = api;
    const opts = Object.assign({ coach: true, digital: true, faults: false }, load());
    let S, raf = 0, actx = null, master = null;

    function load() { try { return JSON.parse(localStorage.getItem('cls.bpopts') || '{}'); } catch (e) { return {}; } }
    function saveOpts() { try { localStorage.setItem('cls.bpopts', JSON.stringify(opts)); } catch (e) { } }
    const even = x => Math.round(x / 2) * 2;
    const rnd = (a, b) => a + Math.random() * (b - a);

    function newPatient() {
      const r = Math.random();
      let sbp, dbp;
      if (r < 0.6) { sbp = rnd(108, 138); dbp = rnd(62, 86); }
      else if (r < 0.85) { sbp = rnd(142, 178); dbp = rnd(86, 102); }
      else { sbp = rnd(92, 106); dbp = rnd(52, 62); }
      sbp = even(sbp); dbp = even(Math.min(dbp, sbp - 28));
      const fault = opts.faults ? ['none', 'closed', 'ears', 'small'][Math.floor(Math.random() * 4)] : 'none';
      return {
        sbp, dbp, hr: Math.round(rnd(58, 94)), fault,
        phase: 'setup', p: 0, valve: 0, setup: {}, smallFixed: false,
        est: null, peak1: 0, deflatedAt: null, stethOn: false, chestOpen: fault !== 'closed', earsOk: fault !== 'ears',
        target: null, peak2: 0, sys: null, dia: null, errors: [], notes: [], congest: 1, pumps2: 0,
        rateHist: [], lastT: performance.now(), nextBeat: performance.now() + 400, listenRates: [],
      };
    }

    /* ---------- audio: one thump per heartbeat while Korotkoff sounds are present ---------- */
    function audio() {
      if (!actx) {
        try {
          actx = new (window.AudioContext || window.webkitAudioContext)();
          master = actx.createGain(); master.gain.value = 0.9; master.connect(actx.destination);
        } catch (e) { actx = null; }
      }
      if (actx && actx.state === 'suspended') actx.resume();
      return actx;
    }
    function thump(amp, muffled) {
      const a = audio(); if (!a || amp <= 0) return;
      const t = a.currentTime;
      const o = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter();
      o.type = 'sine'; o.frequency.setValueAtTime(muffled ? 52 : 70, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
      f.type = 'lowpass'; f.frequency.value = muffled ? 140 : 900;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.002, amp), t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + (muffled ? 0.16 : 0.11));
      o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + 0.2);
      if (!muffled) { // the sharp "tap" edge of phase I / III
        const len = Math.floor(a.sampleRate * 0.02), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
        const n = a.createBufferSource(), ng = a.createGain(), bp = a.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 180; bp.Q.value = 1.2; n.buffer = buf; ng.gain.value = amp * 0.9;
        n.connect(bp).connect(ng).connect(master); n.start(t);
      }
    }
    function korotkoffAmp(p) {
      const { sbp, dbp } = S;
      const sbpEff = S.fault === 'small' && !S.smallFixed ? sbp + 12 : sbp;
      const dbpEff = S.fault === 'small' && !S.smallFixed ? dbp + 8 : dbp;
      if (p >= sbpEff || p <= dbpEff) return 0;
      const x = (sbpEff - p) / (sbpEff - dbpEff); // 0 at systolic → 1 at diastolic
      let a = x < 0.12 ? 0.55 : x < 0.45 ? 0.35 : x < 0.8 ? 0.75 : 0.25; // phase I tap, II swish, III crisp, IV muffled
      return a;
    }
    const effSbp = () => (S.fault === 'small' && !S.smallFixed ? S.sbp + 12 : S.sbp);
    const effDbp = () => (S.fault === 'small' && !S.smallFixed ? S.dbp + 8 : S.dbp);

    /* ---------- the loop ---------- */
    function rateOf(v) { return v < 3 ? 0 : v >= 99 ? 140 : 0.5 * Math.pow(1.055, v); }
    function tick(now) {
      const dt = Math.min(0.1, (now - S.lastT) / 1000); S.lastT = now;
      const before = S.p;
      S.p = Math.max(0, S.p - (rateOf(S.valve) + (S.p > 0 ? 0.08 : 0)) * dt);
      const drop = (before - S.p) / (dt || 1);
      S.rateHist.push([now, before - S.p]); while (S.rateHist.length && now - S.rateHist[0][0] > 1500) S.rateHist.shift();
      if (now >= S.nextBeat) {
        S.nextBeat = now + 60000 / S.hr;
        beat();
      }
      if (S.phase === 'wait' && S.p < 2 && S.deflatedAt == null) { S.deflatedAt = now; }
      draw(drop);
      raf = requestAnimationFrame(tick);
    }
    function beat() {
      const pulseFelt = (S.phase === 'palp' || S.phase === 'setup') && S.p < effSbp();
      const dot = root.querySelector('.beat');
      if (dot && (S.phase === 'palp')) {
        if (pulseFelt) { dot.classList.add('on'); setTimeout(() => dot.classList.remove('on'), 120); if (navigator.vibrate && opts.buzz !== false) try { navigator.vibrate(28); } catch (e) { } }
      }
      if (S.phase === 'listen' && S.stethOn) {
        let amp = korotkoffAmp(S.p) * S.congest;
        if (!S.chestOpen) amp = 0;
        if (!S.earsOk) amp *= 0.22;
        if (amp > 0) { thump(amp, korotkoffAmp(S.p) < 0.3); const e = root.querySelector('#ear'); if (e) { e.classList.add('on'); setTimeout(() => e.classList.remove('on'), 110); } }
      }
    }

    /* ---------- drawing ---------- */
    function gaugeSvg() {
      const cx = 160, cy = 160, r = 140;
      let ticks = '';
      for (let v = 0; v <= MAXP; v += 2) {
        const a = (A0 + (A1 - A0) * v / MAXP) * Math.PI / 180;
        const major = v % 20 === 0, mid = v % 10 === 0;
        const r1 = r - (major ? 16 : mid ? 11 : 6);
        ticks += `<line class="tick ${major ? 'major' : ''}" x1="${(cx + r * Math.sin(a)).toFixed(1)}" y1="${(cy - r * Math.cos(a)).toFixed(1)}" x2="${(cx + r1 * Math.sin(a)).toFixed(1)}" y2="${(cy - r1 * Math.cos(a)).toFixed(1)}"/>`;
        if (major) ticks += `<text x="${(cx + (r - 30) * Math.sin(a)).toFixed(1)}" y="${(cy - (r - 30) * Math.cos(a) + 4).toFixed(1)}">${v}</text>`;
      }
      return `<svg class="gauge" viewBox="0 0 320 320" role="img" aria-label="Pressure gauge">
        <circle class="face" cx="160" cy="160" r="152"/>${ticks}
        <text x="160" y="232" style="font-size:12px">mmHg</text>
        <text class="read" id="gread" x="160" y="262"></text>
        <line class="needle" id="needle" x1="160" y1="160" x2="160" y2="34"/>
        <circle class="hub" cx="160" cy="160" r="7"/></svg>`;
    }
    function draw(drop) {
      const n = root.querySelector('#needle'); if (!n) return;
      const a = A0 + (A1 - A0) * Math.min(S.p, MAXP) / MAXP;
      n.setAttribute('transform', `rotate(${a.toFixed(2)} 160 160)`);
      const g = root.querySelector('#gread'); if (g) g.textContent = opts.digital ? Math.round(S.p) : '';
      const rt = root.querySelector('#rate');
      if (rt) {
        const sum = S.rateHist.reduce((s, x) => s + x[1], 0), span = S.rateHist.length > 1 ? (S.rateHist[S.rateHist.length - 1][0] - S.rateHist[0][0]) / 1000 : 0;
        const r = span > 0.4 ? sum / span : 0;
        // only while actually listening between pump-up and the last tap; ignore "release all" dumps
        if (S.phase === 'listen' && S.p > 0 && r > 0.3 && r < 40 && S.peak2 > 0 && S.dia == null) S.listenRates.push(r);
        if (r < 0.3 || S.p < 1) { rt.textContent = S.p > 0 ? 'Valve closed: holding' : ''; rt.className = 'rate'; }
        else if (r > 60) { rt.textContent = 'Releasing everything'; rt.className = 'rate'; }
        else { rt.textContent = r.toFixed(1) + ' mmHg/s ' + (r > 4 ? '· too fast' : r < 1.5 ? '· a bit slow' : '· good'); rt.className = 'rate ' + (r > 4 ? 'fast' : r < 1.5 ? 'slow' : 'ok'); }
      }
      const w = root.querySelector('#waitT');
      if (w && S.phase === 'wait') {
        if (S.deflatedAt == null) w.textContent = 'Let ALL the air out first.';
        else { const left = Math.max(0, 30 - (performance.now() - S.deflatedAt) / 1000); w.textContent = left > 0 ? 'Waiting… ' + Math.ceil(left) + ' s' : 'Thirty seconds up. Ready for step 2.'; }
      }
    }

    /* ---------- screens ---------- */
    function shell(inner) {
      root.innerHTML = `
        <div class="card small">${opts.coach ? 'Coach mode: hints and targets shown.' : 'Real mode: no hints.'} Use headphones for the taps. ${navigator.vibrate ? 'Your phone buzzes with each pulse beat in step 1.' : 'Watch the dot for the pulse in step 1 (this browser can’t buzz).'}</div>
        <div class="bp-wrap"><div>${gaugeSvg()}<div class="rate" id="rate"></div></div><div id="pane">${inner}</div></div>
        <div class="btns"><button class="btn sm" id="optCoach">${opts.coach ? '🧑‍🏫 Coach: on' : '🧑‍🏫 Coach: off'}</button><button class="btn sm" id="optDig">${opts.digital ? '🔢 Number: on' : '🔢 Number: off'}</button><button class="btn sm" id="optFault">${opts.faults ? '🧨 Problems: on' : '🧨 Problems: off'}</button></div>
        <p class="small faint">Method: Potter &amp; Perry two-step (palpate, +30, deflate fully, wait 30 s, auscultate at 2–3 mmHg/s), as in Janine’s demo video at 07:46–09:16. The numbers are simulated. This trains the order, the valve and your ears, not your real reading.</p>`;
      root.querySelector('#optCoach').onclick = () => { opts.coach = !opts.coach; saveOpts(); render(); };
      root.querySelector('#optDig').onclick = () => { opts.digital = !opts.digital; saveOpts(); render(); };
      root.querySelector('#optFault').onclick = () => { opts.faults = !opts.faults; saveOpts(); toast(opts.faults ? 'Next patient may come with a problem: a closed chest piece, earpieces backwards, or a cuff that’s too small.' : 'Problems off.', 4200); };
    }
    function controls(extra) {
      return `<div class="bp-controls" style="margin-top:10px">
          <button class="btn primary" id="pump">Squeeze bulb</button>
          <button class="btn" id="dump">Release all</button></div>
        <label class="small muted" for="valve" style="display:block;margin-top:10px">Valve: closed ← → open</label>
        <input class="valve" id="valve" type="range" min="0" max="100" step="1" value="${S.valve}">
        ${extra || ''}`;
    }
    function wireControls() {
      const pump = root.querySelector('#pump'), valve = root.querySelector('#valve'), dump = root.querySelector('#dump');
      let rep = null;
      const once = () => {
        audio();
        if (S.phase === 'wait' || (S.phase === 'listen' && !S.stethOn)) return stethError();
        if (S.phase === 'setup') { toast('Finish the set-up first.'); return; }
        S.p = Math.min(MAXP, S.p + 11 * (S.valve > 30 ? 0.5 : 1));
        if (S.phase === 'palp') S.peak1 = Math.max(S.peak1, S.p);
        if (S.phase === 'listen') S.peak2 = Math.max(S.peak2, S.p);
      };
      if (pump) {
        pump.onpointerdown = e => { e.preventDefault(); if (S.valve > 3) { valve.value = 0; S.valve = 0; } once(); clearInterval(rep); rep = setInterval(once, 260); };
        const stop = () => clearInterval(rep);
        pump.onpointerup = stop; pump.onpointerleave = stop; pump.onpointercancel = stop;
      }
      if (valve) valve.oninput = () => { S.valve = +valve.value; };
      if (dump) dump.onclick = () => { S.valve = 100; if (valve) valve.value = 100; };
    }
    function stethError() {
      if (!S.errors.includes('steth')) { S.errors.push('steth'); blip(false); }
      const p = root.querySelector('#warn');
      if (p) p.innerHTML = `<div class="card bad"><b>Stop. That’s the exact thing you were pulled up on.</b><p class="small">In step 2 the stethoscope goes on the brachial artery BEFORE you pump. Put it on first.</p></div>`;
    }

    function render() {
      const ph = S.phase;
      if (ph === 'setup') {
        const items = [
          ['arm', 'Arm bare, supported at heart level, palm up', 'He’s sitting, feet flat, not talking.'],
          ['size', 'Check the cuff size', S.fault === 'small' ? 'The range lines DON’T cover his arm.' : 'The range lines cover his arm. Good fit.'],
          ['feel', 'Find the brachial artery', 'Inside of the elbow crease. Feel it.'],
          ['wrap', 'Wrap the cuff: artery marker on the brachial, 2–3 cm above the crease, snug', 'Fully deflated before you wrap.'],
        ];
        shell(`<h3 style="margin-top:0">Set up</h3><p class="small muted">Tap each one as you do it on the person (or a pillow).</p>
          ${items.map(([k, t, d]) => `<button class="row" data-k="${k}"><span class="ic">${S.setup[k] ? '✅' : '⬜️'}</span><span class="tx"><b>${esc(t)}</b><span>${S.setup[k] ? esc(d) : ''}</span></span></button>`).join('')}
          ${S.setup.size && S.fault === 'small' && !S.smallFixed ? `<div class="card warn small"><b>Too small.</b> A small cuff reads falsely HIGH. <button class="btn sm" id="swap">Swap to the larger cuff</button></div>` : ''}
          <div class="btns"><button class="btn primary block" id="go1" ${Object.keys(S.setup).length < 4 ? 'disabled' : ''}>Start step 1: feel the pulse</button></div>`);
        root.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { S.setup[b.dataset.k] = true; render(); });
        const sw = root.querySelector('#swap'); if (sw) sw.onclick = () => { S.smallFixed = true; S.notes.push('swapped to the larger cuff'); toast('Larger cuff on.'); render(); };
        root.querySelector('#go1').onclick = () => { if (S.fault === 'small' && !S.smallFixed) S.notes.push('used the small cuff'); S.phase = 'palp'; audio(); render(); };
      } else if (ph === 'palp') {
        shell(`<h3 style="margin-top:0">Step 1: estimate by feel</h3>
          <p class="small">${opts.coach ? 'Fingers on the radial pulse (it buzzes). Pump until it disappears, then 30 more. Open the valve slowly and tap the moment it comes back.' : 'Estimate the systolic by palpation.'}</p>
          <div class="pulsebox"><span class="beat"></span><span id="pulseLab">Radial pulse</span></div>
          ${controls()}
          <div id="warn"></div>
          <div class="btns"><button class="btn good block" id="back">Pulse is back ✓</button></div>`);
        wireControls();
        root.querySelector('#back').onclick = () => {
          if (S.peak1 < effSbp()) { toast('You haven’t pumped past where the pulse disappears yet.'); return; }
          if (S.p >= effSbp()) { blip(false); S.notes.push('tapped “pulse back” before it was back'); toast('Not yet. The pulse isn’t back. Keep releasing slowly.'); return; }
          S.est = even(S.p);
          if (S.peak1 < effSbp() + 20) S.notes.push('step 1 pumped only ' + Math.round(S.peak1 - effSbp()) + ' past the vanish point (aim +30)');
          blip(true); S.phase = 'wait'; render();
        };
      } else if (ph === 'wait') {
        shell(`<h3 style="margin-top:0">Deflate fully, then wait 30 s</h3>
          <p>Your estimate: <b class="num">${S.est}</b> mmHg. ${opts.coach ? 'So step 2 pumps to <b class="num">' + (S.est + 30) + '</b>.' : ''}</p>
          <p class="small" id="waitT"></p>
          ${controls(`<div class="btns"><button class="btn primary block" id="steth">🩺 Stethoscope on: earpieces forward, chest piece on the brachial</button></div>`)}
          <div id="warn"></div>`);
        wireControls();
        root.querySelector('#steth').onclick = () => {
          const waited = S.deflatedAt != null ? (performance.now() - S.deflatedAt) / 1000 : 0;
          if (S.p > 2) { toast('Let all the air out first.'); return; }
          if (waited < 30) { S.notes.push('started step 2 after ' + Math.round(waited) + ' s (wait 30)'); S.congest *= 0.7; toast('That was ' + Math.round(waited) + ' s. Wait the full 30, or the sounds come out fainter.', 3600); }
          S.stethOn = true; S.target = S.est + 30; S.phase = 'listen'; render();
        };
      } else if (ph === 'listen') {
        shell(`<h3 style="margin-top:0">Step 2: listen</h3>
          <p class="small">${opts.coach ? 'Pump to <b class="num">' + S.target + '</b>. Then open the valve so it falls 2–3 mmHg a second. Tap the FIRST tap you hear, then tap where the sound is GONE.' : 'Auscultate.'}</p>
          <div class="pulsebox"><span class="beat" id="ear"></span><span>${S.stethOn ? '🎧 Listening on the brachial' : ''}</span></div>
          ${controls()}
          <div id="warn"></div>
          <div class="bp-controls" style="margin-top:12px">
            <button class="btn good" id="sys" ${S.sys ? 'disabled' : ''}>${S.sys ? 'Systolic ' + S.sys : 'First tap = systolic'}</button>
            <button class="btn good" id="dia" ${!S.sys || S.dia ? 'disabled' : ''}>${S.dia ? 'Diastolic ' + S.dia : 'Sound gone = diastolic'}</button></div>
          <div class="btns"><button class="btn sm" id="cant">🤷 I can’t hear anything</button><button class="btn sm" id="redo">Start step 2 again</button></div>`);
        wireControls();
        const p2 = root.querySelector('#pump');
        if (p2) { const orig = p2.onpointerdown; p2.onpointerdown = e => { if (S.sys == null && S.peak2 === 0) S.pumps2++; orig(e); }; }
        root.querySelector('#sys').onclick = () => {
          if (S.peak2 === 0) { toast('Pump up to ' + S.target + ' first.'); return; }
          if (S.peak2 < S.target - 6) S.notes.push('pumped to ' + Math.round(S.peak2) + ', target was ' + S.target);
          S.sys = even(S.p); blip(true);
          // update in place: a re-render would replace the valve slider under the user's finger mid-release
          const sb = root.querySelector('#sys'), db = root.querySelector('#dia');
          sb.disabled = true; sb.textContent = 'Systolic ' + S.sys; db.disabled = false;
        };
        root.querySelector('#dia').onclick = () => { S.dia = even(S.p); blip(true); finish(); };
        root.querySelector('#cant').onclick = troubleshoot;
        root.querySelector('#redo').onclick = () => {
          if (S.p > 2) { S.congest = Math.max(0.15, S.congest * 0.6); S.notes.push('re-pumped without deflating fully (the arm congests)'); toast('You re-pumped without letting it all down. The sounds get fainter now. That’s the retry spiral.', 4200); }
          S.sys = null; S.dia = null; S.peak2 = 0; render();
        };
      }
    }
    function troubleshoot() {
      const fixes = [
        ['tap', 'Tap the chest piece: is it the open side?', () => { if (!S.chestOpen) { S.chestOpen = true; S.notes.push('found the closed chest piece'); return 'It was turned to the closed side. Flipped it. Now let it all down, wait, and redo step 2.'; } return 'Tapped it: it’s open. Not the problem.'; }],
        ['ears', 'Earpieces pointing forward, towards your nose?', () => { if (!S.earsOk) { S.earsOk = true; S.notes.push('turned the earpieces forward'); return 'They were backwards. Turned them forward. Much clearer.'; } return 'They’re forward. Not the problem.'; }],
        ['light', 'Chest piece resting LIGHTLY on the brachial, not under the cuff?', () => 'Repositioned lightly over the artery. Pressing hard can squash the sound.'],
        ['reset', 'Let it ALL down, wait 30–60 s, then redo both steps', () => { S.valve = 100; S.congest = Math.min(1, S.congest + 0.4); S.notes.push('reset properly'); return 'Good: that’s the right reset. Never pump straight back up.'; }],
      ];
      const w = root.querySelector('#warn');
      w.innerHTML = `<div class="card warn"><b>Can’t hear anything? Check in this order:</b>${fixes.map(([k, t]) => `<button class="row" data-f="${k}"><span class="ic">🔧</span><span class="tx"><b>${esc(t)}</b></span></button>`).join('')}<p class="small muted" id="fixMsg"></p></div>`;
      w.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { const f = fixes.find(x => x[0] === b.dataset.f); w.querySelector('#fixMsg').textContent = f[2](); });
    }
    function finish() {
      S.phase = 'done'; S.valve = 100;
      const se = S.sys - S.sbp, de = S.dia - S.dbp;
      const avg = S.listenRates.length ? S.listenRates.reduce((a, b) => a + b, 0) / S.listenRates.length : 0;
      const fast = avg > 4.5;
      const ok = Math.abs(se) <= 6 && Math.abs(de) <= 6 && !S.errors.includes('steth');
      const judge = e => Math.abs(e) <= 4 ? 'spot on' : Math.abs(e) <= 8 ? 'close' : 'off';
      const truth = S.sbp + '/' + S.dbp, you = S.sys + '/' + S.dia;
      const cls = S.sbp > 140 || S.dbp > 90 ? 'high' : S.sbp < 110 || S.dbp < 60 ? 'low' : 'normal';
      const report = `${S.sys} over ${S.dia}. Normal is 110 to 140 systolic and 60 to 90 diastolic, so that’s ${S.sys > 140 || S.dia > 90 ? 'high. I’d recheck it and report it to you' : S.sys < 110 || S.dia < 60 ? 'low. I’d recheck it and report it to you' : 'within the normal range'}.`;
      const note = [S.errors.includes('steth') ? 'pumped before the stethoscope was on' : 'stethoscope on before pumping ✓', 'avg release ' + avg.toFixed(1) + ' mmHg/s'].concat(S.notes).join(' · ');
      api.onResult({ you, truth, ok, note, fault: S.fault });
      root.innerHTML = `
        <div class="card ${ok ? 'good' : 'warn'}"><div class="verdict ${ok ? 'met' : ''}">${ok ? 'Clean reading ✓' : 'Not quite'}</div>
          <p>You: <b class="num">${you}</b> · Simulated true: <b class="num">${truth}</b> (${cls})</p>
          <p class="small">Systolic ${se >= 0 ? '+' : ''}${se} (${judge(se)}) · Diastolic ${de >= 0 ? '+' : ''}${de} (${judge(de)}) · Release rate ${avg.toFixed(1)} mmHg/s ${fast ? '(too fast: at that speed you skip past the first tap)' : '✓'}</p>
          <ul class="checklist">
            <li><i>${S.errors.includes('steth') ? '✗' : '✓'}</i><span>Stethoscope on BEFORE pumping in step 2</span></li>
            <li><i>${S.notes.some(n => /after \d+ s/.test(n)) ? '✗' : '✓'}</i><span>Deflated fully and waited 30 s between steps</span></li>
            <li><i>${fast ? '✗' : '✓'}</i><span>Released at 2–3 mmHg a second</span></li>
            ${S.fault === 'small' ? `<li><i>${S.smallFixed ? '✓' : '✗'}</i><span>Spotted the cuff was too small${S.smallFixed ? '' : ' (that’s why you read high)'}</span></li>` : ''}
            ${S.fault === 'closed' ? `<li><i>${S.chestOpen ? '✓' : '✗'}</i><span>Found the closed chest piece</span></li>` : ''}
            ${S.fault === 'ears' ? `<li><i>${S.earsOk ? '✓' : '✗'}</i><span>Turned the earpieces forward</span></li>` : ''}
          </ul>
          ${S.notes.length ? `<p class="small muted">${esc(S.notes.join(' · '))}</p>` : ''}</div>
        <div class="card"><b>Now say it to your RN</b><div class="say">“${esc(report)}”</div>
          <p class="small muted">Then chart it: an arrow onto the systolic line, an arrow onto the diastolic line, a dotted line between (Janine’s demo, 17:03).</p></div>
        <div class="btns"><button class="btn primary" id="again">Next patient</button></div>`;
      root.querySelector('#again').onclick = () => { S = newPatient(); render(); };
    }

    S = newPatient();
    render();
    raf = requestAnimationFrame(tick);
    return function cleanup() { cancelAnimationFrame(raf); try { if (actx) actx.close(); } catch (e) { } actx = null; };
  }

  window.CLS_BP = { mount };
})();
