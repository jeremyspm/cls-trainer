/* chart-vs.js — "Chart it" v2 (10 Oct 2026): the NZ adult vital signs chart as it looks on paper.
   · Plot it: the whole chart (RR, O2, SpO2, temp, BP, HR, LOC) with two earlier columns already filled; you plot the
     new column by tapping WHERE the mark goes inside the row. BP follows Janine's slide 39: an ↑ arrowhead whose tip
     sits on the systolic, a ↓ arrowhead whose tip sits on the diastolic, dotted line between (demo video 17:03:
     "an arrow pointing onto the line of 110 and onto the line of 60"). Off-scale values are WRITTEN, not marked.
     Then: which values are abnormal, which way is he trending, and (bonus) the EWS + the escalation pathway
     printed on the chart (slide 34).
   · Read it: Janine's own slide 38–39 exercise, "What are these heart rates / blood pressures?". */
(function () {
  'use strict';
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pickOne = a => a[Math.floor(Math.random() * a.length)];
  const even = x => Math.round(x / 2) * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rowFor = (sec, v) => sec.rows.findIndex(r => r[1] != null && v >= r[1] && v <= r[2]);
  const isWrite = r => /write/i.test(r[0]);
  const ZSCORE = { w: 0, y: 1, o: 2, p: 3, b: 3 };

  /* ---------- scenario ---------- */
  function makeObs() {
    const o = { temp: +rnd(36.5, 37.4).toFixed(1), hr: Math.round(rnd(60, 96)), rr: Math.round(rnd(12, 20)), sys: even(rnd(110, 138)), dia: even(rnd(62, 86)), spo2: Math.round(rnd(95, 99)), o2: 'ra', loc: 'A' };
    const abn = [
      () => { o.temp = pickOne([38.3, 38.7, 39.2, 35.6]); },
      () => { o.hr = pickOne([112, 124, 52, 46, 132, 146]); },
      () => { o.rr = pickOne([24, 28, 10]); },
      () => { o.sys = pickOne([168, 156, 96, 84]); o.dia = o.sys > 140 ? pickOne([96, 98, 102]) : pickOne([58, 56, 52]); },
    ];
    const n = pickOne([0, 1, 1, 2]);
    for (const f of abn.sort(() => Math.random() - 0.5).slice(0, n)) f();
    const h = Math.floor(rnd(10, 22)), m = pickOne([0, 5, 10, 15, 20, 30, 40, 45, 50]);
    o.time24 = String(h).padStart(2, '0') + String(m).padStart(2, '0');
    o.time12 = ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + (h < 12 ? ' am' : ' pm');
    return o;
  }
  const BASE = { temp: 36.8, hr: 76, rr: 16, sys: 124, dia: 74, spo2: 98 };
  const LIMITS = { temp: [34.2, 39.9], hr: [32, 150], rr: [6, 34], sys: [72, 214], dia: [50, 110], spo2: [88, 100] };
  function makeScenario() {
    const cur = makeObs();
    const story = pickOne(['stable', 'stable', 'worse', 'worse', 'better']);
    const h = +cur.time24.slice(0, 2);
    const prev = [[2, 8], [1, 4]].map(([k, back]) => {
      const o = { o2: 'ra', loc: 'A', time24: String(h - back).padStart(2, '0') + '00' };
      for (const p of ['temp', 'hr', 'rr', 'sys', 'dia', 'spo2']) {
        const c = cur[p], b = BASE[p];
        let v = story === 'worse' ? b + (c - b) * (k === 2 ? 0.15 : 0.55)
          : story === 'better' ? c + (c - b) * (k === 2 ? 0.9 : 0.45)
            : c + rnd(-1, 1) * (p === 'temp' ? 0.2 : p === 'spo2' ? 1 : 3);
        v = clamp(v, LIMITS[p][0], LIMITS[p][1]);
        o[p] = p === 'temp' ? +v.toFixed(1) : (p === 'sys' || p === 'dia') ? even(v) : Math.round(v);
      }
      if (o.dia > o.sys - 24) {                       // keep a sensible gap, and keep the diastolic ON the chart (50s is the bottom row)
        o.dia = Math.max(LIMITS.dia[0], even(o.sys - 30));
        if (o.dia > o.sys - 20) o.sys = even(o.dia + 24);
      }
      return o;
    });
    return { cur, prev, story };
  }
  function timeOptions(o) {
    const h = +o.time24.slice(0, 2), m = o.time24.slice(2);
    const wrong = [String((h + 12) % 24).padStart(2, '0') + m, o.time12.replace(/\s?(am|pm)/, ''), (h % 12 || 12) + '.' + m + (h < 12 ? 'am' : 'pm')];
    return [o.time24].concat([...new Set(wrong)].filter(w => w !== o.time24)).slice(0, 4);
  }

  /* ---------- EWS (zones as printed on the chart) ---------- */
  function zoneOf(CH, key, v) { const r = CH[key].rows[rowFor(CH[key], v)]; return r ? r[3] : 'w'; }
  function ews(CH, o) {
    const z = { rr: zoneOf(CH, 'rr', o.rr), o2: o.o2 === 'ra' ? 'w' : 'o', spo2: zoneOf(CH, 'spo2', o.spo2), temp: zoneOf(CH, 'temp', o.temp), bp: zoneOf(CH, 'bp', o.sys), hr: zoneOf(CH, 'hr', o.hr), loc: { A: 'w', V: 'p', P: 'p', U: 'b' }[o.loc] };
    const vals = Object.values(z);
    const total = vals.reduce((a, k) => a + ZSCORE[k], 0);
    const anyBlue = vals.includes('b'), anyRed = vals.includes('p');
    const tier = anyBlue || total >= 10 ? 't4' : total >= 8 || anyRed ? 't3' : total >= 6 ? 't2' : total >= 1 ? 't1' : 't0';
    return { z, total, anyBlue, anyRed, tier };
  }

  /* ---------- geometry ---------- */
  const W = 340, LAB = 104, COLW = 78, RH = 30, SH = 24, TH = 32;
  function layout(CH, keys, top) {
    const L = {}; let y = top == null ? TH : top;
    for (const k of keys) { L[k] = { y0: y, rowsTop: y + SH, n: CH[k].rows.length }; y += SH + CH[k].rows.length * RH; }
    L._h = y + 2;
    return L;
  }
  /* where a value sits: row index + y (row top edge = the row's top value, bottom edge = its bottom value) */
  function place(CH, L, key, v) {
    const sec = CH[key], ri = rowFor(sec, v);
    if (ri < 0) return null;
    const r = sec.rows[ri], top = L[key].rowsTop + ri * RH;
    if (sec.mark !== 'x' && sec.mark !== 'arrow') return { ri, y: top + RH / 2, write: false, box: true };
    if (isWrite(r)) return { ri, y: top + RH / 2, write: true };
    const span = sec.span;
    const lo = r[0].startsWith('≤') ? Math.round((r[2] + 0.01 - span) * 100) / 100 : r[1];
    const topVal = lo + span;
    if (v < lo || v >= topVal) return { ri, y: top + RH / 2, write: true };          // off the scale: write it
    return { ri, y: top + ((topVal - v) / span) * RH, write: false };
  }
  function valueAt(CH, L, key, y) {
    const sec = CH[key], ri = Math.floor((y - L[key].rowsTop) / RH);
    if (ri < 0 || ri >= sec.rows.length) return null;
    const r = sec.rows[ri];
    if (sec.mark !== 'x' && sec.mark !== 'arrow') return { ri };
    if (isWrite(r)) return { ri, write: true };
    const span = sec.span, lo = r[0].startsWith('≤') ? Math.round((r[2] + 0.01 - span) * 100) / 100 : r[1];
    const f = (y - (L[key].rowsTop + ri * RH)) / RH;
    return { ri, v: lo + span - f * span };
  }

  /* ---------- drawing ---------- */
  const t = (x, y, s, cls, extra) => `<text x="${x}" y="${y}" class="${cls || ''}" ${extra || ''}>${s}</text>`;
  function arrowUp(x, y) { return `<path class="ch-arrow" d="M${x} ${y} l-6 9 h12 z"/>`; }
  function arrowDown(x, y) { return `<path class="ch-arrow" d="M${x} ${y} l-6 -9 h12 z"/>`; }
  function drawColumn(CH, L, keys, o, ci, opts) {
    const cx = LAB + ci * COLW + COLW / 2;
    let s = '';
    for (const k of keys) {
      const sec = CH[k];
      if (k === 'o2') { s += o.o2 === 'ra' ? t(cx, L.o2.rowsTop + RH / 2, '✓', 'ch-mk') : t(cx, L.o2.rowsTop + RH * 1.5, o.o2, 'ch-mk'); continue; }
      if (k === 'loc') { const ri = 'AVPU'.indexOf(o.loc); s += t(cx, L.loc.rowsTop + ri * RH + RH / 2, '✓', 'ch-mk'); continue; }
      if (k === 'bp') {
        if (o.sys == null) continue;
        const ps = place(CH, L, 'bp', o.sys), pd = o.dia != null ? place(CH, L, 'bp', o.dia) : null;
        if (ps.write) s += t(cx, ps.y, o.sys, 'ch-mk'); else s += arrowUp(cx, ps.y);
        if (pd) {
          s += arrowDown(cx, pd.y);
          if (!ps.write) s += `<line class="ch-dots" x1="${cx}" y1="${ps.y + 9}" x2="${cx}" y2="${pd.y - 9}"/>`;
        }
        continue;
      }
      const v = o[k]; if (v == null) continue;
      const p = place(CH, L, k, v);
      if (!p) continue;
      s += t(cx, p.y, p.box || p.write ? v : '✕', 'ch-mk' + (p.box || p.write ? ' num' : ''));
    }
    return s;
  }
  function drawChart(CH, keys, cols, opt) {
    const L = layout(CH, keys, opt.noTime ? 0 : TH);
    const ncol = cols.length, w = LAB + ncol * COLW;
    let s = `<svg class="vchart2" viewBox="0 0 ${w} ${L._h}" width="100%" role="img" aria-label="Adult vital signs chart">`;
    if (!opt.noTime) {   // time header
      s += `<rect class="ch-head" x="0" y="0" width="${w}" height="${TH}"/>` + t(LAB - 8, TH / 2, 'Time (24 h)', 'ch-lab');
      cols.forEach((c, i) => { s += t(LAB + i * COLW + COLW / 2, TH / 2, c.time24 || (i === opt.current ? '?' : ''), 'ch-time'); });
    }
    for (const k of keys) {
      const sec = CH[k], g = L[k];
      s += `<rect class="ch-head" x="0" y="${g.y0}" width="${w}" height="${SH}"/>` + t(8, g.y0 + SH / 2, sec.title, 'ch-title', 'text-anchor="start"');
      sec.rows.forEach((r, ri) => {
        const y = g.rowsTop + ri * RH;
        s += `<rect class="zf-${r[3]} ch-row" x="0" y="${y}" width="${w}" height="${RH}"/>` + t(LAB - 8, y + RH / 2, r[0], 'ch-lab');
        if ((sec.mark === 'x' || sec.mark === 'arrow') && !isWrite(r)) s += `<line class="ch-mid" x1="${LAB}" y1="${y + RH / 2}" x2="${w}" y2="${y + RH / 2}"/>`;
      });
      if (opt.active === k) s += `<rect class="ch-active" x="1" y="${g.rowsTop}" width="${w - 2}" height="${g.n * RH}"/>`;
    }
    for (let i = 0; i <= ncol; i++) s += `<line class="ch-col" x1="${LAB + i * COLW}" y1="0" x2="${LAB + i * COLW}" y2="${L._h}"/>`;
    if (opt.current != null) s += `<rect class="ch-cur" x="${LAB + opt.current * COLW}" y="0" width="${COLW}" height="${L._h}"/>`;
    cols.forEach((c, i) => { s += `<g class="${i === opt.current ? 'ch-you' : opt.current == null ? 'ch-plain' : 'ch-old'}">${drawColumn(CH, L, keys, c, i)}</g>`; });
    if (opt.ghost) s += `<g class="ch-ghost">${opt.ghost}</g>`;
    return { svg: s + '</svg>', L };
  }
  function svgPoint(svg, e) {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  /* ================= Plot it ================= */
  function mountVS(root, api) {
    const { D, esc, srcChip, blip, addLog, shuffle, store } = api;
    const CH = D.CHART, KEYS = CH.order;
    const N = Object.fromEntries(D.NORMALS.map(n => [n.k, n]));
    const bonus = () => store.get('chartEws', true);
    let sc, st;

    function start() {
      sc = makeScenario();
      st = { i: 0, cur: { o2: sc.cur.o2, loc: sc.cur.loc, spo2: sc.cur.spo2 }, results: [], answered: false, ghost: '' };
      render(true);
    }
    const NAMES = { temp: 'temperature', hr: 'heart rate', rr: 'respiratory rate', sys: 'systolic', dia: 'diastolic' };
    function steps() {
      const o = sc.cur, list = [
        { k: 'time', mc: true },
        { k: 'temp', sec: 'temp', v: o.temp, show: o.temp.toFixed(1) + ' °C' },
        { k: 'hr', sec: 'hr', v: o.hr, show: o.hr + ' bpm' },
        { k: 'rr', sec: 'rr', v: o.rr, show: o.rr + ' breaths/min' },
        { k: 'sys', sec: 'bp', v: o.sys, show: 'Systolic ' + o.sys },
        { k: 'dia', sec: 'bp', v: o.dia, show: 'Diastolic ' + o.dia },
        { k: 'abn', mc: true },
        { k: 'trend', mc: true },
      ];
      if (bonus()) list.push({ k: 'ews', mc: true }, { k: 'tier', mc: true });
      return list;
    }
    function colsNow() {
      const cur = Object.assign({ time24: st.time }, st.cur);
      return [sc.prev[0], sc.prev[1], cur];
    }
    function render(scroll) {
      const s = steps()[st.i];
      const { svg } = drawChart(CH, KEYS, colsNow(), { current: 2, active: s.sec || null, ghost: st.ghost });
      const o = sc.cur;
      root.innerHTML = `
        <div class="seg" style="margin-top:0"><button class="on">Plot it</button><button data-go="#chart/read">Read it</button><button data-href="paper.html">Real chart</button></div>
        <div class="card small"><b>Your obs on Mr Luke</b> at ${o.time12}: Temp ${o.temp.toFixed(1)} °C · HR ${o.hr} · RR ${o.rr} · BP ${o.sys}/${o.dia}<br><span class="muted">SpO₂ ${o.spo2} % on room air and Alert are already charted. The two earlier columns are this morning’s.</span></div>
        <div class="chartbox" id="chartbox">${svg}</div>
        <div class="taskbar" id="task"></div>`;
      root.querySelector('[data-go]').onclick = () => { location.hash = '#chart/read'; };
      const svgEl = root.querySelector('svg');
      svgEl.addEventListener('click', e => onTap(svgEl, e));
      task();
      if (scroll && s.sec) scrollToSection(s.sec);
    }
    function scrollToSection(key) {
      const svgEl = root.querySelector('svg'), L = layout(CH, KEYS);
      const r = svgEl.getBoundingClientRect(), scale = r.height / L._h;
      window.scrollTo({ top: Math.max(0, window.scrollY + r.top + L[key].y0 * scale - 80), behavior: 'smooth' });
    }
    function task() {
      const s = steps()[st.i], o = sc.cur, el = root.querySelector('#task');
      const pct = Math.round(100 * st.i / steps().length);
      let h = `<div class="progress"><i style="width:${pct}%"></i></div>`;
      if (s.k === 'time') {
        h += `<div class="q">It’s ${o.time12}. What goes in the Time (24 h) box?</div>` + shuffle(timeOptions(o)).map(x => `<button class="opt" data-a="${esc(x)}">${esc(x)}</button>`).join('');
      } else if (s.sec) {
        const sec = CH[s.sec];
        const what = s.k === 'sys' ? 'the ↑ arrowhead, tip ON the systolic' : s.k === 'dia' ? 'the ↓ arrowhead, tip ON the diastolic' : sec.mark === 'num' ? 'the box this number goes in' : 'where the ✕ goes';
        h += `<div class="q">${esc(s.show)}: tap ${what}</div><p class="small muted">${esc(sec.title)}: ${esc(sec.how)}.</p>`;
      } else if (s.k === 'abn') {
        h += `<div class="q">Which of these are outside the normal adult range? Tap every one (or none).</div>
          <div class="chips" style="gap:8px">${[['temp', 'Temp ' + o.temp.toFixed(1)], ['hr', 'HR ' + o.hr], ['rr', 'RR ' + o.rr], ['bp', 'BP ' + o.sys + '/' + o.dia]].map(([k, l]) => `<button class="chip pickc" data-k="${k}" style="font-size:15px;padding:10px 14px">${esc(l)}</button>`).join('')}</div>
          <div class="btns"><button class="btn primary block" id="abnGo">Check</button></div>`;
      } else if (s.k === 'trend') {
        const tr = trend();
        st.tr = tr;
        h += `<div class="q">Look across ${sc.prev[0].time24} → ${sc.prev[1].time24} → now. His ${esc(tr.name)} is…</div>` + ['going up', 'going down', 'about the same'].map(x => `<button class="opt" data-a="${x}">${x[0].toUpperCase() + x.slice(1)}</button>`).join('');
      } else if (s.k === 'ews') {
        const e = ews(CH, o); st.e = e;
        const opts = shuffle([...new Set([e.total, e.total + 1, Math.max(0, e.total - 1), e.total + 2, e.total + 3])].slice(0, 4));
        h += `<div class="q"><span class="chip">Bonus · Janine’s slides 40–41</span><br>Add up the zone scores for this column (white 0 · yellow 1 · orange 2 · pink 3). What’s his EWS?</div>` + opts.map(x => `<button class="opt" data-a="${x}">${x}</button>`).join('') + `<p class="small muted">Only the systolic scores. SpO₂ ${o.spo2} %, room air and Alert count too.${e.anyBlue ? ' A blue-zone value scores 3 here, but it also calls 777 on its own.' : ''}</p>`;
      } else if (s.k === 'tier') {
        const e = st.e || ews(CH, o); st.e = e;
        const right = CH.pathway.find(p => p.id === e.tier);
        const others = shuffle(CH.pathway.filter(p => p.id !== e.tier)).slice(0, 3);
        h += `<div class="q"><span class="chip">Bonus</span><br>EWS ${e.total}${e.anyRed && !e.anyBlue ? ', with a value in the pink (red) zone' : ''}${e.anyBlue ? ', with a value in the blue zone' : ''}. What does the pathway on this chart say?</div>` +
          shuffle([right].concat(others)).map(p => `<button class="opt" data-a="${p.id}"><b>${esc(p.when)}:</b> ${esc(p.do)}</button>`).join('') +
          '<p class="small muted">As a student, whatever it says, you tell your preceptor/RN straight away.</p>';
      }
      h += '<div id="fb"></div>';
      el.innerHTML = h;
      // answer key for tests/drive.mjs (not shown on screen)
      el.dataset.ans = s.k === 'time' ? o.time24 : s.k === 'trend' ? st.tr.ans : s.k === 'ews' ? String(st.e.total) : s.k === 'tier' ? st.e.tier : '';
      el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => answerMC(s, b));
      el.querySelectorAll('.pickc').forEach(b => b.onclick = () => b.classList.toggle('ok'));
      const ag = el.querySelector('#abnGo'); if (ag) ag.onclick = () => answerAbn();
    }
    function trend() {
      const o = sc.cur, p0 = sc.prev[0];
      const scale = { temp: 0.5, hr: 10, rr: 4, sys: 15 };
      let best = null;
      for (const k of Object.keys(scale)) { const d = (o[k] - p0[k]) / scale[k]; if (!best || Math.abs(d) > Math.abs(best.d)) best = { k, d }; }
      const name = { temp: 'temperature', hr: 'heart rate', rr: 'respiratory rate', sys: 'systolic blood pressure' }[best.k];
      const ans = Math.abs(best.d) < 1 ? 'about the same' : best.d > 0 ? 'going up' : 'going down';
      return { k: best.k, name, ans, from: p0[best.k], mid: sc.prev[1][best.k], to: o[best.k] };
    }
    function onTap(svgEl, e) {
      const s = steps()[st.i];
      if (!s.sec || st.answered) return;
      const p = svgPoint(svgEl, e), L = layout(CH, KEYS);
      const g = L[s.sec];
      if (p.y < g.rowsTop || p.y > g.rowsTop + g.n * RH) { api.toast(`Tap inside the ${CH[s.sec].title.toLowerCase()} rows.`); return; }
      const got = valueAt(CH, L, s.sec, p.y), want = place(CH, L, s.sec, s.v);
      const sec = CH[s.sec], span = sec.span || 1;
      let ok = got.ri === want.ri;
      // exactly on a row line (e.g. 110 = the line between the 110s and 100s): a tap just under the line also counts
      if (!ok && !want.write && got.v != null && Math.abs(s.v / span - Math.round(s.v / span)) < 1e-9 && Math.abs(got.v - s.v) <= span * 0.3) ok = true;
      // place the user's mark where they tapped (current column), so they see their own chart
      const cx = LAB + 2 * COLW + COLW / 2;
      if (ok) st.cur[s.k] = s.v;                                   // right: snap to the exact spot
      else if (got.v != null) st.cur[s.k] = s.k === 'temp' ? +got.v.toFixed(1) : got.v;   // wrong: show it where they put it
      // (a wrong box / written row stays empty; the ghost shows where it goes)
      // ghost: where it really goes, if they missed
      st.ghost = ok ? '' : (s.k === 'sys' ? arrowUp(cx, want.y) : s.k === 'dia' ? arrowDown(cx, want.y) : t(cx, want.y, want.write || want.box ? s.v : '✕', 'ch-mk'));
      st.answered = true;
      const rowName = sec.rows[want.ri][0];
      const zone = D.ZONES[sec.rows[want.ri][3]];
      let msg = want.write ? `${s.show} is off the printed scale, so you WRITE the number in the “${rowName}” row.`
        : want.box ? `${s.show}: the number goes in the “${rowName}” box.`
          : `${s.show} sits in the “${rowName}” row${Math.abs(s.v / span - Math.round(s.v / span)) < 1e-9 ? ', right ON the line at the bottom of that row' : ''}.`;
      if (ok && got.v != null && !want.write) {
        const off = got.v - s.v;
        msg += Math.abs(off) <= span * 0.25 ? ' Spot on.' : ` Right row; it sits a little ${off > 0 ? 'lower' : 'higher'} than you put it.`;
      }
      if (s.k !== 'dia') msg += ` ${zone.name[0].toUpperCase() + zone.name.slice(1)} zone (${zone.score === 'call 777' ? 'call 777' : 'scores ' + zone.score}).`;
      else msg += ' (The diastolic isn’t scored.)';
      result(ok, msg, s.sec === 'bp' ? ['deck-vs', 'slide 39'] : CH.src);
      const box = root.querySelector('#chartbox');
      box.innerHTML = drawChart(CH, KEYS, colsNow(), { current: 2, active: s.sec, ghost: st.ghost }).svg;
      box.querySelector('svg').addEventListener('click', ev => onTap(box.querySelector('svg'), ev));
    }
    function answerMC(s, b) {
      if (st.answered) return;
      const o = sc.cur, el = root.querySelector('#task');
      let ok, msg, src;
      if (s.k === 'time') { ok = b.dataset.a === o.time24; st.time = o.time24; msg = ok ? `${o.time24}: four digits, 24-hour clock.` : `It’s ${o.time24}. ${o.time12} → ${o.time24}: four digits, no colon, no am/pm.`; src = ['deck-vs', 'slide 33']; }
      else if (s.k === 'trend') { const tr = st.tr; ok = b.dataset.a === tr.ans; msg = `${tr.name[0].toUpperCase() + tr.name.slice(1)}: ${tr.from} → ${tr.mid} → ${tr.to}, so it’s ${tr.ans}. This is why you chart at the time: the trend shows deterioration or improvement.`; src = ['deck-vs', 'slide 33']; }
      else if (s.k === 'ews') { const e = st.e; ok = +b.dataset.a === e.total; msg = `EWS ${e.total}: ` + Object.entries(e.z).map(([k, z]) => `${({ rr: 'RR', o2: 'O₂', spo2: 'SpO₂', temp: 'temp', bp: 'BP', hr: 'HR', loc: 'LOC' })[k]} ${ZSCORE[z]}`).join(' · ') + '.'; src = ['deck-vs', 'slides 40–41']; }
      else if (s.k === 'tier') { const e = st.e; ok = b.dataset.a === e.tier; const p = CH.pathway.find(x => x.id === e.tier); msg = `${p.when}: ${p.do}`; src = CH.pathwaySrc; }
      el.querySelectorAll('[data-a]').forEach(x => { x.disabled = true; const right = s.k === 'time' ? x.dataset.a === o.time24 : s.k === 'trend' ? x.dataset.a === st.tr.ans : s.k === 'ews' ? +x.dataset.a === st.e.total : x.dataset.a === st.e.tier; if (right) x.classList.add('right'); else if (x === b) x.classList.add('wrong'); });
      st.answered = true;
      if (s.k === 'time') { const box = root.querySelector('#chartbox'); box.innerHTML = drawChart(CH, KEYS, colsNow(), { current: 2 }).svg; box.querySelector('svg').addEventListener('click', ev => onTap(box.querySelector('svg'), ev)); }
      result(ok, msg, src);
    }
    function answerAbn() {
      if (st.answered) return;
      const o = sc.cur, el = root.querySelector('#task');
      const out = { temp: o.temp < 36.5 || o.temp > 37.5, hr: o.hr < 60 || o.hr > 100, rr: o.rr < 12 || o.rr > 20, bp: o.sys < 110 || o.sys > 140 || o.dia < 60 || o.dia > 90 };
      const chosen = Object.fromEntries([...el.querySelectorAll('.pickc')].map(b => [b.dataset.k, b.classList.contains('ok')]));
      const ok = Object.keys(out).every(k => out[k] === chosen[k]);
      el.querySelectorAll('.pickc').forEach(b => { b.disabled = true; b.classList.remove('ok'); b.classList.add(out[b.dataset.k] ? 'trap' : 'rub'); });
      const ab = Object.keys(out).filter(k => out[k]);
      st.answered = true;
      result(ok, (ab.length ? 'Outside the normal range: ' + ab.map(k => ({ temp: 'temperature', hr: 'heart rate', rr: 'respiratory rate', bp: 'blood pressure' }[k])).join(', ') + '. Recheck, then report to your preceptor with the normal ranges.' : 'All within the normal adult ranges.') +
        ` (Temp ${N.temp.range} · HR ${N.hr.range} · RR ${N.rr.range} · BP ${N.bp.range})`, ['vid-vs', '12:33']);
    }
    function result(ok, msg, src) {
      blip(ok); st.results.push(ok);
      const last = st.i + 1 >= steps().length;
      root.querySelector('#fb').innerHTML = `<div class="card ${ok ? 'good' : 'bad'} small"><b>${ok ? 'Right.' : 'Not quite.'}</b> ${esc(msg)}<div class="chips">${srcChip(src)}</div></div>
        <div class="btns"><button class="btn primary block" id="nx">${last ? 'See your chart' : 'Next'}</button></div>`;
      const nx = root.querySelector('#nx');
      nx.onclick = () => { st.i++; st.answered = false; st.ghost = ''; if (st.i < steps().length) { render(true); } else done(); };
      nx.scrollIntoView({ block: 'nearest' });
    }
    function done() {
      const right = st.results.filter(Boolean).length, total = st.results.length;
      addLog({ type: 'chart', run: 'vs', t: new Date().toISOString(), right, total, obs: `${sc.cur.temp.toFixed(1)}/${sc.cur.hr}/${sc.cur.rr}/${sc.cur.sys}-${sc.cur.dia}` });
      const answer = Object.assign({ time24: sc.cur.time24 }, sc.cur);
      root.innerHTML = `<div class="card ${right === total ? 'good' : 'warn'}"><div class="verdict ${right === total ? 'met' : ''}">${right} / ${total}</div>
        <p class="small">Left: this morning. Right: how the new ${sc.cur.time24} column should look.</p></div>
        <div class="chartbox">${drawChart(CH, KEYS, [sc.prev[0], sc.prev[1], answer], { current: 2 }).svg}</div>
        <label class="toggle"><input type="checkbox" id="ewsT" ${bonus() ? 'checked' : ''}> Include the EWS bonus questions</label>
        <div class="btns"><button class="btn primary" id="again">New set of obs</button><button class="btn" data-go="#chart/read">Read it</button></div>`;
      root.querySelector('#ewsT').onchange = e => store.set('chartEws', e.target.checked);
      root.querySelector('#again').onclick = () => { start(); window.scrollTo(0, 0); };
      root.querySelector('[data-go]').onclick = () => { location.hash = '#chart/read'; };
    }
    start();
  }

  /* ================= Read it — Janine's slides 38–39 ================= */
  const JANINE = [
    { sec: 'hr', v: 135, src: ['deck-vs', 'slide 38'] },
    { sec: 'hr', v: 85, src: ['deck-vs', 'slide 38'] },
    { sec: 'bp', sys: 145, dia: 70, src: ['deck-vs', 'slide 39'] },
    { sec: 'bp', sys: 115, dia: 50, src: ['deck-vs', 'slide 39'] },
  ];
  function readItems() {
    const gen = [];
    for (let i = 0; i < 4; i++) {
      const k = pickOne(['hr', 'bp', 'temp', 'hr', 'bp']);
      if (k === 'hr') gen.push({ sec: 'hr', v: pickOne([45, 55, 65, 75, 95, 105, 115, 125, 135, 146]) });
      else if (k === 'temp') gen.push({ sec: 'temp', v: pickOne([35.5, 36.5, 37.5, 38.5, 39.5]) });
      else { const sys = pickOne([95, 105, 125, 135, 155, 165, 175]); gen.push({ sec: 'bp', sys, dia: pickOne([55, 65, 75, 85, 95]) }); }
    }
    return JANINE.slice().sort(() => Math.random() - 0.5).slice(0, 2).concat(gen);
  }
  function mountRead(root, api) {
    const { D, esc, srcChip, blip, addLog, shuffle } = api;
    const CH = D.CHART;
    let items, i, right;
    function start() { items = readItems(); i = 0; right = 0; render(); }
    const band = (key, v) => { const r = CH[key].rows[rowFor(CH[key], v)]; return isWrite(r) ? 'written: ' + v : r[0]; };
    function options(it) {
      const sec = CH[it.sec];
      if (it.sec === 'bp') {
        const ok = `Systolic about ${it.sys}, diastolic about ${it.dia}`;
        const wrong = [`Systolic about ${it.dia}, diastolic about ${it.sys}`, `Systolic about ${it.sys + 10}, diastolic about ${it.dia}`, `Systolic about ${it.sys}, diastolic about ${it.dia + 10}`, `Systolic about ${it.sys - 10}, diastolic about ${it.dia - 10}`];
        return { ok, all: [ok].concat(shuffle(wrong).slice(0, 3)) };
      }
      const ri = rowFor(sec, it.v), ok = band(it.sec, it.v);
      const near = [ri - 1, ri + 1, ri - 2, ri + 2].filter(x => x >= 0 && x < sec.rows.length).map(x => sec.rows[x][0]).filter(x => x !== ok);
      return { ok, all: [ok].concat(near.slice(0, 3)) };
    }
    function render() {
      if (i >= items.length) return done();
      const it = items[i];
      const col = it.sec === 'bp' ? { sys: it.sys, dia: it.dia } : { [it.sec]: it.v };
      const { svg } = drawChart(CH, [it.sec], [col], { current: null, noTime: true });
      const o = options(it);
      const q = it.sec === 'hr' ? 'What is this heart rate?' : it.sec === 'temp' ? 'What is this temperature?' : 'What is this blood pressure?';
      root.innerHTML = `
        <div class="seg" style="margin-top:0"><button data-go="#chart/vs">Plot it</button><button class="on">Read it</button><button data-href="paper.html">Real chart</button></div>
        <div class="progress"><i style="width:${Math.round(100 * i / items.length)}%"></i></div>
        <div class="small muted">${i + 1} of ${items.length}${it.src ? ' · from Janine’s ' + it.src[1] : ''}</div>
        <div class="chartbox narrow">${svg}</div>
        <div class="taskbar"><div class="q">${q}</div>
        ${shuffle(o.all).map(x => `<button class="opt" data-a="${esc(x)}">${esc(it.sec === 'bp' ? x : x.startsWith('written') ? 'Off the scale: ' + x.slice(9) + ', written in' : 'In the ' + x + ' row')}</button>`).join('')}
        <div id="fb"></div></div>`;
      root.dataset.ans = o.ok;   // answer key for tests/drive.mjs
      root.querySelector('[data-go]').onclick = () => { location.hash = '#chart/vs'; };
      root.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
        const ok = b.dataset.a === o.ok; if (ok) right++;
        blip(ok);
        root.querySelectorAll('[data-a]').forEach(x => { x.disabled = true; if (x.dataset.a === o.ok) x.classList.add('right'); else if (x === b) x.classList.add('wrong'); });
        const why = it.sec === 'bp' ? `The ↑ tip is on the systolic (${it.sys}); the ↓ tip is on the diastolic (${it.dia}). Read the TIPS, not the dotted line.` : `The ✕ sits in the ${o.ok} row${it.sec === 'hr' ? ', between ' + Math.floor(it.v / 10) * 10 + ' and ' + (Math.floor(it.v / 10) * 10 + 9) : ''}.`;
        root.querySelector('#fb').innerHTML = `<div class="card ${ok ? 'good' : 'bad'} small"><b>${ok ? 'Yes.' : 'Not quite.'}</b> ${esc(why)}<div class="chips">${srcChip(it.src || CH.src)}</div></div><div class="btns"><button class="btn primary block" id="nx">${i + 1 < items.length ? 'Next' : 'See how you did'}</button></div>`;
        root.querySelector('#nx').onclick = () => { i++; render(); window.scrollTo(0, 0); };
        root.querySelector('#nx').scrollIntoView({ block: 'nearest' });
      });
    }
    function done() {
      addLog({ type: 'chartread', t: new Date().toISOString(), right, total: items.length });
      root.innerHTML = `<div class="card ${right === items.length ? 'good' : 'warn'}"><div class="verdict ${right === items.length ? 'met' : ''}">${right} / ${items.length}</div><p class="small">Reading a chart is how the next nurse sees your work. If you can read it, you can write it.</p></div>
        <div class="btns"><button class="btn primary" id="again">Another 6</button><button class="btn" data-go="#chart/vs">Plot it</button></div>`;
      root.querySelector('#again').onclick = () => start();
      root.querySelector('[data-go]').onclick = () => { location.hash = '#chart/vs'; };
    }
    start();
  }

  window.CLS_CHARTVS = { mountVS, mountRead, makeObs, makeScenario, rowFor, ews, place, valueAt, layout, RH };
})();
