// Draws a world in Chromium through the real page:  node test/e2e.mjs  (needs Playwright)
// On a phone-sized screen: the starting world has realms, towns and rivers; a blank ocean takes a sketched island,
// a mountain range (without flooding the valleys beside it) and a hand-drawn river; new realms fill the island;
// a town's page rolls a rumor into its notes; the world survives a reload and saves to a file. Then the usual
// checks: no errors, nothing loaded from elsewhere, no sideways scrolling, installable, and it loads offline.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let body;
  try { body = await readFile(join(root, path === '/' ? 'index.html' : path)); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' });
  res.end(body);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, acceptDownloads: true });
const page = await ctx.newPage();
const problems = [];
const loaded = new Set();
page.on('pageerror', (e) => problems.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
page.on('requestfailed', (r) => { if (!r.url().startsWith('blob:')) problems.push('failed: ' + r.url()); });
page.on('request', (r) => {
  const u = r.url();
  if (u.startsWith(base)) loaded.add(new URL(u).pathname.slice(1) || './');
  else if (!u.startsWith('data:') && !u.startsWith('blob:')) problems.push('left the site: ' + u);
});

const S = (fn, arg) => page.evaluate(fn, arg);
const state = () => S(() => window.terra.state());
const ok = (cond, msg) => { assert.ok(cond, msg); console.log('  ok  ' + msg); };

// Drags along a path given in map cells (the map is 480 x 300 cells).
async function drag(points, steps = 6) {
  // Picking a tool option can change the toolbar's height and so the map's place on the page; let it settle first.
  await S(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const b = await page.locator('#map').boundingBox();
  const pts = [];
  for (const [x, y] of points) { const p = await S(([x, y]) => window.terra.toScreen(x, y), [x, y]); pts.push([b.x + p.x, b.y + p.y]); }
  await page.mouse.move(...pts[0]); await page.mouse.down();
  for (let k = 1; k < pts.length; k++) for (let s = 1; s <= steps; s++) {
    await page.mouse.move(pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * s / steps, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * s / steps);
  }
  await page.mouse.up();
  await page.waitForTimeout(250);
}

await page.goto(base);
await page.evaluate(() => document.fonts.ready);
ok(await S(() => document.fonts.check('16px "IM Fell English"') && document.fonts.check('14px "Instrument Sans"')), 'the fonts load from fonts/');

// The first visit opens on a finished world.
let st = await state();
ok(st.realms >= 2 && st.places >= 20 && st.rivers > 200 && st.labels >= 2, `the starting world has realms, towns, rivers and labels (${st.realms} realms, ${st.places} places)`);
ok(await page.locator('#pane-inspect .welcome').isVisible(), 'the gazetteer greets you');

// Borders come from the land, the capitals and their towns, so a reload brings back the same realms.
const realmRows = () => S(() => {
  document.getElementById('tab-codex').click();
  const rows = [...document.querySelector('#codexList .clist').querySelectorAll('.crow')].map((r) => `${r.querySelector('.nm').textContent} ${r.querySelector('.meta.mono').textContent}`);
  document.getElementById('tab-inspect').click();
  return rows;
});
const firstRealms = await realmRows();
await page.reload();
await page.waitForTimeout(400);
ok(JSON.stringify(await realmRows()) === JSON.stringify(firstRealms), `the realms are the same size after a reload (${firstRealms[0]})`);

// Start from blank ocean through the New world menu.
await page.click('#btnNew');
ok(await S(() => !document.getElementById('newMenu').hidden), 'New world opens a menu');
await page.click('#mnBlank');
await page.waitForTimeout(300);
st = await state();
ok(st.land === 0 && st.places === 0 && st.shape === 'blank', 'blank ocean has no land and no places');
ok(await S(() => document.querySelector('.tool[aria-pressed="true"]').dataset.tool === 'sketch'), 'the sketch tool is ready');

// A loop raises land.
await drag([[150, 80], [260, 66], [345, 96], [355, 170], [300, 232], [200, 238], [128, 192], [118, 120], [150, 80]], 5);
st = await state();
ok(st.land > 15000, `a sketched loop becomes land (${st.land} cells)`);

// A mountain range, without a lake in the valleys it blocks.
await page.click('.chip[data-v="range"]');
await page.click('.chip[data-v="high"]');
await drag([[170, 120], [235, 112], [300, 138]], 8);
await drag([[175, 185], [240, 192], [305, 178]], 8);
const afterRange = await state();
ok(afterRange.lakes < afterRange.land * 0.004, `two tall ranges leave no valley flooded (${afterRange.lakes} lake cells)`);

// A river drawn from inland out to sea.
await page.click('.chip[data-v="river"]');
const line = [[255, 150], [232, 165], [262, 182], [262, 215], [250, 262]];
await drag(line, 8);
st = await state();
// Every point along the line, from the source to just short of the coast, should have river water beside it.
const along = [];
for (let k = 0; k < line.length - 1; k++) for (let t = 0; t < 1; t += 0.1) along.push([line[k][0] + (line[k + 1][0] - line[k][0]) * t, line[k][1] + (line[k + 1][1] - line[k][1]) * t]);
const inland = along.filter(([, y]) => y < 225);
const wet = (await Promise.all(inland.map((p) => S(([x, y]) => window.terra.riverNear(x, y), p)))).filter(Boolean).length;
ok(wet >= inland.length * 0.9, `a drawn river runs where it was drawn (${wet} of ${inland.length} points)`);
await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
ok((await state()).rivers < st.rivers, 'undo takes the river back out');
await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(300);

// New realms fill the island.
await page.click('#tab-world');
await page.click('#wPopulate');
await page.waitForTimeout(300);
st = await state();
ok(st.realms >= 1 && st.places >= 8, `new realms fill the island (${st.realms} realms, ${st.places} places)`);

// Open a town's page and roll a rumor into its notes.
await page.keyboard.press('v');
const town = (await S(() => window.terra.places())).find((p) => p.kind === 'capital');
await S((p) => { window.terra.select({ type: 'place', id: p.id }); }, town);
await page.waitForSelector('#pName');
ok((await page.inputValue('#pName')) === town.name, `${town.name} opens its page`);
// A few rumors are about a neighbour or the realm rather than the town itself, so roll again until one names it.
let rumor = '';
for (let k = 0; k < 20 && !rumor.includes(town.name); k++) {
  await page.click('#pRumor');
  rumor = (await page.textContent('#draftBox')).trim();
}
ok(rumor.length > 30 && rumor.includes(town.name), 'a rumor names the town');
await page.click('#dKeep');
ok((await page.inputValue('#pLore')).includes(rumor), 'keeping the rumor adds it to the notes');
ok(await page.locator('#pWrite').isHidden(), 'the Claude history button stays hidden outside Claude');

// It survives a reload.
const before = await state();
await page.waitForTimeout(1200); // autosave
await page.reload();
await page.waitForTimeout(400);
st = await state();
ok(st.name === before.name && st.places === before.places && Math.abs(st.land - before.land) < 50, 'the world is still there after a reload');

// Save world file downloads it.
await page.click('#tab-world');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#wSaveFile')]);
const saved = JSON.parse(await readFile(await dl.path(), 'utf8'));
ok(dl.suggestedFilename().endsWith('.json') && saved.format === 'terra-incognita' && saved.places.length === st.places, 'Save world file downloads the world');
ok(await page.locator('#pane-world .jd-foot').isVisible(), 'the World tab links back to the drawer');

// Nothing scrolls sideways on a phone.
ok(await S(() => document.documentElement.scrollWidth <= window.innerWidth), 'nothing scrolls sideways at 390px');

// Installable: Chromium finds no problems with the manifest and icons.
const cdp = await ctx.newCDPSession(page);
const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
ok(installabilityErrors.length === 0, 'Chromium says it can be installed' + (installabilityErrors.length ? ': ' + JSON.stringify(installabilityErrors) : ''));

// Every file the page loads is in the offline copy, and every file in it exists.
const sw = await readFile(join(root, 'sw.js'), 'utf8');
const shell = [...sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
for (const f of shell) assert.ok(f === './' || existsSync(join(root, f)), `sw.js lists ${f}, which exists`);
const missing = [...loaded].filter((f) => !shell.includes(f) && !['sw.js', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'].includes(f));
ok(missing.length === 0, 'sw.js keeps every file the page loads' + (missing.length ? ': missing ' + missing.join(', ') : ''));

// It loads with the network off.
await S(() => navigator.serviceWorker.ready);
await page.reload(); await page.waitForTimeout(500);
await ctx.setOffline(true);
await page.reload();
await page.waitForTimeout(500);
ok((await page.title()) === 'Terra Incognita' && (await state()).places > 0, 'it opens offline, with the world');
await ctx.setOffline(false);

const real = problems.filter((p) => !/ERR_INTERNET_DISCONNECTED|net::ERR_FAILED/.test(p));
ok(real.length === 0, 'no errors and nothing loaded from elsewhere' + (real.length ? ':\n' + real.join('\n') : ''));

await browser.close();
server.close();
console.log('all good');
