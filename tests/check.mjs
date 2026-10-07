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
for (const f of ['js/data.js', 'js/voice.js', 'js/bp.js', 'js/app.js', 'sw.js']) {
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
const longestRight = D.CURVE.filter(c => c.opts[0].length === Math.max(...c.opts.map(o => o.length))).length;
ok(longestRight <= Math.ceil(0.4 * D.CURVE.length), `right answer is the longest option in ${longestRight}/${D.CURVE.length} curveballs (max 40%)`);
console.log(`curveballs: right answer longest in ${longestRight}/${D.CURVE.length}`);

// drugs
for (const k of ['para', 'meto']) { const d = D.DRUGS[k]; ok(d.generic && d.indication && d.adverse && d.src.every(s => D.SRC[s[0]]), `drug ${k} incomplete`); }
for (const n of D.NORMALS) ok(D.SRC[n.src[0]], `normal ${n.k}: unknown source`);

// 3. wiring: files referenced exist
const html = read('index.html');
for (const m of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) ok(fs.existsSync(path.join(root, m[1])), `index.html references missing ${m[1]}`);
const sw = read('sw.js');
const shell = JSON.parse(sw.match(/const SHELL = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
for (const f of shell) if (f !== './') ok(fs.existsSync(path.join(root, f)), `sw.js SHELL lists missing ${f}`);

// 4. every CSS custom property used is defined (the estate's .kref bug)
const css = read('css/app.css') + read('js/app.js') + read('js/bp.js');
const defined = new Set([...read('css/app.css').matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
for (const m of new Set([...css.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]))) ok(defined.has(m), `CSS var ${m} used but never defined`);
// house rule: --acc is a FILL, never text colour
ok(!/(^|[^-\w])color:\s*var\(--acc\)/m.test(css), 'color:var(--acc) used as text (use --acc-tx)'); // accent-color is a fill: allowed

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
