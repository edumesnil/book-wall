// Composes the demo's covers: a public-domain painting from The Met's Open
// Access collection, under a printed label with the title and author. Run by
// hand, then `book-wall covers --pinned` turns them into the wall's files.
//
//   node demo/scripts/paintings.mjs
//   node dist/cli/index.js covers -b demo/public/books.json -o demo/public/covers --pinned --force
//
// Rights. Only works The Met marks `isPublicDomain` (released under CC0) and
// made before 1900, so the painting or print is out of copyright everywhere, not only
// in the US. The book titles are public-domain classics. The type is set in
// Instrument Serif and IBM Plex Mono (SIL OFL), downloaded once into
// demo/.cache and drawn as vector outlines (fontkit), so the covers come
// out the same on any machine, whatever fonts it has installed.
// Every source is listed in demo/CREDITS.md, written by this script.

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const DEMO = fileURLToPath(new URL("..", import.meta.url));
const CACHE = `${DEMO}.cache/`;
import * as fontkit from "fontkit";
import sharp from "sharp";
const ART = `${DEMO}art/`;
const UA = { "User-Agent": "book-wall demo (+https://github.com/edumesnil/book-wall)" };
const FONTS = {
  serif: ["InstrumentSerif-Regular.ttf", "https://github.com/google/fonts/raw/main/ofl/instrumentserif/InstrumentSerif-Regular.ttf"],
  mono: ["IBMPlexMono-Medium.ttf", "https://github.com/google/fonts/raw/main/ofl/ibmplexmono/IBMPlexMono-Medium.ttf"],
};
const W = 1400;
const H = 2100;
const LABEL = Math.round(H * 0.36);
const PAD = 96;
// Neutral on purpose: a cream saturated enough to vote would pull every
// cover's tint (the colour washing its back) toward ochre.
const PAPER = "#eeece8";
const INK = "#1d1c19";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (p) => stat(p).then(() => true, () => false);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function cached(name, url) {
  const p = CACHE + name;
  if (!(await exists(p))) {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    await writeFile(p, Buffer.from(await res.arrayBuffer()));
  }
  return p;
}

// The Met's API sits behind a bot wall that answers bursts with an HTML page:
// one call a second, and a long pause before a retry.
let last = 0;
async function met(id) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = last + 1200 - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`, { headers: UA });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      console.warn(`  met ${id}: throttled, waiting`);
      await sleep(20_000 * (attempt + 1));
    }
  }
  throw new Error(`met ${id}: no answer`);
}

/** The painting cropped to the art area, centred on `focus` (x, y in 0–1). */
async function crop(buf, [fx, fy], w, h) {
  const img = sharp(buf).rotate();
  const { width, height } = await img.metadata();
  // A little past "cover": the scans often show the canvas edge or the frame.
  const scale = Math.max(w / width, h / height) * 1.06;
  const sw = Math.round(width * scale);
  const sh = Math.round(height * scale);
  const left = Math.min(sw - w, Math.max(0, Math.round(sw * fx - w / 2)));
  const top = Math.min(sh - h, Math.max(0, Math.round(sh * fy - h / 2)));
  return img.resize(sw, sh).extract({ left, top, width: w, height: h }).toBuffer();
}

const font = (path) => fontkit.openSync(path);

/** One line of text as SVG path data, shaped by the font (kerning included). */
function line(f, str, size, x, y, tracking = 0) {
  const k = size / f.unitsPerEm;
  const run = f.layout(str);
  let d = "";
  run.glyphs.forEach((g, i) => {
    const p = run.positions[i];
    d += g.path.scale(k, -k).translate(x + p.xOffset * k, y - p.yOffset * k).toSVG();
    x += p.xAdvance * k + tracking * size;
  });
  return d;
}

const width = (f, str, size, tracking = 0) =>
  f.layout(str).positions.reduce((w, p) => w + p.xAdvance * (size / f.unitsPerEm) + tracking * size, 0);

/** Word-wrapped lines as one SVG path, the first baseline one ascent below y. */
function lines(f, str, size, maxWidth, { x, y, leading = 1.1, tracking = 0 }) {
  const out = [];
  let cur = "";
  for (const word of str.split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && width(f, next, size, tracking) > maxWidth) {
      out.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) out.push(cur);
  const ascent = (f.ascent / f.unitsPerEm) * size * 0.8;
  const d = out.map((l, i) => line(f, l, size, x, y + ascent + i * size * leading, tracking)).join("");
  return { d, height: out.length * size * leading };
}

async function compose(book, painting, fonts) {
  const art = await crop(painting, book.focus, W, H - LABEL);
  const size = book.title.length > 22 ? 112 : 136;
  const title = lines(fonts.serif, book.title, size, W - PAD * 2, { x: PAD, y: H - LABEL + 80, leading: 1.02 });
  const by = lines(fonts.mono, book.author.toUpperCase(), 34, W - PAD * 2, { x: PAD, y: H - PAD - 34, tracking: 0.16 });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect x="0" y="${H - LABEL}" width="${W}" height="10" fill="${INK}"/>
    <path d="${title.d}" fill="${INK}"/>
    <path d="${by.d}" fill="${INK}" fill-opacity="0.78"/>
  </svg>`;
  return sharp({ create: { width: W, height: H, channels: 3, background: PAPER } })
    .composite([{ input: art, top: 0, left: 0 }, { input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

await mkdir(ART, { recursive: true });
await mkdir(CACHE, { recursive: true });
const fonts = {
  serif: font(await cached(...FONTS.serif)),
  mono: font(await cached(...FONTS.mono)),
};
const plan = JSON.parse(await readFile(`${DEMO}paintings.json`, "utf8"));
const lib = JSON.parse(await readFile(`${DEMO}public/books.json`, "utf8"));
const credits = [];

for (const [id, { met: objectId, focus }] of Object.entries(plan)) {
  if (id.startsWith("$")) continue;
  const entry = lib.books.find((b) => b.id === id);
  if (!entry) throw new Error(`${id}: not in demo/public/books.json`);
  const b = { ...entry, ...entry.override };
  const o = await met(objectId);
  if (!o.isPublicDomain) throw new Error(`${id}: Met object ${objectId} is not public domain`);
  if (!(o.objectEndDate < 1900)) throw new Error(`${id}: Met object ${objectId} is dated ${o.objectEndDate}`);
  const src = await cached(`met-${objectId}.jpg`, o.primaryImage);
  await writeFile(`${ART}${id}.jpg`, await compose({ title: b.title, author: b.author, focus }, await readFile(src), fonts));
  credits.push({ book: b.title, author: b.author, title: o.title.split(/[:(]/)[0].replace(/,\s*also known as.*$/, "").trim(), artist: o.artistDisplayName || "Unknown artist", date: o.objectDate, url: o.objectURL });
  console.log(`${id.padEnd(40)} ${o.artistDisplayName}, ${o.title}`);
}

const row = (c) => `| ${c.book} | ${c.author} | [${c.title}](${c.url}) | ${c.artist} | ${c.date} |`;
await writeFile(
  `${DEMO}CREDITS.md`,
  `# Demo credits

The demo uses only public-domain works and openly licensed fonts. The project's MIT licence covers the code, not these. Each one keeps the terms listed below.

## Books

The demo shelves public-domain classics. Their read dates, ratings, notes and ISBNs are invented. The quotes on the back covers come from the original English texts.

## Cover art

\`demo/scripts/paintings.mjs\` composes each illustrated cover from a work in the Open Access collection of The Metropolitan Museum of Art, which releases these images under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The script only takes works The Met marks as public domain and that date from before 1900, so they're out of copyright in every country, not only in the United States. Books without a picture get a typographic cover drawn by the element.

| Book | Author | Work | Artist | Date |
| --- | --- | --- | --- | --- |
${credits.map(row).join("\n")}

## Fonts

- [Instrument Serif](https://github.com/Instrument/instrument-serif), by the Instrument Serif Project Authors, under the SIL Open Font License 1.1 (\`demo/public/fonts/InstrumentSerif-OFL.txt\`)
- [IBM Plex Mono](https://github.com/IBM/plex), by IBM, under the SIL Open Font License 1.1 (\`demo/public/fonts/IBMPlexMono-OFL.txt\`)

The demo page uses both, and the composed covers are set in them.
`,
);
console.log(`\n${credits.length} covers in demo/art/, credits in demo/CREDITS.md`);
