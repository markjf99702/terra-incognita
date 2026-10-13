// Builds the single-file copy for the Artifact viewer:  node scripts/build.mjs
// dist/terra-incognita.html is one self-contained page; dist/artifact.html is the same without the document wrapper,
// for hosts that supply their own <html>/<head>/<body>. The site itself needs no build.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');
const dataUri = async (path, type) => `data:${type};base64,${(await readFile(new URL(path, root))).toString('base64')}`;

// A single file can't point at other files, so the fonts and the icon go in as data: URIs,
// and the links that only make sense for the hosted site (manifest, home-screen icon, preloads) come out.
let css = await read('css/app.css');
for (const [, file] of css.matchAll(/url\(\.\.\/(fonts\/[^)]+\.woff2)\)/g)) css = css.replace(`url(../${file})`, `url(${await dataUri(file, 'font/woff2')})`);
const js = (await read('js/app.js')).replace(/<\/script/gi, '<\\/script');
const icon = await dataUri('icon.svg', 'image/svg+xml');
const html = (await read('index.html'))
  .replace(/<link rel="(manifest|apple-touch-icon|preload)"[^>]*>\n/g, '')
  .replace('href="icon.svg"', () => `href="${icon}"`)
  .replace('<link rel="stylesheet" href="css/app.css">', () => `<style>\n${css}</style>`)
  .replace('<script type="module" src="js/app.js"></script>', () => `<script type="module">\n${js}</script>`);

const fragment = html
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<\/?html[^>]*>\s*/gi, '')
  .replace(/<\/?head>\s*/gi, '')
  .replace(/<\/?body[^>]*>\s*/gi, '')
  .replace(/<meta charset[^>]*>\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');

await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/terra-incognita.html', root), html);
await writeFile(new URL('dist/artifact.html', root), fragment);
console.log(`dist/terra-incognita.html  ${(html.length / 1024).toFixed(1)} KB`);
