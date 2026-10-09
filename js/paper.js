/* paper.js — practise on the REAL chart (10 Oct 2026). His ask: "use the one-to-one chart"; then "just do the easiest but
   highest yield thing". So: the Adult Vital Signs Chart exactly as it is in Janine's deck (slide 34), cleaned for printing
   (tools/build-paper.py), two stories of obs on Mr Luke to chart on it with a pen, and an answer key drawn ON the same chart.
   Where each mark goes is NOT worked out here: rows, zones and the EWS come from data.js (D.CHART) and chart-vs.js
   (place, ews), the same code that marks "Chart it". This file only knows where those rows sit on the picture (GEO). */
(function () {
  'use strict';
  const D = window.CLS_DATA, CH = D.CHART, CV = window.CLS_CHARTVS;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- where things are on the slide-34 picture (its own pixels; measured from the grid lines) ---------- */
  const GEO = {
    box: [150, 8, 962, 1110],                                  // print/vs-chart.png = this crop of the slide image
    colsL: [376, 410, 443, 477, 514, 548, 581, 615, 648, 682], // 9 columns, left half
    colsR: [716, 749, 783, 816, 850, 885, 919, 952, 986, 1020], // 9 columns, right half (the EWS key column sits between)
    date: [14, 39], time: [39, 58],
    rr: [58, 75, 94, 111, 129, 148, 166, 184],
    o2: [184, 201, 221],
    spo2: [221, 238, 256, 274, 291],
    temp: [291, 309, 326, 343, 360, 377, 394],
    bp: [394, 411, 429, 445, 463, 479, 495, 513, 530, 547, 564, 581, 598, 615, 633, 649, 665, 683, 699],
    hr: [699, 717, 735, 751, 769, 785, 803, 819, 837, 853, 869, 887, 903],
    loc: [903, 923, 940, 958, 977],
    ews: [977, 999],
  };
  const LOC = { A: ['Alert', 0], V: ['Voice', 1], P: ['Pain', 2], U: ['Unresponsive', 3] };

  /* ---------- the two stories. Values are chosen to hit the traps; `ews` is hand-worked and checked against ews() ---------- */
  const STORIES = [
    { id: 'A', half: 'L', title: 'Story A · Day 2, 18/08/22', date: '18/08',
      blurb: 'Mr Luke had his metoprolol CR and enalapril at 0800. Over the day his blood pressure and pulse drift down.',
      sets: [
        { time: '0730', rr: 16, o2: 'ra', spo2: 97, temp: 36.8, sys: 132, dia: 78, hr: 72, loc: 'A', ews: 0,
          note: 'A normal set still gets every value charted.' },
        { time: '1000', rr: 12, o2: 'ra', spo2: 98, temp: 36.9, sys: 110, dia: 60, hr: 64, loc: 'A', ews: 0,
          note: 'The demo video’s own numbers. 110 and 60 are round, so the tips go ON the lines: the ↑ on the line under the 110s, the ↓ on the line under the 60s (Janine at 17:03). RR 12 is still in the 12–20 box.' },
        { time: '1200', rr: 18, o2: 'ra', spo2: 96, temp: 37.0, sys: 120, dia: 70, hr: 58, loc: 'A', ews: 0,
          note: '37.0 sits ON the line between the 37s and the 36s. HR 58 is in the 50s row, still white.' },
        { time: '1400', rr: 20, o2: 'ra', spo2: 95, temp: 36.7, sys: 104, dia: 58, hr: 52, loc: 'A', ews: 2,
          note: 'Two yellows (SpO₂ 95, systolic 104). EWS 2: tell your RN; more frequent obs is the senior nurse’s call.' },
        { time: '1500', rr: 21, o2: 'ra', spo2: 94, temp: 36.6, sys: 96, dia: 54, hr: 48, loc: 'A', ews: 7,
          note: 'RR 21 is the first number in the orange 21–24 box. HR 48 drops into the orange 40s row. EWS 7: tell the nurse in charge; house officer within 60 minutes.' },
        { time: '1530', rr: 22, o2: 'ra', spo2: 95, temp: 36.5, sys: 86, dia: 50, hr: 44, loc: 'A', ews: 8,
          note: 'Systolic 86 is in the pink 80s row. ANY value in the pink zone means a registrar review within 30 minutes, before you even add up. Diastolic 50 sits ON the bottom line of the BP rows.' },
      ] },
    { id: 'B', half: 'R', title: 'Story B · Day 3 into day 4, 19/08 → 20/08/22', date: '19/08',
      blurb: 'A chest infection brewing overnight.',
      sets: [
        { time: '1800', rr: 18, o2: 'ra', spo2: 96, temp: 37.6, sys: 138, dia: 82, hr: 84, loc: 'A', ews: 0,
          note: '37.6: the X goes six-tenths of the way up the 37s row.' },
        { time: '2200', rr: 22, o2: 'ra', spo2: 94, temp: 38.2, sys: 142, dia: 84, hr: 96, loc: 'A', ews: 5,
          note: 'Four values moved. EWS 5 is still yellow: treat the fever, talk to the senior nurse about more frequent obs, write it down.' },
        { time: '0200', date: '20/08', rr: 24, o2: 2, spo2: 93, temp: 38.9, sys: 128, dia: 74, hr: 108, loc: 'A', ews: 8,
          note: 'NEW DATE: it’s past midnight, so this column is 20/08. He’s on oxygen now: write 2 on the Supplement row. That row scores 2 by itself.' },
        { time: '0230', date: '20/08', rr: 28, o2: 4, spo2: 91, temp: 40.1, sys: 98, dia: 56, hr: 146, loc: 'V', ews: 18,
          note: 'Two values are OFF the scale, so you WRITE them: 40.1 in the ≥39s row, 146 in the “Write if ≥140” row. HR 146 is blue: dial 777 whatever the total. Responds to voice only = pink.' },
      ] },
  ];

  /* ---------- value → spot on the picture, via chart-vs.js's own place() ---------- */
  const LAY = CV.layout(CH, CH.order);
  function spot(key, v) {
    const p = CV.place(CH, LAY, key, v);
    if (!p) return null;
    const f = (p.y - LAY[key].rowsTop) / CV.RH - p.ri, r = GEO[key];
    return { ri: p.ri, y: r[p.ri] + f * (r[p.ri + 1] - r[p.ri]), write: !!p.write, row: CH[key].rows[p.ri] };
  }
  const mid = (key, ri) => (GEO[key][ri] + GEO[key][ri + 1]) / 2;
  function colX(story, i) { const c = story.half === 'L' ? GEO.colsL : GEO.colsR; return [c[i], c[i + 1]]; }
  const obsOf = s => ({ rr: s.rr, o2: s.o2 === 'ra' ? 'ra' : String(s.o2), spo2: s.spo2, temp: s.temp, sys: s.sys, dia: s.dia, hr: s.hr, loc: s.loc });
  const score = s => CV.ews(CH, obsOf(s));

  /* ---------- the answer marks, drawn like a pen would ---------- */
  function marks(story) {
    let out = '';
    story.sets.forEach((s, i) => {
      const [x0, x1] = colX(story, i), cx = (x0 + x1) / 2;
      const txt = (y, t, size, cls) => `<text x="${cx}" y="${y}" font-size="${size}" class="${cls || ''}" text-anchor="middle" dominant-baseline="central">${esc(t)}</text>`;
      const X = y => `<path class="pen" d="M${cx - 5} ${y - 4} L${cx + 5} ${y + 4} M${cx + 5} ${y - 4} L${cx - 5} ${y + 4}"/>`;
      const tick = y => `<path class="pen" d="M${cx - 5} ${y} L${cx - 1.5} ${y + 4} L${cx + 6} ${y - 5}"/>`;
      const g = [];
      g.push(txt(mid('date', 0), s.date || story.date, 8));
      g.push(txt(mid('time', 0), s.time, 10));
      const rr = spot('rr', s.rr); g.push(txt(mid('rr', rr.ri), s.rr, 12));
      g.push(s.o2 === 'ra' ? tick(mid('o2', 0)) : txt(mid('o2', 1), s.o2, 12));
      const sp = spot('spo2', s.spo2); g.push(txt(mid('spo2', sp.ri), s.spo2, 12));
      const t = spot('temp', s.temp); g.push(t.write ? txt(mid('temp', t.ri), s.temp.toFixed(1), 9.5) : X(t.y));
      const sy = spot('bp', s.sys), di = spot('bp', s.dia);
      if (sy.write) g.push(txt(mid('bp', sy.ri), s.sys, 10));
      else {
        g.push(`<path class="pen" d="M${cx - 5} ${sy.y + 7} L${cx} ${sy.y} L${cx + 5} ${sy.y + 7}"/>`);
        g.push(`<path class="pen dot" d="M${cx} ${sy.y + 1} L${cx} ${di.y - 1}"/>`);
      }
      g.push(`<path class="pen" d="M${cx - 5} ${di.y - 7} L${cx} ${di.y} L${cx + 5} ${di.y - 7}"/>`);
      const h = spot('hr', s.hr); g.push(h.write ? txt(mid('hr', h.ri), s.hr, 10) : X(h.y));
      g.push(tick(mid('loc', LOC[s.loc][1])));
      g.push(txt(mid('ews', 0), score(s).total, 12, 'tot'));
      out += `<g data-set="${story.id}${i + 1}">${g.join('')}</g>`;
    });
    return out;
  }
  function chartFigure(withAnswers) {
    const [bx, by, bw, bh] = GEO.box;
    const svg = withAnswers ? `<svg class="ink" viewBox="${bx} ${by} ${bw} ${bh}" preserveAspectRatio="none" aria-hidden="true">${STORIES.map(marks).join('')}</svg>` : '';
    return `<div class="paperbox"><img src="print/vs-chart.png" width="${bw}" height="${bh}" alt="The Adult Vital Signs Chart from Janine’s deck, slide 34${withAnswers ? ', with the answers written in' : ', blank'}">${svg}</div>`;
  }

  /* ---------- the words ---------- */
  const ZN = { w: 'white 0', y: 'yellow 1', o: 'orange 2', p: 'pink 3', b: 'BLUE: 777' };
  const RULES = [
    ['Date and 24-hour time', 'at the top of the column. Past midnight? New date.', ['deck-vs', 'slide 33']],
    ['Respiratory rate and SpO₂', 'write the number in the box for its band.', ['deck-vs', 'slide 34: printed on the chart']],
    ['Oxygen', 'tick Room air, or write the L/min on the Supplement row (that row scores 2 by itself).', ['deck-vs', 'slide 34: printed on the chart']],
    ['Temperature and heart rate', 'an X at the exact value inside the row. Off the scale? Write the number instead.', ['deck-vs', 'slide 34: printed on the chart']],
    ['Blood pressure', 'an ↑ arrowhead with its tip ON the systolic, a ↓ arrowhead with its tip ON the diastolic, a dotted line between. Only the systolic scores.', ['vid-vs', '17:03 + slide 39']],
    ['Round numbers', 'sit ON a line: 110 is the line between the 110s and the 100s rows.', ['vid-vs', '17:03']],
    ['Level of consciousness', 'tick the row.', ['deck-vs', 'slide 34: printed on the chart']],
    ['EWS', 'each value scores its zone colour: white 0, yellow 1, orange 2, pink 3, blue = call 777. Add them up, write the total, then follow the pathway.', ['deck-vs', 'slide 34']],
    ['Pen', 'blue or black. A mistake gets ONE line through it, so it can still be read.', ['deck-vs', 'slide 33']],
  ];
  const srcTxt = src => { const s = D.SRC[src[0]]; return (s ? s.label : src[0]) + (src[1] ? ' · ' + src[1] : ''); };
  const o2Txt = s => s.o2 === 'ra' ? 'RA' : s.o2 + ' L';
  function obsTable(story) {
    let lastDate = story.date;
    const rows = story.sets.map(s => {
      const d = s.date && s.date !== lastDate ? `<tr class="newdate"><td colspan="8">${esc(s.date)}</td></tr>` : '';
      if (s.date) lastDate = s.date;
      return d + `<tr><td><b>${s.time}</b></td><td>${s.rr}</td><td>${o2Txt(s)}</td><td>${s.spo2}</td><td>${s.temp.toFixed(1)}</td><td>${s.sys}/${s.dia}</td><td>${s.hr}</td><td>${s.loc}</td></tr>`;
    }).join('');
    return `<table class="obs"><thead><tr><th>Time</th><th>RR</th><th>O₂</th><th>SpO₂</th><th>Temp</th><th>BP</th><th>HR</th><th>LOC</th></tr></thead>
      <tbody><tr class="newdate"><td colspan="8">${esc(story.date)}</td></tr>${rows}</tbody></table>`;
  }
  function placeTxt(key, v) {
    const p = spot(key, v), lab = p.row[0].replace(/^≥ (\d+) \(write it\)$/, 'Write if ≥ $1');   // as printed on the chart
    if (p.write) return `WRITE ${v} in the “${lab}” row`;
    if (CH[key].mark === 'num') return `in the ${lab} box`;
    const f = (p.y - GEO[key][p.ri]) / (GEO[key][p.ri + 1] - GEO[key][p.ri]);
    return f > 0.97 ? `ON the line under the ${lab}` : `in the ${lab} row`;
  }
  function answerCard(story, s, i) {
    const e = score(s), tier = CH.pathway.find(p => p.id === e.tier);
    const z = k => ZN[e.z[k]];
    const items = [
      ['RR ' + s.rr, placeTxt('rr', s.rr), z('rr')],
      ['O₂ ' + (s.o2 === 'ra' ? 'room air' : s.o2 + ' L/min'), s.o2 === 'ra' ? 'tick Room air' : `write ${s.o2} on the Supplement row`, z('o2')],
      ['SpO₂ ' + s.spo2, placeTxt('spo2', s.spo2), z('spo2')],
      ['Temp ' + s.temp.toFixed(1), placeTxt('temp', s.temp), z('temp')],
      ['BP ' + s.sys + '/' + s.dia, '↑ ' + placeTxt('bp', s.sys) + ' · ↓ ' + placeTxt('bp', s.dia), z('bp') + ' (systolic)'],
      ['HR ' + s.hr, placeTxt('hr', s.hr), z('hr')],
      ['LOC', 'tick ' + LOC[s.loc][0], z('loc')],
    ];
    return `<div class="card ans" data-ans="${story.id}${i + 1}">
      <div class="anshd"><b>${esc(s.date || story.date)} · ${s.time}</b><span class="ewsb z-${e.tier}">EWS ${e.total}</span></div>
      <ul class="anslist">${items.map(([a, b, c]) => `<li><b>${esc(a)}</b> <span>${esc(b)}</span> <i>${esc(c)}</i></li>`).join('')}</ul>
      <p class="small"><b>${esc(tier.when)}:</b> ${esc(tier.do)}</p>
      <p class="small muted">${esc(s.note)}</p></div>`;
  }

  /* ---------- page ---------- */
  function render(root) {
    root.innerHTML = `
      <div class="card noprint" id="help" hidden>
        <b>What is this?</b>
        <p class="small">The real Adult Vital Signs Chart, the picture from Janine’s deck (slide 34), so you practise on the paper you’ll be marked on. Print the chart (or open it in a pen app), chart the obs below, then check against the answers drawn on the same chart.</p>
        <p class="small"><b>What’s made up:</b> the obs. They’re practice numbers for Mr Luke, picked to hit the traps (round numbers, off-scale values, a new date after midnight, oxygen). <b>What isn’t:</b> the chart, its zones and its escalation pathway. That pathway is the Auckland print in Janine’s deck; your placement’s chart may word it differently.</p>
        <p class="small muted">For the admin: the page is <code>paper.html</code> + <code>js/paper.js</code>. The picture is made by <code>python tools/build-paper.py</code>, the PDF by <code>node tools/build-paper-pdf.mjs</code>. Rows, zones and scores come from <code>js/data.js</code> + <code>js/chart-vs.js</code>, the same code as “Chart it”. <code>tests/check.mjs</code> re-adds every EWS by hand.</p>
      </div>
      <div class="card noprint">
        <b>Chart on the real chart.</b>
        <p class="small">1. Print the blank chart, or save it to a pen app. &nbsp;2. Chart <b>Story A in the left half</b> and <b>Story B in the right half</b>, one column per set. &nbsp;3. Add up each column’s EWS and say what you’d do. &nbsp;4. Then open the answers.</p>
        <div class="btns"><button class="btn primary" id="printBtn">🖨️ Print the pack</button><a class="btn" href="print/vs-chart-practice.pdf" download>⬇ PDF</a><a class="btn" href="print/vs-chart.png" target="_blank" rel="noopener">Blank chart only</a></div>
      </div>
      <section class="pg pg1">
        <h2 class="printonly">Real chart practice · Mr Luke (John Luke, DOB 16/12/1942, NHI DGY 2963)</h2>
        <details class="rules" open><summary><b>How to chart on this chart</b></summary>
          <ol class="rulelist">${RULES.map(([a, b, src]) => `<li><b>${esc(a)}:</b> ${esc(b)} <span class="srcnote">${esc(srcTxt(src))}</span></li>`).join('')}</ol>
        </details>
        ${STORIES.map(st => `<h3>${esc(st.title)} <span class="small muted">→ the ${st.half === 'L' ? 'left' : 'right'} half</span></h3><p class="small">${esc(st.blurb)}</p>${obsTable(st)}`).join('')}
        <p class="small muted">RA = room air · 2 L = 2 L/min oxygen · A = alert · V = responds to voice</p>
      </section>
      <section class="pg pg2">
        <h3>The chart <span class="small muted">· blank<span class="noprint"> · tap to zoom</span></span></h3>
        <a href="print/vs-chart.png" target="_blank" rel="noopener" class="zoom">${chartFigure(false)}</a>
      </section>
      <div class="btns noprint"><button class="btn primary block" id="ansBtn">I’ve charted it: show the answers</button></div>
      <div class="answers collapsed" id="answers">
        <section class="pg pg3">
          <h2>Answers <span class="small muted">· turn this over until you’ve charted</span></h2>
          ${chartFigure(true)}
          <p class="small muted">Blue = what your pen should have written. Compare column by column: same row, same spot in the row, same arrows.</p>
        </section>
        <section class="pg pg4">
          ${STORIES.map(st => `<h3>${esc(st.title)}</h3><div class="ansgrid">${st.sets.map((s, i) => answerCard(st, s, i)).join('')}</div>`).join('')}
        </section>
        <section class="pg pg5">
          <h3>The escalation pathway printed on the chart</h3>
          <img class="panel" src="print/escalation.png" width="605" height="1118" alt="The mandatory escalation pathway panel from the chart in Janine’s deck, slide 34">
        </section>
      </div>`;
    root.querySelector('#printBtn').onclick = () => window.print();
    root.querySelector('#ansBtn').onclick = e => {
      const a = root.querySelector('#answers'), open = a.classList.toggle('collapsed') === false;
      e.target.textContent = open ? 'Hide the answers' : 'I’ve charted it: show the answers';
      if (open) a.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // tells the trainer's “Decide for me” this step is done (same `cls.seen` the app writes)
      if (open) try { const s = JSON.parse(localStorage.getItem('cls.seen') || '{}'); s.paper = Date.now(); localStorage.setItem('cls.seen', JSON.stringify(s)); } catch (err) { }
    };
  }

  /* header buttons */
  document.getElementById('themeBtn').onclick = () => {
    const now = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', now);
    try { localStorage.setItem('hub.theme', now); } catch (e) { }
  };
  document.getElementById('helpBtn').onclick = () => { const h = document.getElementById('help'); h.hidden = !h.hidden; if (!h.hidden) h.scrollIntoView({ block: 'nearest' }); };
  render(document.getElementById('paper'));
  window.CLS_PAPER = { GEO, STORIES, spot, score, LOC };
})();
