// node tools/build-paper-pdf.mjs → print/vs-chart-practice.pdf, printed by headless Chrome from paper.html itself,
// so the PDF and the page can never disagree. Run after any change to paper.html, js/paper.js or the chart picture.
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire('C:/Users/USER/Desktop/github/airi/package.json')('playwright');
const out = path.join(root, 'print', 'vs-chart-practice.pdf');

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pathToFileURL(path.join(root, 'paper.html')).href, { waitUntil: 'load' });
await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0));
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
await browser.close();
if (errors.length) { console.log('page errors:\n' + errors.join('\n')); process.exit(1); }
console.log('wrote ' + path.relative(root, out));
