// node tests/drive.mjs — drives the real app in headless Chrome (system Chrome via Playwright from airi/node_modules)
// at 375×812 and 1280×800. Exit 1 on any failure, console error or horizontal overflow.
// BASE=https://jeremyspm.github.io/cls-trainer/ node tests/drive.mjs   → drive the live site instead of a local server.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire('C:/Users/USER/Desktop/github/airi/package.json')('playwright');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL ' + m); } };

let server = null, BASE = process.env.BASE;
if (!BASE) {
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = `http://127.0.0.1:${server.address().port}/`;
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function run(width, height) {
  const tag = `[${width}]`;
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  // quiet, deterministic settings: no speech, no mic, no curveballs (curveballs are driven explicitly below)
  await page.addInitScript(() => {
    if (!localStorage.getItem('cls.settings')) localStorage.setItem('cls.settings', JSON.stringify({ speak: false, listen: false, curve: 'off', level: 'coach', awake: false }));
  });
  const go = async hash => { await page.evaluate(h => { location.hash = h; }, hash); await page.waitForTimeout(120); };
  const overflow = async label => {
    const o = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    ok(!o, `${tag} horizontal overflow on ${label}`);
  };

  await page.goto(BASE + '#home');
  await page.waitForSelector('#decide');
  ok(await page.locator('[data-go^="#rnq"]').count() === 2, `${tag} home: two RN-asks rows`);
  await overflow('home');

  // recorded voices: the manifest loads, and every patient / RN line in a live run has a clip
  const voice = await page.evaluate(async () => {
    await Voice.ready;
    const miss = [];
    for (const [run, drug] of [['vs', null], ['ma', 'para'], ['ma', 'meto']]) {
      for (const s of CLS_APP.steps(run, drug)) if ((s.kind === 'pt' || s.kind === 'rn') && !Voice.hasClip(s.line, s.kind)) miss.push(s.id);
    }
    for (const q of CLS_RNQ) if (!Voice.hasClip(q.q, 'rn')) miss.push(q.id);
    return { loaded: !!Voice.clips, miss };
  });
  ok(voice.loaded, `${tag} audio/manifest.json did not load`);
  ok(voice.miss.length === 0, `${tag} lines with no recorded clip: ${voice.miss.slice(0, 5).join(', ')}`);

  // walkthroughs render, no unfilled placeholders
  for (const h of ['#walk/vs', '#walk/ma/para', '#walk/ma/meto']) {
    await go(h);
    const txt = await page.locator('#view').innerText();
    ok(!/\{\w+\}/.test(txt), `${tag} ${h}: unfilled placeholder`);
    ok(await page.locator('.step').count() > 25, `${tag} ${h}: steps missing`);
    await overflow(h);
  }

  // order drill: BP sequence, answered right → clean run
  await go('#order/vs/bp');
  const bpIds = await page.evaluate(() => CLS_APP.steps('vs').filter(s => (s.kind === 'do' || s.kind === 'say') && s.bp).map(s => s.id));
  for (const id of bpIds) { await page.click(`.opt[data-id="${id}"]`); await page.click('#nextQ'); }
  ok((await page.locator('.verdict').innerText()).includes('Clean'), `${tag} order drill: not clean after right answers`);
  await overflow('order result');

  // live runs to the marking sheet → Met
  for (const [run, drug, curve] of [['vs', null, 'off'], ['ma', 'meto', 'lots'], ['ma', 'para', 'lots']]) {
    await page.evaluate(([d, c]) => { const s = JSON.parse(localStorage.getItem('cls.settings')); if (d) s.drug = d; s.curve = c; localStorage.setItem('cls.settings', JSON.stringify(s)); }, [drug, curve]);
    // settings are read once at load: a hash change alone would keep the old ones
    await page.goto(BASE + '#setup/' + run); await page.reload(); await page.waitForSelector('#go');
    await page.click('#go'); await page.waitForTimeout(150);
    for (let i = 0; i < 120; i++) {
      if (await page.locator('#save').count()) break;
      const opt = page.locator('.stage .opt[data-k="0"]:not([disabled])');
      if (await opt.count()) { await opt.first().click(); await page.locator('#acts .btn').first().click(); continue; }
      await page.locator('#acts .btn.primary').click();
    }
    ok(await page.locator('#save').count() === 1, `${tag} live ${run}/${drug}: never reached the marking sheet`);
    ok((await page.locator('.verdict').innerText()).trim() === 'Met', `${tag} live ${run}/${drug}: not Met after a clean run`);
    await overflow(`mark ${run}`);
    await page.click('#save');
    const last = await page.evaluate(() => JSON.parse(localStorage.getItem('cls.log')).slice(-1)[0]);
    ok(last.type === 'live' && last.met && last.run === run, `${tag} live ${run}: log entry wrong`);
    if (curve === 'lots') ok(last.cbs.length >= 2 && last.cbs.every(c => c.ok), `${tag} live ${run}/${drug}: curveballs not dealt or not logged`);
  }

  // RN asks — pick, all right
  await page.goto(BASE + '#rnq/vs/pick'); await page.waitForSelector('.stage .opt');
  for (let i = 0; i < 10; i++) { await page.click('.stage .opt[data-k="0"]'); await page.locator('#acts .btn').click(); }
  ok((await page.locator('.verdict').innerText()).trim() === '10 / 10', `${tag} rnq pick: expected 10/10`);
  // RN asks — say it, with the mic stubbed and each model answer "heard"
  await page.goto(BASE + '#home');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('cls.settings')); s.listen = true; localStorage.setItem('cls.settings', JSON.stringify(s)); });
  await page.reload(); await page.waitForSelector('#decide');
  await page.evaluate(() => { Voice.srSupported = true; Voice.listen = () => true; Voice.stopListening = () => { }; location.hash = '#rnq/ma/say'; });
  await page.waitForSelector('.stage .bigt');
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => { const q = CLS_RNQ.find(x => x.q === document.querySelector('.stage .bigt').textContent); Voice.heard = q.a.replace(/\n/g, ' '); Voice.onHeard(Voice.heard, ''); });
    await page.waitForSelector('#fb .card.good', { timeout: 4000 });
    await page.locator('#acts .btn').click();
  }
  ok((await page.locator('.verdict').innerText()).trim() === '10 / 10', `${tag} rnq say: expected 10/10 from heard model answers`);
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('cls.settings')); s.listen = false; localStorage.setItem('cls.settings', JSON.stringify(s)); });
  await page.reload();

  // BP Lab: set-up gate, then pumping moves the needle
  await page.goto(BASE + '#bp'); await page.waitForSelector('#go1');
  ok(await page.locator('#go1').isDisabled(), `${tag} bp: start enabled before set-up`);
  for (const k of ['arm', 'size', 'feel', 'wrap']) await page.click(`[data-k="${k}"]`);
  if (await page.locator('#swap').count()) await page.click('#swap');
  await page.click('#go1');
  await page.locator('#pump').dispatchEvent('pointerdown'); await page.waitForTimeout(700); await page.locator('#pump').dispatchEvent('pointerup');
  ok(+(await page.locator('#gread').textContent()) > 20, `${tag} bp: pumping did not raise the pressure`);
  await overflow('bp lab');

  for (const h of ['#rubric/vs', '#rubric/ma', '#log', '#rnq/vs', '#rnq/ma/read']) { await go(h); await overflow(h); }

  ok(errors.length === 0, `${tag} console errors: ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
}

await run(375, 812);
await run(1280, 800);
await browser.close();
if (server) server.close();
console.log(`drive: ${checks} checks, ${fails} failed (${BASE})`);
process.exit(fails ? 1 : 0);
