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

  // Chart it (v2): tap the exact spot for each value on the SVG chart; the last run makes one deliberate miss
  const tapAt = async (key, value, nudge) => {
    const pt = await page.evaluate(([k, v, n]) => {
      const C = CLS_DATA.CHART, L = CLS_CHART.layout(C, C.order), p = CLS_CHART.place(C, L, k, v);
      const svg = document.querySelector('#chartbox svg'), vb = svg.viewBox.baseVal;
      let r = svg.getBoundingClientRect();
      const y = p.y + (n || 0), x = 104 + 2 * 78 + 39;
      window.scrollBy(0, r.top + y * (r.height / vb.height) - innerHeight * 0.25);  // keep it clear of the sticky task bar
      r = svg.getBoundingClientRect();
      return { x: r.left + x * (r.width / vb.width), y: r.top + y * (r.height / vb.height) };
    }, [key, value, nudge]);
    await page.mouse.click(pt.x, pt.y);
  };
  for (const miss of [false, true]) {
    await go('#home'); await go('#chart/vs');
    const obs = await page.evaluate(() => {
      const m = document.querySelector('.card').innerText.match(/Temp ([\d.]+) °C · HR (\d+) · RR (\d+) · BP (\d+)\/(\d+)/);
      return { temp: +m[1], hr: +m[2], rr: +m[3], sys: +m[4], dia: +m[5] };
    });
    const mc = async () => { const ans = await page.getAttribute('#task', 'data-ans'); await page.click(`#task [data-a="${ans}"]`); await page.click('#nx'); };
    await mc();                                                     // 24-hour time
    for (const [k, v] of [['temp', obs.temp], ['hr', obs.hr], ['rr', obs.rr], ['bp', obs.sys], ['bp', obs.dia]]) {
      const wrong = miss && k === 'temp';
      await tapAt(k, wrong ? (obs.temp >= 38 ? 36.2 : 38.6) : v, 0);
      const good = await page.locator('#fb .card.good').count();
      ok(wrong ? good === 0 : good === 1, `${tag} chart it: ${k} ${v} ${wrong ? 'deliberate miss was marked right' : 'exact tap was marked wrong'}`);
      if (wrong) ok(await page.locator('.ch-ghost .ch-mk').count() === 1, `${tag} chart it: no ghost showing where the miss should have gone`);
      await page.click('#nx');
    }
    const abn = { temp: obs.temp < 36.5 || obs.temp > 37.5, hr: obs.hr < 60 || obs.hr > 100, rr: obs.rr < 12 || obs.rr > 20, bp: obs.sys < 110 || obs.sys > 140 || obs.dia < 60 || obs.dia > 90 };
    for (const k of Object.keys(abn)) if (abn[k]) await page.click(`.pickc[data-k="${k}"]`);
    await page.click('#abnGo'); await page.click('#nx');
    await mc(); await mc(); await mc();                             // trend, EWS total, escalation
    const v = (await page.locator('.verdict').innerText()).trim();
    ok(v === (miss ? '9 / 10' : '10 / 10'), `${tag} chart it: expected ${miss ? '9 / 10' : '10 / 10'}, got ${v}`);
    await overflow('chart it');
  }
  // Read it (Janine's slides 38–39): answer every item right → 6 / 6
  await go('#chart/read');
  for (let i = 0; i < 6; i++) { const ans = await page.getAttribute('#view', 'data-ans'); await page.click(`#view [data-a="${ans.replace(/"/g, '\\"')}"]`); await page.click('#nx'); }
  ok((await page.locator('.verdict').innerText()).trim() === '6 / 6', `${tag} read it: expected 6 / 6`);
  await overflow('read it');

  // Sign the med chart: now a card that opens Mr Luke in Chart Sim (pharm-final/chart.html#luke)
  await go('#chart/ma');
  ok((await page.getAttribute('#openCS', 'href')) === 'https://jeremyspm.github.io/pharm-final/chart.html#luke', `${tag} med chart: the Chart Sim link is wrong`);
  await overflow('sign the med chart');

  // Real cuff: arrive, log a first-try reading, then a miss with a reason
  await go('#cuff');
  if (await page.locator('#arr').count()) await page.click('#arr');
  await page.click('#firstSeg [data-v="1"]'); await page.fill('#mine', '120/80'); await page.fill('#auto', '122/78'); await page.click('#save');
  ok((await page.locator('.stat b').first().innerText()).trim() === '1', `${tag} cuff: streak should be 1 after a first-try reading`);
  await page.click('#firstSeg [data-v="0"]'); await page.click('#probs .pickc >> nth=0'); await page.click('#save');
  ok((await page.locator('.stat b').first().innerText()).trim() === '0', `${tag} cuff: streak should reset after a miss`);
  ok((await page.locator('#view').innerText()).includes('most common slip'), `${tag} cuff: most common slip not shown`);
  await overflow('cuff');

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
