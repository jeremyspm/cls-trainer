// node tests/check.mjs — content + wiring gate for the CLS trainer. Exit 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FAIL ' + msg); } };

// 1. every script parses as a classic script
for (const f of ['js/data.js', 'js/rnq-data.js', 'js/voice.js', 'js/bp.js', 'js/chart-vs.js', 'js/chart.js', 'js/app.js', 'js/paper.js', 'sw.js']) {
  try { new vm.Script(read(f), { filename: f }); ok(true); } catch (e) { ok(false, `${f} does not parse: ${e.message}`); }
}

// 2. load data + voice in a sandbox
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(read('js/data.js'), sandbox);
vm.runInContext(read('js/voice.js'), sandbox);
const D = sandbox.window.CLS_DATA, V = sandbox.window.Voice;
ok(D && V, 'data.js / voice.js did not register');

const fill = (s, ctx) => s == null ? s : String(s).replace(/\{(\w+)\}/g, (m, k) => ctx && ctx[k] != null ? ctx[k] : m);
const rubricIds = run => D.RUBRIC[run].sections.flatMap(s => s.lines.map(l => l[0]));

for (const run of ['vs', 'ma']) {
  const S = D.STEPS[run];
  const ids = S.map(s => s.id);
  ok(new Set(ids).size === ids.length, `${run}: duplicate step ids`);
  const rIds = rubricIds(run);
  // every rubric line earned by at least one step you perform
  for (const id of rIds) ok(S.some(s => (s.kind === 'do' || s.kind === 'say') && (s.lines || []).includes(id)), `${run}: rubric line ${id} is not earned by any do/say step`);
  for (const s of S) {
    ok(['do', 'say', 'pt', 'rn'].includes(s.kind), `${s.id}: bad kind ${s.kind}`);
    ok(s.src && D.SRC[s.src[0]], `${s.id}: missing/unknown source`);
    ok(s.ph && s.t, `${s.id}: needs ph + t`);
    for (const l of s.lines || []) ok(rIds.includes(l), `${s.id}: unknown rubric line ${l}`);
    if (s.kind === 'say') { ok(s.line && s.keys && s.keys.length, `${s.id}: say step needs line + keys`); ok(s.to === 'pt' || s.to === 'rn', `${s.id}: say step needs to`); }
    if (s.kind === 'pt' || s.kind === 'rn') ok(!!s.line, `${s.id}: ${s.kind} step needs a line`);
    if (s.kind === 'do') ok(!!s.cue, `${s.id}: do step needs a cue`);
  }
  // placeholders resolve for every drug, and each model line satisfies its own keys
  const ctxs = run === 'ma' ? ['para', 'meto'].map(k => [k, D.FILL[k]]) : [['-', {}]];
  for (const [dk, ctx] of ctxs) {
    for (const s of S) {
      for (const f of ['t', 'cue', 'line']) ok(!/\{\w+\}/.test(fill(s[f], ctx) || ''), `${s.id} (${dk}): unfilled placeholder in ${f}: ${fill(s[f], ctx)}`);
      if (s.keys) {
        const keys = s.keys.map(g => g.map(a => fill(a, ctx)));
        ok(!keys.flat().some(a => /\{\w+\}/.test(a)), `${s.id} (${dk}): unfilled placeholder in keys`);
        const hit = V.match(fill(s.line, ctx), keys);
        ok(hit.every(Boolean), `${s.id} (${dk}): its own model line does not satisfy key group(s) ${hit.map((h, i) => h ? '' : JSON.stringify(keys[i])).filter(Boolean).join(' ')}`);
      }
    }
  }
}

// curveballs
const cIds = D.CURVE.map(c => c.id);
ok(new Set(cIds).size === cIds.length, 'duplicate curveball ids');
for (const c of D.CURVE) {
  ok(D.STEPS[c.run] && D.STEPS[c.run].some(s => s.id === c.at), `${c.id}: at=${c.at} is not a step in ${c.run}`);
  ok(Array.isArray(c.opts) && c.opts.length === 4 && new Set(c.opts).size === 4, `${c.id}: needs 4 distinct options`);
  ok(!!c.why && c.src && D.SRC[c.src[0]], `${c.id}: needs why + known source`);
  ok(c.line || c.title, `${c.id}: needs a line or a title`);
  if (c.drug) ok(D.FILL[c.drug], `${c.id}: unknown drug ${c.drug}`);
  for (const l of c.lines || []) ok(rubricIds(c.run).includes(l), `${c.id}: unknown rubric line ${l}`);
  for (const dk of c.run === 'ma' ? (c.drug ? [c.drug] : ['para', 'meto']) : ['-']) {
    const ctx = D.FILL[dk] || {};
    ok(!/\{\w+\}/.test(fill(c.line || '', ctx) + fill(c.title || '', ctx)), `${c.id} (${dk}): unfilled placeholder`);
  }
  // the right answer must not stand out by length (shape leak): at most 20% longer than the longest wrong option
  const lens = c.opts.map(o => o.length);
  ok(lens[0] <= 1.2 * Math.max(...lens.slice(1)), `${c.id}: right answer is ${lens[0]} chars vs longest wrong ${Math.max(...lens.slice(1))} (length leak)`);
}
const longestRight = D.CURVE.filter(c => c.opts[0].length > Math.max(...c.opts.slice(1).map(o => o.length))).length;
ok(longestRight <= Math.ceil(0.4 * D.CURVE.length), `right answer is the longest option in ${longestRight}/${D.CURVE.length} curveballs (max 40%)`);
console.log(`curveballs: right answer longest in ${longestRight}/${D.CURVE.length}`);

// "The RN asks…" question bank
vm.runInContext(read('js/rnq-data.js'), sandbox);
const RNQ = sandbox.window.CLS_RNQ || [];
ok(RNQ.length >= 40, `RN question bank has only ${RNQ.length} questions`);
const rIdsQ = RNQ.map(q => q.id);
ok(new Set(rIdsQ).size === rIdsQ.length, 'duplicate RN question ids');
const qTexts = RNQ.map(q => q.q);
ok(new Set(qTexts).size === qTexts.length, 'two RN questions share the same wording (ambiguous when both drugs are on): ' + qTexts.filter((t, i) => qTexts.indexOf(t) !== i).join(' | '));
for (const q of RNQ) {
  ok(['vs', 'ma', 'both'].includes(q.run), `${q.id}: bad run ${q.run}`);
  ok(!q.drug || ['para', 'meto'].includes(q.drug), `${q.id}: bad drug ${q.drug}`);
  ok(q.topic && q.q && q.a, `${q.id}: needs topic, q, a`);
  ok(q.src && D.SRC[q.src[0]], `${q.id}: missing/unknown source ${q.src && q.src[0]}`);
  ok(Array.isArray(q.keys) && q.keys.length && q.keys.every(g => g.length), `${q.id}: needs key groups`);
  const hit = V.match(q.a, q.keys);
  ok(hit.every(Boolean), `${q.id}: its own short answer misses key group(s) ${hit.map((h, i) => h ? '' : JSON.stringify(q.keys[i])).filter(Boolean).join(' ')}`);
  ok(Array.isArray(q.opts) && q.opts.length === 4 && new Set(q.opts).size === 4, `${q.id}: needs 4 distinct options`);
  const L = q.opts.map(o => o.length);
  ok(L[0] <= 1.2 * Math.max(...L.slice(1)), `${q.id}: right option ${L[0]} chars vs longest wrong ${Math.max(...L.slice(1))} (length leak)`);
  ok(q.a.split('\n').length <= 4, `${q.id}: short answer over 4 lines`);
}
// strictly longest only: a tie gives the eye nothing to go on
const rnqLongest = RNQ.filter(q => q.opts[0].length > Math.max(...q.opts.slice(1).map(o => o.length))).length;
ok(rnqLongest <= Math.ceil(0.4 * RNQ.length), `RN questions: right option is the longest in ${rnqLongest}/${RNQ.length} (max 40%)`);
console.log(`RN questions: ${RNQ.length}; right option longest in ${rnqLongest}`);

// the vital signs chart: every plausible value lands in exactly ONE row; zones are known; scenarios always plot
vm.runInContext(read('js/chart-vs.js'), sandbox);
vm.runInContext(read('js/chart.js'), sandbox);
const CH = sandbox.window.CLS_CHART;
for (const [sec, lo, hi, step] of [['temp', 33, 41, 0.1], ['hr', 30, 160, 1], ['rr', 0, 45, 1], ['bp', 50, 240, 1], ['spo2', 80, 100, 1]]) {
  for (let v = lo; v <= hi + 1e-9; v = Math.round((v + step) * 10) / 10) {
    const hits = D.CHART[sec].rows.filter(r => v >= r[1] && v <= r[2]).length;
    if (hits !== 1) { ok(false, `chart ${sec}: value ${v} lands in ${hits} rows`); break; }
  }
  ok(D.CHART[sec].rows.every(r => D.ZONES[r[3]]), `chart ${sec}: unknown zone`);
}
for (let i = 0; i < 2000; i++) {
  const o = CH.makeObs();
  const bad = [['temp', o.temp], ['hr', o.hr], ['rr', o.rr], ['bp', o.sys], ['bp', o.dia]].find(([s, v]) => CH.rowFor(D.CHART[s], v) < 0);
  if (bad || !/^\d{4}$/.test(o.time24) || !/^\d{1,2}:\d{2} (am|pm)$/.test(o.time12)) { ok(false, `chart scenario can't be plotted: ${JSON.stringify(o)}`); break; }
}
// Chart it v2: where a value is drawn must read back as that value; row lines sit exactly on the round numbers
{
  const L = CH.layout(D.CHART, D.CHART.order);
  ok(D.CHART.order.every(k => D.CHART[k]), 'CHART.order names an unknown section');
  for (const [key, lo, hi, step] of [['temp', 34, 39.9, 0.1], ['hr', 30, 139, 1], ['bp', 50, 219, 1]]) {
    for (let v = lo; v <= hi + 1e-9; v = Math.round((v + step) * 10) / 10) {
      const p = CH.place(D.CHART, L, key, v);
      if (!p || p.write) { ok(false, `chart ${key} ${v}: not plottable`); break; }
      const back = CH.valueAt(D.CHART, L, key, Math.min(p.y, L[key].rowsTop + L[key].n * CH.RH - 1e-6));
      // a value ON a line is drawn on the row's bottom edge: reading back just inside the row gives the same value
      if (!back || Math.abs(back.v - v) > 1e-6) { ok(false, `chart ${key} ${v}: drawn at y=${p.y.toFixed(2)} reads back ${back && back.v}`); break; }
    }
  }
  const at = (key, v) => CH.place(D.CHART, L, key, v).y;
  const rowTop = (key, label) => L[key].rowsTop + D.CHART[key].rows.findIndex(r => r[0] === label) * CH.RH;
  ok(Math.abs(at('bp', 110) - rowTop('bp', '100s')) < 1e-9, 'chart: BP 110 is not ON the line between the 110s and 100s rows');
  ok(Math.abs(at('bp', 60) - rowTop('bp', '50s')) < 1e-9, 'chart: BP 60 is not ON the line between the 60s and 50s rows');
  ok(Math.abs(at('temp', 37) - rowTop('temp', '36s')) < 1e-9, 'chart: 37.0 is not ON the line between the 37s and 36s rows');
  ok(CH.place(D.CHART, L, 'hr', 146).write && CH.place(D.CHART, L, 'bp', 224).write && CH.place(D.CHART, L, 'temp', 40.2).write, 'chart: off-scale values must be written, not marked');
  // EWS tiers land where the pathway on the chart says
  const base = { temp: 36.8, hr: 76, rr: 16, sys: 124, dia: 74, spo2: 98, o2: 'ra', loc: 'A' };
  const tier = o => CH.ews(D.CHART, Object.assign({}, base, o));
  ok(tier({}).total === 0 && tier({}).tier === 't0', 'EWS: a normal set must score 0 / routine');
  ok(tier({ temp: 38.3 }).total === 1 && tier({ temp: 38.3 }).tier === 't1', 'EWS: temp 38.3 must score 1 (t1)');
  ok(tier({ hr: 132 }).tier === 't3', 'EWS: HR in the 130s (pink) must trigger t3');
  ok(tier({ hr: 146 }).tier === 't4', 'EWS: HR 140+ (blue) must trigger t4');
  ok(tier({ temp: 39.2, hr: 112, rr: 22, spo2: 95 }).total === 7 && tier({ temp: 39.2, hr: 112, rr: 22, spo2: 95 }).tier === 't2', 'EWS: 2+2+2+1 = 7 must be t2');
  ok(D.CHART.pathway.length === 5 && D.SRC[D.CHART.pathwaySrc[0]], 'EWS pathway incomplete');
  for (let i = 0; i < 2000; i++) {
    const sc = CH.makeScenario();
    const all = [sc.cur].concat(sc.prev);
    const bad = all.find(o => ['temp', 'hr', 'rr', 'spo2'].some(k => CH.rowFor(D.CHART[k], o[k]) < 0) || CH.rowFor(D.CHART.bp, o.sys) < 0 || CH.rowFor(D.CHART.bp, o.dia) < 0 || o.dia >= o.sys);
    const times = sc.prev.map(o => +o.time24).concat(+sc.cur.time24);
    if (bad || !(times[0] < times[1] && times[1] < times[2])) { ok(false, 'chart scenario not plottable or out of order: ' + JSON.stringify(sc)); break; }
  }
}

// Real chart practice (paper.html): the answer marks sit on the real chart's rows, and every hand-worked EWS agrees
{
  const dummy = { querySelector: () => ({}), set innerHTML(v) { dummy.html = v; }, html: '' };
  sandbox.document = { getElementById: () => dummy, querySelectorAll: () => [] };
  vm.runInContext(read('js/paper.js'), sandbox);
  const P = sandbox.window.CLS_PAPER;
  ok(P && dummy.html.length > 1000, 'paper.js did not render');
  const G = P.GEO;
  for (const k of D.CHART.order) {
    ok(G[k] && G[k].length === D.CHART[k].rows.length + 1, `paper GEO.${k}: ${G[k] && G[k].length - 1} rows measured, the chart has ${D.CHART[k].rows.length}`);
    ok(G[k] && G[k].every((y, i) => i === 0 || y > G[k][i - 1]), `paper GEO.${k}: row lines not top to bottom`);
  }
  for (const [a, b] of [['date', 'time'], ['time', 'rr'], ['rr', 'o2'], ['o2', 'spo2'], ['spo2', 'temp'], ['temp', 'bp'], ['bp', 'hr'], ['hr', 'loc'], ['loc', 'ews']])
    ok(G[a][G[a].length - 1] === G[b][0], `paper GEO: ${a} does not end where ${b} starts`);
  ok(G.colsL.length === 10 && G.colsR.length === 10 && G.colsL[9] < G.colsR[0], 'paper GEO: needs 9 + 9 columns, left half first');
  const png = fs.readFileSync(path.join(root, 'print/vs-chart.png'));
  ok(png.readUInt32BE(16) === G.box[2] && png.readUInt32BE(20) === G.box[3], `print/vs-chart.png is ${png.readUInt32BE(16)}×${png.readUInt32BE(20)}, GEO.box says ${G.box[2]}×${G.box[3]} (re-run tools/build-paper.py)`);
  for (const f of ['print/escalation.png', 'print/vs-chart-practice.pdf']) ok(fs.existsSync(path.join(root, f)), `missing ${f} (tools/build-paper.py, tools/build-paper-pdf.mjs)`);
  const sets = P.STORIES.flatMap(st => st.sets.map((s, i) => Object.assign({ tag: st.id + (i + 1), half: st.half, n: st.sets.length }, s)));
  for (const st of P.STORIES) ok(st.sets.length <= 9, `paper story ${st.id}: more sets than the 9 columns in its half`);
  ok(new Set(P.STORIES.map(s => s.half)).size === P.STORIES.length, 'paper: two stories share a half of the chart');
  for (const s of sets) {
    const sp = [['rr', s.rr], ['spo2', s.spo2], ['temp', s.temp], ['bp', s.sys], ['bp', s.dia], ['hr', s.hr]].map(([k, v]) => [k, v, P.spot(k, v)]);
    for (const [k, v, p] of sp) ok(p && p.y >= G[k][0] && p.y <= G[k][G[k].length - 1], `paper ${s.tag}: ${k} ${v} has no place on the chart`);
    ok(s.dia < s.sys && P.LOC[s.loc] && /^\d{4}$/.test(s.time), `paper ${s.tag}: bad BP, LOC or time`);
    ok(P.score(s).total === s.ews, `paper ${s.tag}: hand-worked EWS ${s.ews} but the chart's zones give ${P.score(s).total}`);
    ok(!!s.note, `paper ${s.tag}: needs a note`);
  }
  // the traps the stories exist for
  const tiers = sets.map(s => P.score(s).tier);
  const onLine = sets.some(s => s.sys % 10 === 0 && s.dia % 10 === 0) && sets.some(s => s.temp % 1 === 0);
  ok(onLine, 'paper: no round BP / whole-degree temp (values ON a line)');
  ok(sets.some(s => P.spot('hr', s.hr).write) && sets.some(s => P.spot('temp', s.temp).write), 'paper: needs an off-scale HR AND temp (written, not marked)');
  ok(sets.some(s => s.o2 !== 'ra') && sets.some(s => s.loc !== 'A') && sets.some(s => s.date), 'paper: needs supplemental O2, a LOC change and a date change');
  ok(['t0', 't1', 't2', 't3', 't4'].every(t => tiers.includes(t)), 'paper: the stories must reach every step of the pathway, got ' + [...new Set(tiers)].join(' '));
  delete sandbox.document;
}

// drugs
for (const k of ['para', 'meto']) { const d = D.DRUGS[k]; ok(d.generic && d.indication && d.adverse && d.src.every(s => D.SRC[s[0]]), `drug ${k} incomplete`); }
for (const n of D.NORMALS) ok(D.SRC[n.src[0]], `normal ${n.k}: unknown source`);

// 3. wiring: files referenced exist
for (const page of ['index.html', 'paper.html']) {
  const html = read(page);
  for (const m of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) ok(fs.existsSync(path.join(root, m[1])), `${page} references missing ${m[1]}`);
}
for (const m of read('js/paper.js').matchAll(/(?:src|href)="(print\/[^"]+)"/g)) ok(fs.existsSync(path.join(root, m[1])), `js/paper.js references missing ${m[1]}`);
const sw = read('sw.js');
const shell = JSON.parse(sw.match(/const SHELL = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
for (const f of shell) if (f !== './') ok(fs.existsSync(path.join(root, f)), `sw.js SHELL lists missing ${f}`);

// 4. every CSS custom property used is defined (the estate's .kref bug)
const css = read('css/app.css') + read('js/app.js') + read('js/bp.js') + read('paper.html') + read('js/paper.js');
const defined = new Set([...(read('css/app.css') + read('paper.html')).matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
for (const m of new Set([...css.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]))) ok(defined.has(m), `CSS var ${m} used but never defined`);
// house rule: --acc is a FILL, never text colour
ok(!/(^|[^-\w])color:\s*var\(--acc\)/m.test(css), 'color:var(--acc) used as text (use --acc-tx)'); // accent-color is a fill: allowed

// 5. every line the app can speak has a recorded clip (tools/voice-jobs.mjs --check)
{
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [path.join(root, 'tools', 'voice-jobs.mjs'), '--check'], { encoding: 'utf8' });
  process.stdout.write(r.stdout);
  ok(r.status === 0, 'voice clips are missing or stale (see above)');
}

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
