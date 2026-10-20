// Renders the README screenshots (docs/*.png) and the link preview (og.png):  node tools/screenshots.mjs
// Math.random and Date.now are fixed, so the same worlds come out every time. Needs Playwright, and upng-js from `npm install`.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const UPNG = require('upng-js');
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
const SEED = 11, WORLD = 20417;

// Saves a screenshot with a 256-colour palette, which keeps these map pictures a fraction of the size.
async function save(shot, path) {
  const img = UPNG.decode(shot);
  await writeFile(join(root, path), Buffer.from(UPNG.encode(UPNG.toRGBA8(img), img.width, img.height, 256)));
}
const browser = await pw.chromium.launch();
await mkdir(join(root, 'docs'), { recursive: true });

async function open(viewport, deviceScaleFactor, scheme = 'light') {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor, hasTouch: true, serviceWorkers: 'block', colorScheme: scheme });
  const page = await ctx.newPage();
  await page.addInitScript(seed => {
    let a = seed; // mulberry32
    Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    Date.now = () => 1760000000000;
  }, SEED);
  await page.goto(base);
  await page.evaluate(() => document.fonts.ready);
  return page;
}
const S = (page, fn, arg) => page.evaluate(fn, arg);
const frames = (page) => S(page, () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

// Drags along a path in map cells; with up: false it stops with the button still down, mid-sketch.
async function drag(page, points, { steps = 6, up = true } = {}) {
  await frames(page);
  const b = await page.locator('#map').boundingBox();
  const pts = [];
  for (const [x, y] of points) { const p = await S(page, ([x, y]) => window.terra.toScreen(x, y), [x, y]); pts.push([b.x + p.x, b.y + p.y]); }
  await page.mouse.move(...pts[0]); await page.mouse.down();
  for (let k = 1; k < pts.length; k++) for (let s = 1; s <= steps; s++) await page.mouse.move(pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * s / steps, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * s / steps);
  if (up) { await page.mouse.up(); await page.waitForTimeout(200); }
}
const hideToast = (page) => S(page, () => { document.getElementById('toast').hidden = true; });

// A hand-drawn island: coast, two ranges and a river, on blank ocean.
async function sketchIsland(page) {
  await S(page, () => window.terra.startBlank());
  await drag(page, [[120, 70], [210, 52], [300, 64], [372, 98], [384, 160], [350, 222], [282, 246], [200, 240], [132, 214], [96, 160], [104, 104], [120, 70]], { steps: 5 });
  await page.click('.chip[data-v="range"]');
  await page.click('.chip[data-v="high"]');
  await drag(page, [[150, 104], [215, 92], [290, 104], [340, 132]], { steps: 8 });
  await page.click('.chip[data-v="medium"]');
  await drag(page, [[170, 196], [232, 210], [290, 196]], { steps: 8 });
  await page.click('.chip[data-v="river"]');
  await drag(page, [[262, 142], [240, 160], [262, 186], [250, 214], [256, 252]], { steps: 8 });
  await page.click('#tab-world');
  await page.click('#wPopulate');
  await hideToast(page);
}

// Phone: the starting world; a sketch in progress; a town's page with a rumor in its notes.
{
  const page = await open({ width: 390, height: 844 }, 2);
  await S(page, (w) => window.terra.newWorld(w, 'continent'), WORLD);
  await page.waitForTimeout(200);
  await save(await page.screenshot(), 'docs/phone-world.png');

  await sketchIsland(page);
  await page.click('#tab-inspect');
  await page.click('.chip[data-v="land"]');
  // The options sit under the map on a phone, so picking one scrolls the top of the map away: bring it back.
  await S(page, () => { document.querySelector('.stage').scrollIntoView({ block: 'start' }); window.scrollBy(0, -12); });
  await drag(page, [[400, 200], [446, 186], [462, 232], [440, 262], [404, 252]], { steps: 6, up: false });
  await page.waitForTimeout(100);
  await save(await page.screenshot(), 'docs/phone-sketch.png');
  await page.keyboard.press('Escape');
  await page.mouse.up();

  await S(page, () => window.terra.setTool('select'));
  const cap = (await S(page, () => window.terra.places())).find((p) => p.kind === 'capital');
  await S(page, (p) => window.terra.select({ type: 'place', id: p.id }), cap);
  await page.click('#pRumor');
  await page.click('#dKeep');
  await hideToast(page);
  await page.locator('#pane-inspect').evaluate((el) => el.scrollIntoView({ block: 'end' }));
  await page.evaluate(() => window.scrollBy(0, -260));
  await save(await page.screenshot(), 'docs/phone-place.png');
  await page.context().close();
}

// Laptop: the starting world as an old atlas, with a capital open.
let mapData;
{
  const page = await open({ width: 1280, height: 800 }, 1);
  await S(page, (w) => window.terra.newWorld(w, 'continent'), WORLD);
  await S(page, () => window.terra.setStyle('atlas'));
  const cap = (await S(page, () => window.terra.places())).find((p) => p.kind === 'capital');
  await S(page, (p) => window.terra.select({ type: 'place', id: p.id }), cap);
  await page.waitForTimeout(200);
  await save(await page.screenshot(), 'docs/desktop.png');
  await S(page, () => window.terra.setStyle('terrain'));
  mapData = await S(page, () => window.terra.mapImage(2, false));
  await page.context().close();
}

// Link preview, 1200 x 630: the name and one line on the left, the starting world's full map on the right.
{
  const font = async (f) => `data:font/woff2;base64,${(await readFile(join(root, 'fonts', f))).toString('base64')}`;
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(`<!doctype html><style>
    @font-face { font-family: Fell; font-style: italic; src: url(${await font('im-fell-english-italic.woff2')}); }
    @font-face { font-family: Instrument; font-weight: 400 600; src: url(${await font('instrument-sans.woff2')}); }
    @font-face { font-family: Plex; src: url(${await font('ibm-plex-mono-400.woff2')}); }
    body { margin: 0; width: 1200px; height: 630px; overflow: hidden; position: relative; color: #dce5e8; font-family: Instrument;
      background: radial-gradient(ellipse 700px 520px at 860px 320px, rgba(224,170,69,.09), transparent 70%), #0c1317; }
    .text { position: absolute; left: 64px; top: 0; bottom: 0; width: 400px; display: flex; flex-direction: column; justify-content: center; gap: 24px; }
    .mark { width: 54px; height: 54px; color: #e0aa45; }
    h1 { margin: 0; font: italic 400 84px/1 Fell; letter-spacing: -.005em; }
    p { margin: 0; font-size: 28px; line-height: 1.35; color: #a9b8bf; }
    .coord { font: 17px Plex; color: #6c7d86; letter-spacing: .02em; }
    .map { position: absolute; right: 52px; top: 50%; transform: translateY(-50%) rotate(1.2deg); width: 664px;
      box-shadow: 0 0 0 1px rgba(0,0,0,.6), 0 30px 70px -20px rgba(0,0,0,.9); border-radius: 3px; }
  </style>
  <div class="text">
    <svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.6" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M12 1.8 14 10 12 12 10 10Z" fill="currentColor"/><path d="M12 22.2 10 14 12 12 14 14Z" fill="currentColor" opacity=".45"/><path d="M1.8 12 10 10 12 12 10 14Z" fill="currentColor" opacity=".45"/><path d="M22.2 12 14 14 12 12 14 10Z" fill="currentColor" opacity=".45"/></svg>
    <h1>Terra Incognita</h1>
    <p>Sketch a world. Rivers, realms and borders follow the land.</p>
    <div class="coord">58°N · 12°W · 1 league = 4.8 km</div>
  </div>
  <img class="map" src="${mapData}">`);
  await page.evaluate(() => document.fonts.ready);
  await save(await page.screenshot(), 'og.png');
  await page.close();
}

await browser.close();
server.close();
console.log('screenshots written');
