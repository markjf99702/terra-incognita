// Draws a world in Chromium through the real page:  node test/e2e.mjs  (needs Playwright)
// On a phone-sized screen: the starting world has realms, towns and rivers; a blank ocean takes a sketched island,
// a mountain range (without flooding the valleys beside it) and a hand-drawn river; new realms fill the island;
// a town's page rolls a rumor into its notes, and Undo leaves notes alone; the world, rivers and borders included,
// survives a reload and saves to a file. Then the usual checks: no errors, nothing loaded from elsewhere, no
// sideways scrolling, installable, and it loads offline. On a laptop-sized screen: the Codex, sea names, world
// files that are damaged, keyboard focus and shortcuts, and the dark theme Claude's viewer can stamp. Last, a
// phone held sideways and a browser that won't keep the autosave.
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
const problems = [];
const loaded = new Set();
function watch(page) {
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('requestfailed', (r) => { if (!r.url().startsWith('blob:')) problems.push('failed: ' + r.url()); });
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base)) loaded.add(new URL(u).pathname.slice(1) || './');
    else if (!u.startsWith('data:') && !u.startsWith('blob:')) problems.push('left the site: ' + u);
  });
  return page;
}
const page = watch(await ctx.newPage());

const S = (fn, arg) => page.evaluate(fn, arg);
const state = () => S(() => window.terra.state());
const ok = (cond, msg) => { assert.ok(cond, msg); console.log('  ok  ' + msg); };

// Drags along a path given in map cells (the map is 480 x 300 cells).
async function drag(points, steps = 6, pg = page) {
  // Picking a tool option can change the toolbar's height and so the map's place on the page; let it settle first.
  await pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const b = await pg.locator('#map').boundingBox();
  const pts = [];
  for (const [x, y] of points) { const p = await pg.evaluate(([x, y]) => window.terra.toScreen(x, y), [x, y]); pts.push([b.x + p.x, b.y + p.y]); }
  await pg.mouse.move(...pts[0]); await pg.mouse.down();
  for (let k = 1; k < pts.length; k++) for (let s = 1; s <= steps; s++) {
    await pg.mouse.move(pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * s / steps, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * s / steps);
  }
  await pg.mouse.up();
  await pg.waitForTimeout(250);
}

await page.goto(base);
await page.evaluate(() => document.fonts.ready);
ok(await S(() => document.fonts.check('16px "IM Fell English"') && document.fonts.check('14px "Instrument Sans"')), 'the fonts load from fonts/');

// The first visit opens on a finished world.
let st = await state();
ok(st.realms >= 2 && st.places >= 20 && st.rivers > 200 && st.labels >= 2, `the starting world has realms, towns, rivers and labels (${st.realms} realms, ${st.places} places)`);
ok(await page.locator('#pane-inspect .welcome').isVisible(), 'the gazetteer greets you');
const names = (await S(() => window.terra.places())).map((p) => p.name);
ok(new Set(names).size === names.length, 'no two places share a name');

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

// A long realm name wraps in the Codex rather than running into its area.
const crowded = await S(() => {
  document.getElementById('tab-codex').click();
  const rows = [...document.querySelector('#codexList .clist').querySelectorAll('.crow')];
  const bad = rows.filter((row) => {
    const text = document.createRange(); text.selectNodeContents(row.querySelector('.nm'));
    return Math.max(...[...text.getClientRects()].map((r) => r.right)) > row.querySelector('.meta.mono').getBoundingClientRect().left;
  }).map((row) => row.querySelector('.nm').textContent);
  document.getElementById('tab-inspect').click();
  return bad;
});
ok(crowded.length === 0, 'realm names in the Codex stay clear of their areas' + (crowded.length ? ': ' + crowded.join(', ') : ''));

// Start from blank ocean through the New world menu, which closes if the page scrolls away from it.
await page.click('#btnNew');
ok(await S(() => !document.getElementById('newMenu').hidden), 'New world opens a menu');
await S(() => window.scrollBy(0, 200));
await page.waitForTimeout(100);
ok(await S(() => document.getElementById('newMenu').hidden), 'the menu closes when the page scrolls');
await S(() => window.scrollTo(0, 0));
await page.click('#btnNew');
await page.click('#mnBlank');
await page.waitForTimeout(300);
st = await state();
ok(st.land === 0 && st.places === 0 && st.shape === 'blank', 'blank ocean has no land and no places');
ok(await S(() => document.querySelector('.tool[aria-pressed="true"]').dataset.tool === 'sketch'), 'the sketch tool is ready');
// The tools are a row above the map on a phone and a column beside it on a laptop, so the tip doesn't say where.
const tip = await page.textContent('#pane-inspect .tips li');
ok(tip.includes('Sketch') && !/on the (left|right)|above|below/.test(tip), `the first tip on open water names Sketch without saying which side it is on ("${tip.slice(0, 40)}...")`);

// On open water there are no realms to found and nothing to flood, so nothing changes and it says so.
await page.click('#tab-world');
await page.click('#wPopulate');
ok((await page.textContent('#toast')).startsWith('New realms need dry land') && (await state()).undo === st.undo, 'Found new realms on open water says it needs land');
await page.click('.chip[data-v="sea"]');
await drag([[300, 100], [360, 100], [360, 160], [300, 160], [300, 100]], 5);
ok((await page.textContent('#toast')).startsWith('Nothing to flood') && (await state()).undo === st.undo, 'a sea loop on open water says there is nothing to flood');
await page.click('.chip[data-v="land"]');

// A loop raises land.
await drag([[150, 80], [260, 66], [345, 96], [355, 170], [300, 232], [200, 238], [128, 192], [118, 120], [150, 80]], 5);
st = await state();
ok(st.land > 15000, `a sketched loop becomes land (${st.land} cells)`);

// A sea loop across its coast floods some of it.
await page.click('.chip[data-v="sea"]');
await drag([[335, 115], [372, 115], [372, 148], [335, 148], [335, 115]], 5);
const bitten = await state();
ok(bitten.land < st.land, `a sea loop across the coast floods land (${st.land - bitten.land} cells)`);

// A mountain range, without a lake in the valleys it blocks.
await page.click('.chip[data-v="range"]');
await page.click('.chip[data-v="high"]');
await drag([[170, 120], [235, 112], [300, 138]], 8);
await drag([[175, 185], [240, 192], [305, 178]], 8);
const afterRange = await state();
ok(afterRange.lakes < afterRange.land * 0.004, `two tall ranges leave no valley flooded (${afterRange.lakes} lake cells)`);

// A river drawn from inland out to sea.
await page.click('.chip[data-v="river"]');
const riversBefore = (await state()).rivers;
const line = [[255, 150], [232, 165], [262, 182], [262, 215], [250, 262]];
await drag(line, 8);
st = await state();
// Every point along the line, from the source to just short of the coast, should have river water beside it.
const along = [];
for (let k = 0; k < line.length - 1; k++) for (let t = 0; t < 1; t += 0.1) along.push([line[k][0] + (line[k + 1][0] - line[k][0]) * t, line[k][1] + (line[k + 1][1] - line[k][1]) * t]);
const inland = along.filter(([, y]) => y < 225);
const wet = (await Promise.all(inland.map((p) => S(([x, y]) => window.terra.riverNear(x, y), p)))).filter(Boolean).length;
ok(wet >= inland.length * 0.9, `a drawn river runs where it was drawn (${wet} of ${inland.length} points)`);
// Undo brings back the rivers from before. (Not always fewer: a drawn valley can gather streams that ran apart.)
await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
ok((await state()).rivers === riversBefore, 'undo takes the river back out');
await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(300);
ok((await state()).rivers === st.rivers, 'redo puts it back');

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
ok(!(await page.getAttribute('#pLore', 'placeholder')).includes('Claude'), 'and the notes box does not promise Claude either');
ok((await page.locator('[data-color]').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')))).every((l) => /^[A-Z][a-z]+$/.test(l)), 'the realm colors are named for screen readers');

// Undo steps back through edits on the page, but never takes notes away.
const undoBefore = (await state()).undo;
await page.fill('#pName', 'Saltgate');
ok((await state()).undo === undoBefore + 1, 'typing a new name is one undo step');
ok((await page.textContent('#pDelete')) === 'Remove Saltgate', 'the Remove link follows the new name');
await page.locator('#pLore').press('Control+End');
await page.keyboard.type(' The mayor is a retired smuggler.');
await page.click('#btnUndo');
await page.waitForTimeout(300);
ok((await page.inputValue('#pName')) === town.name, 'Undo puts the old name back');
ok((await page.inputValue('#pLore')).endsWith('The mayor is a retired smuggler.'), 'Undo leaves the notes alone');

// It survives a reload, and the map that comes back is the same one: rivers, lakes and borders included.
// Leaving the page saves at once, so notes typed just before it are kept without waiting for the autosave.
await page.locator('#pLore').press('Control+End');
await page.keyboard.type(' Ships unload salt at dawn.');
const before = await state(), beforeRealms = await realmRows();
await page.reload();
await page.waitForTimeout(400);
st = await state();
ok(st.name === before.name && st.places === before.places && st.land === before.land, 'the world is still there after a reload');
ok(st.rivers === before.rivers && st.lakes === before.lakes, `its rivers and lakes are where they were (${before.rivers} river cells before, ${st.rivers} after)`);
ok(JSON.stringify(await realmRows()) === JSON.stringify(beforeRealms), 'its borders are where they were');
const notesAfter = await S((id) => { window.terra.select({ type: 'place', id }); return document.getElementById('pLore').value; }, town.id);
ok(notesAfter.endsWith('Ships unload salt at dawn.'), 'notes typed just before leaving are still there');

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

// On a laptop-sized screen.
const desk = watch(await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage());
await desk.goto(base);
await desk.click('#tab-codex');
ok(await desk.evaluate(() => document.getElementById('codexQ').getBoundingClientRect().height) >= 33, 'the Codex search box keeps its height beside a long list');

// A place by a sea labelled "Gulf of ..." is on the coast of the Gulf of ...
const settingOf = (id) => desk.evaluate((id) => {
  window.terra.select({ type: 'place', id });
  const dd = [...document.querySelectorAll('#pane-inspect .facts dd')].find((d) => d.previousElementSibling.textContent === 'Setting');
  return dd ? dd.textContent : '';
}, id);
let coastal = null;
for (const p of (await desk.evaluate(() => window.terra.places())).sort((a, b) => a.y - b.y)) if ((await settingOf(p.id)).startsWith('On the coast of')) { coastal = p; break; }
await desk.keyboard.press('t');
await desk.click('.chip[data-g="label"][data-v="sea"]');
await desk.fill('#optLabelText', 'Gulf of Testing');
const mapBox = await desk.locator('#map').boundingBox(), at = await desk.evaluate(([x, y]) => window.terra.toScreen(x, y), [coastal.x + 3, coastal.y]);
await desk.mouse.click(mapBox.x + at.x, mapBox.y + at.y);
const setting = await settingOf(coastal.id);
ok(setting.startsWith('On the coast of the Gulf of Testing'), `a sea's name reads as it should in a sentence (${coastal.name}: "${setting}")`);

// A rumor that wasn't kept stays with its place, not with whatever has its id in a new world.
const firstCap = (await desk.evaluate(() => window.terra.places())).find((p) => p.kind === 'capital');
await desk.evaluate((id) => window.terra.select({ type: 'place', id }), firstCap.id);
await desk.click('#pRumor');
await desk.click('#btnNew');
await desk.click('#mnRandom');
await desk.waitForTimeout(300);
ok(await desk.evaluate((id) => { window.terra.select({ type: 'place', id }); return document.getElementById('draftBox').hidden; }, firstCap.id), 'an unkept rumor stays behind in the old world');

// A world file that was cut short is refused, not opened as a black map. One with a realm missing its color still
// opens, leaving out a place that has no position.
await desk.click('#tab-world');
const openFile = async (o) => {
  await desk.setInputFiles('#wFile', { name: 'world.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(o)) });
  await desk.waitForTimeout(400);
  return desk.evaluate(() => [document.getElementById('toast').textContent, window.terra.state()]);
};
const nameBefore = (await desk.evaluate(() => window.terra.state())).name;
const [cutToast, cutState] = await openFile({ ...saved, h: saved.h.slice(0, 4000) });
ok(cutToast.startsWith('That file is not') && cutState.name === nameBefore, 'a world file that was cut short is refused');
const damaged = JSON.parse(JSON.stringify(saved));
delete damaged.places.find((p) => p.kind === 'capital').realm.color;
delete damaged.places.find((p) => p.kind !== 'capital').x;
const [damagedToast, damagedState] = await openFile(damaged);
ok(damagedToast.startsWith('Opened') && damagedState.places === saved.places.length - 1, 'a world file with a realm missing its color opens');

// Keyboard focus on a zoom button is drawn inside it, where the button group can't clip it away.
await desk.evaluate(() => document.activeElement.blur());
let onZoom = false;
for (let k = 0; k < 80 && !onZoom; k++) { await desk.keyboard.press('Tab'); onZoom = await desk.evaluate(() => document.activeElement.id === 'zIn'); }
ok(onZoom && await desk.evaluate(() => {
  const el = document.activeElement, cs = getComputedStyle(el);
  return el.matches(':focus-visible') && parseFloat(cs.outlineOffset) + parseFloat(cs.outlineWidth) <= 0;
}), 'keyboard focus shows on the zoom buttons');

// The toast's Undo stays readable in the dark theme that Claude's viewer can stamp on the page.
await desk.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await desk.click('#btnNew');
await desk.click('#mnRandom');
const undoContrast = await desk.evaluate(() => {
  const lum = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const a = lum(getComputedStyle(document.querySelector('#toast button')).color), b = lum(getComputedStyle(document.getElementById('toast')).backgroundColor);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
});
ok(undoContrast >= 4.5, `the toast's Undo is readable in the dark theme (${undoContrast.toFixed(1)}:1)`);
await desk.evaluate(() => document.documentElement.removeAttribute('data-theme'));

// Shortcuts still work straight after using a slider: Ctrl+Z takes back the sea level it set.
await desk.click('#tab-world');
const landBefore = (await desk.evaluate(() => window.terra.state())).land;
const seaBox = await desk.locator('#wSea').boundingBox();
await desk.locator('#wSea').click({ position: { x: seaBox.width * 0.15, y: seaBox.height / 2 } });
const landMoved = (await desk.evaluate(() => window.terra.state())).land;
await desk.keyboard.press('Control+z');
ok(landMoved !== landBefore && (await desk.evaluate(() => window.terra.state())).land === landBefore, 'Ctrl+Z works straight after using a slider');

// Space and drag pans with any tool, even straight after clicking the tool's button...
await desk.click('.tool[data-tool="raise"]');
const mb = await desk.locator('#map').boundingBox();
const from = await desk.evaluate(() => [window.terra.toScreen(0, 0), window.terra.state().undo]);
await desk.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2);
await desk.keyboard.down(' ');
await desk.mouse.down();
for (let k = 1; k <= 6; k++) await desk.mouse.move(mb.x + mb.width / 2 - k * 6, mb.y + mb.height / 2 - k * 4);
await desk.mouse.up();
await desk.keyboard.up(' ');
const to = await desk.evaluate(() => [window.terra.toScreen(0, 0), window.terra.state().undo]);
ok((to[0].x !== from[0].x || to[0].y !== from[0].y) && to[1] === from[1], 'Space and drag pans straight after clicking a tool');
// ...while a button reached with Tab still takes Space.
await desk.evaluate(() => window.terra.setStyle('terrain'));
await desk.focus('#styleTerrain');
await desk.keyboard.press('Tab');
await desk.keyboard.press(' ');
ok(await desk.evaluate(() => document.getElementById('styleAtlas').getAttribute('aria-pressed') === 'true'), 'Space still presses a button reached with Tab');
await desk.evaluate(() => window.terra.setStyle('terrain'));

// The New world menu opens from the keyboard and closes when Tab moves on past it.
await desk.focus('#btnNew');
await desk.keyboard.press('Enter');
const menuFocus = await desk.evaluate(() => document.activeElement.id);
await desk.keyboard.press('Tab');
await desk.keyboard.press('Tab');
ok(menuFocus === 'mnRandom' && await desk.evaluate(() => document.getElementById('newMenu').hidden), 'tabbing on past the New world menu closes it');

// The arrow keys move through the New world menu and along the panel tabs, which are one stop for Tab.
await desk.focus('#btnNew');
await desk.keyboard.press('Enter');
await desk.keyboard.press('ArrowDown');
const menuNext = await desk.evaluate(() => document.activeElement.id);
await desk.keyboard.press('Escape');
await desk.click('#tab-inspect');
await desk.keyboard.press('ArrowRight');
const tabNow = await desk.evaluate(() => [document.activeElement.id, document.getElementById('tab-codex').getAttribute('aria-selected'), [...document.querySelectorAll('[role=tab]')].filter((t) => t.tabIndex === 0).length]);
ok(menuNext === 'mnBlank' && tabNow[0] === 'tab-codex' && tabNow[1] === 'true' && tabNow[2] === 1, 'the arrow keys move through the menu and along the tabs');

// What the map says about itself, on a laptop-sized screen.
const map = watch(await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage());
await map.goto(base);
await map.evaluate(() => document.fonts.ready);
const M = (fn, arg) => map.evaluate(fn, arg);
const clickMap = async (x, y) => {
  const b = await map.locator('#map').boundingBox(), p = await M(([x, y]) => window.terra.toScreen(x, y), [x, y]);
  await map.mouse.click(b.x + p.x, b.y + p.y);
};
const row = (name) => M((name) => { const dd = [...document.querySelectorAll('#pane-inspect .facts dd')].find((d) => d.previousElementSibling.textContent === name); return dd ? dd.textContent : ''; }, name);
const readAt = async (x, y, name) => { await M(([x, y]) => window.terra.select({ type: 'loc', x, y }), [x, y]); return row(name); };

// World 96298 has a lake at 401-411 across, 157-166 down. Every part of it reads as the water's surface, level with its
// shore, rather than the lake bed under it.
await M(() => window.terra.newWorld(96298, 'continent'));
ok(await M(() => window.terra.cell(403.5, 160.5).lake && window.terra.cell(408.5, 162.5).lake && !window.terra.cell(400.5, 159.5).lake), 'world 96298 has its lake, with dry shore to its west');
const heights = []; for (const [x, y] of [[403.5, 160.5], [408.5, 162.5], [400.5, 159.5]]) heights.push(parseInt((await readAt(x, y, 'Elevation')).replace(/,/g, ''), 10));
const [lakeA, lakeB, shore] = heights;
ok(lakeA === lakeB && Math.abs(lakeA - shore) <= 15, `a lake reads as its surface, level with the shore (${lakeA} m and ${lakeB} m out on it, ${shore} m on the shore)`);

// A river drawn from out on that lake to the sea leaves the lake as it was, and runs where it was drawn.
const lakeCells = () => M(() => { let n = 0; for (let y = 152; y <= 170; y++) for (let x = 396; x <= 416; x++) if (window.terra.cell(x + 0.5, y + 0.5).lake) n++; return n; });
const lakeBefore = await lakeCells();
await map.keyboard.press('Escape');
await map.keyboard.press('p');
await map.click('.chip[data-v="river"]');
const outflow = [[406, 161], [409, 160], [412, 159.5], [418, 159.5], [426, 159.5], [434, 159.5], [440, 159.5]];
ok(await M(() => window.terra.cell(440, 159.5).h < 0), 'and the sea a few leagues east of it');
await drag(outflow, 6, map);
const lakeAfter = await lakeCells();
const alongOut = []; for (let x = 413; x <= 430; x++) alongOut.push(await M((x) => window.terra.riverNear(x, 159.5), x));
ok(lakeAfter >= lakeBefore * 0.95, `a river drawn out of a lake leaves the lake (${lakeBefore} lake cells before, ${lakeAfter} after)`);
ok(alongOut.filter(Boolean).length >= alongOut.length * 0.9, `and runs where it was drawn (${alongOut.filter(Boolean).length} of ${alongOut.length} points)`);

// An island with a sea inside it: a town on the inner sea is on the coast of that sea, not the ocean outside, even
// when the ocean's name is the only one on the map.
await M(() => window.terra.startBlank());
await M(() => { const r = document.getElementById('optRough'); r.value = '0'; r.dispatchEvent(new Event('input')); });
await drag([[140, 70], [340, 70], [360, 150], [340, 230], [140, 230], [120, 150], [140, 70]], 6, map);
await map.click('.chip[data-v="sea"]');
await drag([[200, 120], [280, 120], [290, 150], [280, 180], [200, 180], [190, 150], [200, 120]], 6, map);
ok(await M(() => window.terra.cell(240.5, 150.5).h < 0 && window.terra.cell(160.5, 150.5).h >= 0 && window.terra.cell(100.5, 150.5).h < 0), 'a sketched island holds an inland sea');
await map.keyboard.press('t');
await map.click('.chip[data-g="label"][data-v="sea"]');
await map.fill('#optLabelText', 'The Outer Ocean');
await clickMap(100.5, 150.5);
await map.keyboard.press('c');
await clickMap(188.5, 150.5);
const shoreTown = (await M(() => window.terra.places()))[0];
const onlyOcean = await row('Setting');
await M(() => window.terra.select({ type: 'loc', x: 250.5, y: 160.5 }));
const unnamedWater = await map.textContent('#pane-inspect h2');
await map.keyboard.press('t');
await map.fill('#optLabelText', 'The Inner Sea');
await clickMap(240.5, 150.5);
await M((id) => window.terra.select({ type: 'place', id }), shoreTown.id);
const named = await row('Setting');
ok(onlyOcean.startsWith('On the coast of the sea') && named.startsWith('On the coast of the Inner Sea'), `a town on an inland sea is on its coast, not the ocean's ("${onlyOcean}", then "${named}")`);
await M(() => window.terra.select({ type: 'loc', x: 250.5, y: 160.5 }));
const namedWater = await map.textContent('#pane-inspect h2');
ok(unnamedWater === 'Open sea' && namedWater === 'The Inner Sea', `and its water goes by its own name, or none ("${unnamedWater}", then "${namedWater}")`);

// That island was drawn with a smooth coast: its straight east side, from (340, 70) to (360, 150), comes out straight
// rather than as a staircase of cells. Where the ground crosses sea level along each row, against a straight line.
const fit = await M(() => {
  const xs = [], ys = [];
  for (let y = 78; y <= 142; y++) {
    const along = 340 + (y + 0.5 - 70) / 4;
    for (let x = Math.floor(along) - 4; x < Math.floor(along) + 4; x++) {
      const a = window.terra.cell(x + 0.5, y + 0.5).h, b = window.terra.cell(x + 1.5, y + 0.5).h;
      if (a >= 0 && b < 0) { xs.push(x + 0.5 + a / (a - b)); ys.push(y + 0.5); break; }
    }
  }
  const n = xs.length, mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, syy = 0; for (let k = 0; k < n; k++) { sxy += (ys[k] - my) * (xs[k] - mx); syy += (ys[k] - my) ** 2; }
  let rss = 0; for (let k = 0; k < n; k++) rss += (xs[k] - mx - sxy / syy * (ys[k] - my)) ** 2;
  return { n, rms: Math.sqrt(rss / n) };
});
ok(fit.n > 50 && fit.rms < 0.1, `a straight coast drawn smooth comes out straight (${fit.rms.toFixed(3)} cells off a straight line, over ${fit.n} rows)`);

// Sea names stay clear of the scale bar in the bottom-left corner. These worlds had one underneath it.
const covered = [];
for (const [seed, shape] of [[645278, 'inland'], [793904, 'twin'], [543439, 'twin']]) {
  if (await M(([seed, shape]) => {
    window.terra.newWorld(seed, shape);
    const { scale: s, seas } = window.terra.boxes();
    return seas.some((a) => a[0] < s[2] && a[2] > s[0] && a[1] < s[3] && a[3] > s[1]);
  }, [seed, shape])) covered.push(seed);
}
ok(covered.length === 0, 'sea names stay clear of the scale bar' + (covered.length ? ': not in ' + covered.join(', ') : ''));
await map.context().close();

// A phone held sideways fits the whole map on screen, zoom buttons included.
const side = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const sidePage = watch(await side.newPage());
await sidePage.goto(base);
ok(await sidePage.evaluate(() => document.getElementById('mapwrap').getBoundingClientRect().height <= innerHeight), 'a phone held sideways fits the whole map on screen');
await side.close();

// A browser that won't keep the autosave says so over the map, not only in the World tab.
const full = await browser.newContext({ viewport: { width: 390, height: 844 } });
await full.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; });
const fullPage = watch(await full.newPage());
await fullPage.goto(base);
ok(await fullPage.evaluate(() => { const t = document.getElementById('toast'); return !t.hidden && t.textContent.includes('would not keep an autosave'); }), 'a browser that will not keep the world says so');
await full.close();

const real = problems.filter((p) => !/ERR_INTERNET_DISCONNECTED|net::ERR_FAILED/.test(p));
ok(real.length === 0, 'no errors and nothing loaded from elsewhere' + (real.length ? ':\n' + real.join('\n') : ''));

await browser.close();
server.close();
console.log('all good');
