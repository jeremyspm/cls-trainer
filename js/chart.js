/* chart.js — stage 3: documenting.
   · Chart it: plot a set of obs on the NZ adult vital signs chart (rows + colour zones from Janine's deck slides 34–36),
     write the 24-hour time, then say which values are outside the normal adult range.
   · Sign the med chart: the administration record on Mr Luke's 8-day NMC — date, 24-h time, dose WITH units,
     Giv / Chck initials, or a non-administration code.
   · Real cuff: a log of real readings for when his own cuff and stethoscope arrive (first try? what went wrong?). */
(function () {
  'use strict';

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pickOne = a => a[Math.floor(Math.random() * a.length)];
  const even = x => Math.round(x / 2) * 2;
  const rowFor = (sec, v) => sec.rows.findIndex(r => v >= r[1] && v <= r[2]);

  /* ---------- scenario: one set of obs, 0–2 of them abnormal ---------- */
  function makeObs() {
    const o = { temp: +rnd(36.5, 37.4).toFixed(1), hr: Math.round(rnd(60, 96)), rr: Math.round(rnd(12, 20)), sys: even(rnd(110, 138)), dia: even(rnd(62, 86)) };
    const abn = [
      () => { o.temp = pickOne([38.3, 38.7, 39.2, 35.6]); },
      () => { o.hr = pickOne([112, 124, 52, 46]); },
      () => { o.rr = pickOne([24, 28, 10]); },
      () => { o.sys = pickOne([168, 156, 96]); o.dia = o.sys > 140 ? pickOne([96, 98, 102]) : pickOne([58, 56]); },
    ];
    const n = pickOne([0, 1, 1, 2]);
    for (const f of abn.sort(() => Math.random() - 0.5).slice(0, n)) f();
    const h = Math.floor(rnd(7, 21)), m = pickOne([0, 5, 10, 15, 20, 30, 40, 45, 50]);
    o.time24 = String(h).padStart(2, '0') + String(m).padStart(2, '0');
    o.time12 = ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + (h < 12 ? ' am' : ' pm');
    return o;
  }
  function timeOptions(o) {
    const h = +o.time24.slice(0, 2), m = o.time24.slice(2);
    const wrong = [String((h + 12) % 24).padStart(2, '0') + m, o.time12.replace(/\s?(am|pm)/, ''), (h % 12 || 12) + '.' + m + (h < 12 ? 'am' : 'pm')];
    return [o.time24].concat([...new Set(wrong)].filter(w => w !== o.time24)).slice(0, 4);
  }

  /* ================= Chart it: the vital signs chart ================= */
  function mountVS(root, api) {
    const { D, esc, srcChip, blip, addLog, shuffle } = api;
    const N = Object.fromEntries(D.NORMALS.map(n => [n.k, n]));
    let o, st;
    function start() {
      o = makeObs();
      st = { i: 0, marks: {}, results: [] };
      render();
    }
    const STEPS = () => [
      { k: 'time', q: `It’s ${o.time12}. What do you write in the Time (24-hour) box?` },
      { k: 'temp', sec: 'temp', v: o.temp, show: o.temp.toFixed(1) + ' °C' },
      { k: 'hr', sec: 'hr', v: o.hr, show: o.hr + ' bpm' },
      { k: 'rr', sec: 'rr', v: o.rr, show: o.rr + ' /min' },
      { k: 'sys', sec: 'bp', v: o.sys, show: 'systolic ' + o.sys, arrow: '↓' },
      { k: 'dia', sec: 'bp', v: o.dia, show: 'diastolic ' + o.dia, arrow: '↑' },
      { k: 'abn', q: 'Which of these are outside the normal adult range? Tap every one (or none).' },
    ];
    function obsCard() {
      return `<div class="card small"><b>Your obs on Mr Luke:</b> Temp ${o.temp.toFixed(1)} °C · HR ${o.hr} · RR ${o.rr} · BP ${o.sys}/${o.dia} · taken at ${o.time12}</div>`;
    }
    function sectionHtml(secKey, step) {
      const sec = D.CHART[secKey];
      const markIn = (ri) => {
        const out = [];
        if (secKey === 'bp') {
          if (st.marks.sys != null && st.marks.sys === ri) out.push('<span class="mk arrow">↓</span>');
          if (st.marks.dia != null && st.marks.dia === ri) out.push('<span class="mk arrow">↑</span>');
          if (st.marks.sys != null && st.marks.dia != null && ri > st.marks.sys && ri < st.marks.dia) out.push('<span class="mk dots">┊</span>');
        } else if (st.marks[secKey] === ri) out.push(`<span class="mk">${sec.mark === 'num' ? o.rr : '✕'}</span>`);
        return out.join('');
      };
      return `<div class="vchart"><div class="vc-h"><b>${esc(sec.title)}</b><span>${esc(sec.how)}</span></div>
        ${sec.rows.map((r, ri) => `<button class="vc-row z-${r[3]}" data-ri="${ri}" ${step ? '' : 'disabled'}><span class="vc-l">${esc(r[0])}</span><span class="vc-c">${markIn(ri)}</span></button>`).join('')}</div>`;
    }
    function render() {
      const steps = STEPS(), s = steps[st.i];
      const pct = Math.round(100 * st.i / steps.length);
      let body = '';
      if (s.k === 'time') {
        body = `<div class="q">${esc(s.q)}</div>` + shuffle(timeOptions(o)).map(t => `<button class="opt" data-t="${esc(t)}">${esc(t)}</button>`).join('');
      } else if (s.k === 'abn') {
        const items = [['temp', 'Temp ' + o.temp.toFixed(1)], ['hr', 'HR ' + o.hr], ['rr', 'RR ' + o.rr], ['bp', 'BP ' + o.sys + '/' + o.dia]];
        body = `<div class="q">${esc(s.q)}</div><div class="chips" style="gap:8px">${items.map(([k, l]) => `<button class="chip pickc" data-k="${k}" style="font-size:15px;padding:10px 14px">${esc(l)}</button>`).join('')}</div>
          <div class="btns"><button class="btn primary block" id="abnGo">Check</button></div>`;
      } else {
        body = `<div class="q">Plot the ${esc(s.sec === 'bp' ? s.show : D.CHART[s.sec].title.toLowerCase() + ': ' + s.show)}</div>
          <p class="small muted">Tap the row it goes in.${s.arrow ? ' This is the ' + s.arrow + ' arrow.' : ''}</p>${sectionHtml(s.sec, true)}`;
      }
      root.innerHTML = `${obsCard()}<div class="progress"><i style="width:${pct}%"></i></div><div id="cbody">${body}</div><div id="fb"></div>`;
      root.querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
        const ok = b.dataset.t === o.time24;
        root.querySelectorAll('[data-t]').forEach(x => { x.disabled = true; if (x.dataset.t === o.time24) x.classList.add('right'); else if (x === b) x.classList.add('wrong'); });
        result(ok, ok ? `${o.time24}: four digits, 24-hour clock.` : `It’s ${o.time24}: four digits, no colon, no am/pm. ${o.time12} → ${o.time24}.`, ['deck-vs', 'slide 33']);
      });
      root.querySelectorAll('.vc-row[data-ri]').forEach(b => b.onclick = () => {
        if (st.answered) return;
        const sec = D.CHART[s.sec], want = rowFor(sec, s.v), got = +b.dataset.ri;
        st.marks[s.k === 'sys' || s.k === 'dia' ? s.k : s.sec] = want;
        const ok = got === want, zone = D.ZONES[sec.rows[want][3]];
        const zoneTxt = s.k === 'dia' ? 'Diastolic is charted but not scored.' : `That row is the ${zone.name} zone (${zone.score === 'call 777' ? 'call 777' : 'scores ' + zone.score}).`;
        root.querySelector('#cbody').innerHTML = `<div class="q">${esc(s.show)}</div>${sectionHtml(s.sec, false)}`;
        const row = root.querySelector(`.vc-row[data-ri="${want}"]`); if (row) row.classList.add('right');
        if (!ok) { const wr = root.querySelector(`.vc-row[data-ri="${got}"]`); if (wr) wr.classList.add('wrong'); }
        result(ok, `${s.show} goes in the “${sec.rows[want][0]}” row. ${zoneTxt}${s.sec === 'rr' ? ' Write the number itself in the box.' : ''}`, s.sec === 'bp' ? ['vid-vs', '17:03'] : D.CHART.src);
      });
      root.querySelectorAll('.pickc').forEach(b => b.onclick = () => b.classList.toggle('ok'));
      const ag = root.querySelector('#abnGo');
      if (ag) ag.onclick = () => {
        const out = { temp: o.temp < 36.5 || o.temp > 37.5, hr: o.hr < 60 || o.hr > 100, rr: o.rr < 12 || o.rr > 20, bp: o.sys < 110 || o.sys > 140 || o.dia < 60 || o.dia > 90 };
        const chosen = Object.fromEntries([...root.querySelectorAll('.pickc')].map(b => [b.dataset.k, b.classList.contains('ok')]));
        const ok = Object.keys(out).every(k => out[k] === chosen[k]);
        root.querySelectorAll('.pickc').forEach(b => { b.disabled = true; b.classList.remove('ok'); b.classList.add(out[b.dataset.k] ? 'trap' : 'rub'); });
        const ab = Object.keys(out).filter(k => out[k]);
        result(ok, (ab.length ? 'Outside the normal range: ' + ab.map(k => ({ temp: 'temperature', hr: 'heart rate', rr: 'respiratory rate', bp: 'blood pressure' }[k])).join(', ') + '. Recheck, then report to your preceptor with the normal ranges.' : 'All within the normal adult ranges.') +
          ` (Temp ${N.temp.range} · HR ${N.hr.range} · RR ${N.rr.range} · BP ${N.bp.range})`, ['vid-vs', '12:33']);
      };
    }
    function result(ok, msg, src) {
      st.answered = true; blip(ok);
      st.results.push(ok);
      root.querySelector('#fb').innerHTML = `<div class="card ${ok ? 'good' : 'bad'} small"><b>${ok ? 'Right.' : 'Not quite.'}</b> ${esc(msg)}<div class="chips">${srcChip(src)}</div></div>
        <div class="btns"><button class="btn primary block" id="nx">${st.i + 1 < STEPS().length ? 'Next' : 'See your chart'}</button></div>`;
      root.querySelector('#nx').onclick = () => { st.i++; st.answered = false; if (st.i < STEPS().length) render(); else done(); window.scrollTo(0, 0); };
    }
    function done() {
      const right = st.results.filter(Boolean).length, total = st.results.length;
      addLog({ type: 'chart', run: 'vs', t: new Date().toISOString(), right, total, obs: `${o.temp.toFixed(1)}/${o.hr}/${o.rr}/${o.sys}-${o.dia}` });
      const col = sec => sectionHtml(sec, false);
      root.innerHTML = `<div class="card ${right === total ? 'good' : 'warn'}"><div class="verdict ${right === total ? 'met' : ''}">${right} / ${total}</div>
        <p class="small">Time column: <b class="num">${o.time24}</b>. This is what your column should look like.</p></div>
        ${col('rr')}${col('temp')}${col('bp')}${col('hr')}
        <div class="btns"><button class="btn primary" id="again">New set of obs</button></div>`;
      root.querySelector('#again').onclick = () => { start(); window.scrollTo(0, 0); };
    }
    start();
  }

  /* ================= Sign the med chart (NMC administration record) ================= */
  function mountMA(root, api) {
    const { D, esc, srcChip, blip, addLog, store } = api;
    let sc, st;
    const today = () => { const d = new Date(); return [d.getDate(), d.getMonth() + 1, d.getFullYear()]; };
    function start() {
      const drug = pickOne(['para', 'meto']);
      const kind = pickOne(['given', 'given', 'given', 'refused', 'withheld']);
      const times = drug === 'para' ? ['0600', '1200', '1800', '2200'] : ['0800'];
      const due = pickOne(times);
      const at = due.slice(0, 2) + String(pickOne([0, 5, 10, 15])).padStart(2, '0');
      sc = { drug, kind, due, at, order: D.DRUGS[drug].order };
      st = { initials: store.get('initials', '') };
      render();
    }
    function render() {
      const [dd, mm, yyyy] = today();
      const story = sc.kind === 'given' ? `You gave Mr Luke his ${D.DRUGS[sc.drug].generic} at <b>${+sc.at.slice(0, 2) % 12 || 12}:${sc.at.slice(2)} ${+sc.at.slice(0, 2) < 12 ? 'am' : 'pm'}</b> today, with your RN Janine Craig checking.`
        : sc.kind === 'refused' ? `At <b>${sc.at}</b> Mr Luke <b>refused</b> his ${D.DRUGS[sc.drug].generic}. You explained why it matters; he still said no.`
          : sc.drug === 'meto'
            ? `At <b>${sc.at}</b> his pulse was 52, so you and your RN <b>withheld</b> his metoprolol (a beta blocker slows the heart further).`
            : `At <b>${sc.at}</b> he told you he’d taken two of his own Panadol an hour ago, so you and your RN <b>withheld</b> his paracetamol (it would take him over 4 g today).`;
      root.innerHTML = `
        <div class="card small">${story}</div>
        <div class="nmc">
          <div class="nmc-h">Regular Medicine · John LUKE · NHI DGY 2963</div>
          <div class="nmc-rx"><span><i>Medicine</i>${esc(D.DRUGS[sc.drug].generic.toUpperCase())}${sc.drug === 'meto' ? ' CR' : ''}</span><span><i>Dose</i>${esc(D.NMC.doses[sc.drug].show)}</span><span><i>Route</i>PO</span><span><i>Frequency</i>${sc.drug === 'para' ? 'qid' : 'daily'}</span><span><i>Times</i>${sc.drug === 'para' ? '0600 1200 1800 2200' : '0800'}</span></div>
        </div>
        ${st.initials ? '' : `<div class="card warn"><b>First, your initials.</b><p class="small">Joan: on the front page you list your full name, your initials and that you’re an MIT student, under “Sample initials – Administrators”. What initials will you use?</p>
          <div class="field"><input type="text" id="myInit" maxlength="4" placeholder="e.g. JS" autocapitalize="characters"></div><div class="chips">${srcChip(['vid-ma', '04:23'])}</div></div>`}
        <div class="eyebrow">Administration record · today’s column</div>
        <div class="card">
          <div class="field"><label>Date</label><input type="text" id="fDate" inputmode="numeric" placeholder="dd/mm/yy"></div>
          <div class="field"><label>Time (24-hour)</label><input type="text" id="fTime" inputmode="numeric" placeholder="hhmm"></div>
          <div class="field"><label>${sc.kind === 'given' ? 'Dose (with units)' : 'Dose box: the non-administration code'}</label><input type="text" id="fDose" placeholder="${sc.kind === 'given' ? 'dose + units' : 'code'}"></div>
          <div class="grid2"><div class="field"><label>Giv (you)</label><input type="text" id="fGiv" maxlength="4"></div><div class="field"><label>Chck (your RN)</label><input type="text" id="fChk" maxlength="4"></div></div>
          <div class="btns"><button class="btn primary block" id="sign">Check my entry</button></div>
          <div class="chips">${srcChip(['vid-ma', '06:38'])}${srcChip(D.NMC.src)}</div>
        </div>
        <div id="fb"></div>`;
      root.querySelector('#sign').onclick = () => check(dd, mm, yyyy);
    }
    function check(dd, mm, yyyy) {
      const mi = root.querySelector('#myInit');
      if (mi) { const v = mi.value.trim().toUpperCase(); if (!/^[A-Z]{2,4}$/.test(v)) { api.toast('Type your initials first (2–4 letters).'); return; } st.initials = v; store.set('initials', v); }
      const val = id => root.querySelector(id).value.trim();
      const res = [];
      // date
      const dm = val('#fDate').match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/);
      const dOk = dm && +dm[1] === dd && +dm[2] === mm && (+dm[3] === yyyy || +dm[3] === yyyy % 100);
      res.push(['Date', dOk, dOk ? 'Today’s date.' : 'Today’s date as day/month/year, e.g. ' + `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${String(yyyy).slice(2)}`]);
      // time
      const t = val('#fTime');
      const tOk = t === sc.at;
      res.push(['Time', tOk, tOk ? '24-hour clock, four digits.' : /:|am|pm|\./i.test(t) || t.length < 4 ? `24-hour clock, four digits, no colon: ${sc.at}.` : `The time it was actually ${sc.kind === 'given' ? 'given' : 'documented'}: ${sc.at}.`]);
      // dose or code
      const d = val('#fDose');
      if (sc.kind === 'given') {
        const m = d.replace(',', '.').match(/^(\d+(?:\.\d+)?)\s*(mg|g|grams?|milligrams?)?$/i);
        const unit = m && m[2] ? (/^m/i.test(m[2]) ? 'mg' : 'g') : null;
        const okPairs = D.NMC.doses[sc.drug].ok;
        const doseOk = m && unit && okPairs.some(([n, u]) => +m[1] === n && unit === u);
        const numOk = m && okPairs.some(([n]) => +m[1] === n);
        res.push(['Dose', doseOk, doseOk ? 'Dose with its unit.' : m && !unit && numOk ? `Write the unit too: “${D.NMC.doses[sc.drug].show}”. A bare number is how dose errors happen.` : m && !unit ? `Check it against the chart (${D.NMC.doses[sc.drug].show}), and always write the unit too.` : `Check it against the chart: ${D.NMC.doses[sc.drug].show}.`]);
      } else {
        const want = sc.kind === 'refused' ? 'R' : 'W';
        const cOk = d.toUpperCase() === want;
        res.push(['Code', cOk, cOk ? `${want} = ${D.NMC.codes[want]}.` : `Use the code ${want} (${D.NMC.codes[want]}). ${sc.kind === 'refused' ? 'Then document his reason in the notes and tell your RN.' : 'Explain why in the notes.'}`]);
      }
      // initials
      const giv = val('#fGiv').toUpperCase(), chk = val('#fChk').toUpperCase();
      res.push(['Giv', giv === st.initials, giv === st.initials ? 'Your initials, matching the front page.' : `Giv is YOUR initials: ${st.initials}.`]);
      res.push(['Chck', chk === D.NMC.rn.initials, chk === D.NMC.rn.initials ? 'Your RN’s initials.' : chk === st.initials ? `Chck is your RN’s initials, not yours: Janine Craig = ${D.NMC.rn.initials}.` : `Chck is your RN’s initials: Janine Craig = ${D.NMC.rn.initials}.`]);
      const all = res.every(r => r[1]);
      blip(all);
      addLog({ type: 'chart', run: 'ma', t: new Date().toISOString(), right: res.filter(r => r[1]).length, total: res.length, kind: sc.kind, drug: sc.drug });
      root.querySelector('#fb').innerHTML = `<div class="card ${all ? 'good' : 'warn'}"><div class="verdict ${all ? 'met' : ''}">${all ? 'Signed correctly ✓' : res.filter(r => r[1]).length + ' / ' + res.length}</div>
        <ul class="checklist">${res.map(([k, ok, m]) => `<li><i>${ok ? '✓' : '✗'}</i><span><b>${k}:</b> ${esc(m)}</span></li>`).join('')}</ul>
        <p class="small muted">Only ever sign AFTER it’s been given (Joan’s deck, slide 41).</p></div>
        <div class="btns"><button class="btn" id="retry">Fix and check again</button><button class="btn primary" id="next">New scenario</button></div>`;
      root.querySelector('#retry').onclick = () => { const f = root.querySelector('#fDate'); f.scrollIntoView({ block: 'center' }); f.focus(); };
      root.querySelector('#next').onclick = () => { start(); window.scrollTo(0, 0); };
    }
    start();
  }

  /* ================= Real cuff log ================= */
  const PROBLEMS = ['Couldn’t hear the taps', 'Lost the radial pulse in step 1', 'Let it down too fast', 'Pumped before the stethoscope was on', 'Re-pumped without waiting', 'Cuff loose or wrong size', 'Arm not supported / not at heart level', 'Something else'];
  function mountCuff(root, api) {
    const { esc, addLog, log, store, blip } = api;
    function streaks() {
      const L = log().filter(e => e.type === 'cuff');
      let cur = 0; for (let i = L.length - 1; i >= 0 && L[i].first; i--) cur++;
      let best = 0, run = 0; for (const e of L) { run = e.first ? run + 1 : 0; best = Math.max(best, run); }
      const probs = {}; L.filter(e => !e.first).forEach(e => (e.problems || []).forEach(p => probs[p] = (probs[p] || 0) + 1));
      return { L, cur, best, top: Object.entries(probs).sort((a, b) => b[1] - a[1])[0] };
    }
    function render() {
      if (!store.get('cuffArrived', false)) {
        root.innerHTML = `<div class="card"><b>Waiting for your cuff and stethoscope.</b><p class="small">This is where you log REAL readings once they arrive: did you get it first try, and if not, what went wrong. The target is <b>10 first-try readings in a row</b> before your resit. Until then, the BP Lab is your practice.</p></div>
          <div class="btns"><button class="btn primary block" id="arr">My cuff has arrived</button><button class="btn block" data-go="#bp">Practise in the BP Lab</button></div>`;
        root.querySelector('#arr').onclick = () => { store.set('cuffArrived', true); render(); };
        root.querySelector('[data-go]').onclick = () => { location.hash = '#bp'; };
        return;
      }
      const s = streaks();
      root.innerHTML = `
        <div class="stats"><div class="stat"><b class="num">${s.cur}</b><span>first-try streak</span></div><div class="stat"><b class="num">${s.best}</b><span>best streak</span></div><div class="stat"><b class="num">${s.L.length}</b><span>real readings</span></div></div>
        <div class="progress"><i style="width:${Math.min(100, s.cur * 10)}%"></i></div><p class="small muted">Target: 10 first-try readings in a row. ${s.cur >= 10 ? 'Done. Keep it warm.' : (10 - s.cur) + ' to go.'}</p>
        ${s.top ? `<div class="card warn small"><b>Your most common slip:</b> ${esc(s.top[0])} (${s.top[1]}×)</div>` : ''}
        <div class="eyebrow">Log a reading</div>
        <div class="card">
          <div class="field"><label>Who on (optional)</label><input type="text" id="who" placeholder="e.g. Mum"></div>
          <div class="field"><label>Did you get it on the FIRST try? (both steps, no re-pump)</label>
            <div class="seg" id="firstSeg"><button data-v="1">Yes, first try</button><button data-v="0">No</button></div></div>
          <div class="grid2"><div class="field"><label>Your reading</label><input type="text" id="mine" inputmode="numeric" placeholder="120/80"></div><div class="field"><label>Automatic cuff (optional)</label><input type="text" id="auto" inputmode="numeric" placeholder="122/78"></div></div>
          <div id="probs" hidden><label class="small muted">What went wrong? (tap all that apply)</label><div class="chips" style="gap:8px">${PROBLEMS.map(p => `<button class="chip pickc" data-p="${esc(p)}" style="font-size:14px;padding:8px 12px">${esc(p)}</button>`).join('')}</div></div>
          <div class="btns"><button class="btn primary block" id="save" disabled>Save reading</button></div>
        </div>
        ${s.L.length ? '<div class="eyebrow">Recent</div>' + s.L.slice(-10).reverse().map(e => `<div class="row"><span class="ic">${e.first ? '🎯' : '🔁'}</span><span class="tx"><b>${e.mine ? esc(e.mine) : 'no reading noted'}${e.auto ? ' · auto ' + esc(e.auto) : ''}</b><span>${new Date(e.t).toLocaleString('en-NZ', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}${e.who ? ' · ' + esc(e.who) : ''}${(e.problems || []).length ? ' · ' + esc(e.problems.join(', ')) : ''}</span></span></div>`).join('') : ''}`;
      let first = null;
      root.querySelectorAll('#firstSeg button').forEach(b => b.onclick = () => {
        first = b.dataset.v === '1';
        root.querySelectorAll('#firstSeg button').forEach(x => x.classList.toggle('on', x === b));
        root.querySelector('#probs').hidden = first; root.querySelector('#save').disabled = false;
      });
      root.querySelectorAll('#probs .pickc').forEach(b => b.onclick = () => b.classList.toggle('ok'));
      root.querySelector('#save').onclick = () => {
        const bp = v => { const m = v.match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/); return m ? m[1] + '/' + m[2] : ''; };
        const mine = bp(root.querySelector('#mine').value.trim()), auto = bp(root.querySelector('#auto').value.trim());
        const problems = first ? [] : [...root.querySelectorAll('#probs .pickc.ok')].map(b => b.dataset.p);
        addLog({ type: 'cuff', t: new Date().toISOString(), first, mine, auto, who: root.querySelector('#who').value.trim(), problems });
        blip(first); render();
        if (mine && auto) { const [a, b] = mine.split('/').map(Number), [c, d] = auto.split('/').map(Number); api.toast(`Difference: systolic ${a - c >= 0 ? '+' : ''}${a - c}, diastolic ${b - d >= 0 ? '+' : ''}${b - d}. Within 10 is good for a manual vs automatic.`, 5200); }
      };
    }
    render();
  }

  window.CLS_CHART = { mountVS, mountMA, mountCuff, makeObs, rowFor };
})();
