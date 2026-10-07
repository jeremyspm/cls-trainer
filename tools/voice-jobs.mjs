// node tools/voice-jobs.mjs — list every line the app can speak, exactly as Voice.speak will key it,
// and write tools/voice-jobs.json for tools/render_voices.py (Kokoro, local). Re-run after any content change;
// the renderer only renders keys it doesn't already have and deletes clips nothing points at.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const sb = { window: {}, console };
vm.createContext(sb);
for (const f of ['js/data.js', 'js/rnq-data.js', 'js/voice.js']) vm.runInContext(read(f), sb);
const D = sb.window.CLS_DATA, V = sb.window.Voice, RNQ = sb.window.CLS_RNQ;

// the SAME resolution app.js uses (steps(): fill placeholders, capitalise the line)
const fill = (s, ctx) => s == null ? s : String(s).replace(/\{(\w+)\}/g, (m, k) => ctx && ctx[k] != null ? ctx[k] : m);
const cap = x => (x ? x.charAt(0).toUpperCase() + x.slice(1) : x);
const steps = (run, drug) => {
  const ctx = run === 'ma' ? D.FILL[drug || 'para'] : {};
  return D.STEPS[run].map(s => Object.assign({}, s, { t: fill(s.t, ctx), line: cap(fill(s.line, ctx)) }));
};
const voiceOf = s => (s.kind === 'pt' ? 'pt' : s.kind === 'rn' ? 'rn' : 'you');

const jobs = new Map();
const add = (who, raw, why) => { if (!raw) return; const key = V.key(who, raw); if (!jobs.has(key)) jobs.set(key, { key, who, text: V.speakable(raw), why }); };

for (const [run, drugs] of [['vs', [null]], ['ma', ['para', 'meto']]]) {
  for (const drug of drugs) {
    for (const s of steps(run, drug)) {
      if (s.line) add(voiceOf(s), s.line, s.id);       // walkthrough ▶ + live pt/rn lines
      else add('you', s.t, s.id);                      // walkthrough "play the whole scene" reads a do-step's title
    }
    const ctx = run === 'ma' ? D.FILL[drug] : {};
    for (const c of D.CURVE.filter(c => c.run === run && (!c.drug || c.drug === drug))) {
      if (c.line) add(c.who === 'rn' ? 'rn' : 'pt', fill(c.line, ctx), c.id);
    }
  }
}
for (const q of RNQ) add('rn', q.q, q.id);

// --check: fail if any line the app can speak has no recorded clip, or speakable() isn't idempotent
if (process.argv.includes('--check')) {
  let bad = 0;
  const man = fs.existsSync(path.join(root, 'audio', 'manifest.json')) ? JSON.parse(read('audio/manifest.json')) : { clips: {} };
  for (const j of jobs.values()) {
    if (!man.clips[j.key]) { bad++; if (bad <= 5) console.log(`no clip for ${j.who} "${j.text.slice(0, 60)}" (${j.why})`); }
    if (V.speakable(j.text) !== j.text) { bad++; console.log(`speakable() not idempotent: "${j.text.slice(0, 60)}"`); }
    if (!fs.existsSync(path.join(root, 'audio', j.key + '.mp3'))) { bad++; if (bad <= 5) console.log(`missing file audio/${j.key}.mp3`); }
  }
  console.log(`voice check: ${jobs.size} lines, ${bad} problem(s)${bad ? ' — run: node tools/voice-jobs.mjs && python tools/render_voices.py' : ''}`);
  process.exit(bad ? 1 : 0);
}

const out = {
  voices: { pt: { voice: 'bm_george', lang: 'en-gb', speed: 0.92 }, rn: { voice: 'af_heart', lang: 'en-us', speed: 1.0 }, you: { voice: 'am_michael', lang: 'en-us', speed: 1.0 } },
  jobs: [...jobs.values()],
};
fs.writeFileSync(path.join(root, 'tools', 'voice-jobs.json'), JSON.stringify(out, null, 1));
const by = out.jobs.reduce((a, j) => (a[j.who] = (a[j.who] || 0) + 1, a), {});
console.log(`${out.jobs.length} lines to voice (${Object.entries(by).map(([k, v]) => k + ' ' + v).join(', ')}), ${out.jobs.reduce((a, j) => a + j.text.length, 0)} chars`);
