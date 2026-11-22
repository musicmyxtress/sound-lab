// Sound lab checks: `npm run check`, or `npm run check -- echo` for one lab.
//
// Loads every lab linked from index.html in a headless browser (no window)
// and reports, in plain sentences, anything that would bite Blake on his
// phone: page errors, missing files, a page search engines could index,
// controls VoiceOver can't name, sliders that don't speak a word, a heading
// version that doesn't match the script version, and, for slider labs,
// whether pressing Play actually makes sound.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv[2];

// ---------- a tiny local web server, so pages load like on GitHub Pages ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  let file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

// ---------- which browser: Edge on Windows, the preinstalled Chromium elsewhere ----------
const launch = { args: ['--autoplay-policy=no-user-gesture-required'] };
if (process.platform === 'win32') launch.channel = 'msedge';
else if (fs.existsSync('/opt/pw-browsers/chromium')) launch.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launch);

// Before any page script runs: anything connected to the speakers is also
// connected to a meter, so the check can tell whether sound came out.
const METER = () => {
  const orig = AudioNode.prototype.connect;
  window.__peak = 0;
  AudioNode.prototype.connect = function (dest, ...rest) {
    const r = orig.call(this, dest, ...rest);
    if (dest instanceof AudioDestinationNode) {
      const a = this.context.createAnalyser();
      a.fftSize = 2048;
      orig.call(this, a);
      const buf = new Float32Array(a.fftSize);
      setInterval(() => {
        a.getFloatTimeDomainData(buf);
        for (const v of buf) window.__peak = Math.max(window.__peak, Math.abs(v));
      }, 50);
    }
    return r;
  };
};

const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const labs = [...index.matchAll(/href="([^"]+\/)"/g)].map(m => m[1]).filter(l => !only || l.includes(only));
let failures = 0;

for (const lab of ['', ...labs]) {
  const name = lab || 'home page';
  const problems = [];
  const page = await browser.newPage();
  await page.addInitScript(METER);
  page.on('pageerror', e => problems.push(`script error: ${e.message}`));
  page.on('console', m => {
    if (m.type() !== 'error' || /favicon/.test(m.location().url) || /Failed to load resource/.test(m.text())) return;
    problems.push(`console error: ${m.text()}`);
  });
  page.on('response', r => {
    if (r.status() >= 400 && !/favicon/.test(r.url())) problems.push(`missing file (${r.status()}): ${r.url().replace(base, '')}`);
  });

  await page.goto(base + lab, { waitUntil: 'load' });
  await page.waitForTimeout(300);

  const facts = await page.evaluate(() => {
    const robots = document.querySelector('meta[name="robots"]');
    const unnamed = [...document.querySelectorAll('input, select, textarea, button')]
      .filter(el => el.type !== 'hidden' && !el.closest('[hidden]'))
      .filter(el => {
        if (el.tagName === 'BUTTON') return !(el.textContent.trim() || el.getAttribute('aria-label'));
        return !(el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby'));
      })
      .map(el => el.outerHTML.slice(0, 80));
    const wordless = [...document.querySelectorAll('input[type="range"][aria-valuetext]')]
      .filter(el => !/[a-z]/i.test(el.getAttribute('aria-valuetext')))
      .map(el => `${el.labels?.[0]?.textContent || el.id}: "${el.getAttribute('aria-valuetext')}"`);
    const h1 = document.querySelector('h1')?.textContent || '';
    const script = document.querySelector('script[type="module"][src]')?.getAttribute('src') || '';
    return { noindex: /noindex/.test(robots?.content || ''), unnamed, wordless, h1, script, sliderLab: !!document.querySelector('main#lab') };
  });

  if (!facts.noindex) problems.push('no noindex tag: search engines could list this page');
  for (const u of facts.unnamed) problems.push(`control with no name for VoiceOver: ${u}`);
  for (const w of facts.wordless) problems.push(`slider speaks no word: ${w}`);

  let sound = '';
  if (facts.sliderLab) {
    const headingVersion = facts.h1.match(/version (\d+)/)?.[1];
    const scriptVersion = facts.script.match(/\?v=(\d+)/)?.[1];
    if (headingVersion !== scriptVersion) {
      problems.push(`heading says version ${headingVersion} but the page loads its script as ?v=${scriptVersion}`);
    }
    // A page whose script crashed has no Play button; say so, don't hang.
    if (!(await page.$('button.big'))) {
      problems.push('no Play button: the page did not build (see errors above)');
      await page.close(); failures++;
      console.log(`PROBLEM: ${name}`);
      for (const p of problems) console.log(`  - ${p}`);
      continue;
    }
    await page.click('button.big');
    await page.waitForTimeout(2000);
    const label = await page.textContent('button.big');
    const peak = await page.evaluate(() => window.__peak);
    if (label !== 'Stop') problems.push(`Play button says "${label}" after pressing it, not "Stop"`);
    if (peak < 0.001) problems.push('pressed Play but no sound came out');
    else sound = `, Play makes sound (peak ${peak.toFixed(2)})`;
    await page.click('button.big');
  }

  await page.close();
  if (problems.length) {
    failures++;
    console.log(`PROBLEM: ${name}`);
    for (const p of problems) console.log(`  - ${p}`);
  } else {
    console.log(`OK: ${name}${facts.h1 ? ` (${facts.h1.trim()})` : ''}${sound}`);
  }
}

await browser.close();
server.close();
console.log(failures ? `${failures} page(s) need attention.` : 'All pages passed.');
process.exit(failures ? 1 : 0);
