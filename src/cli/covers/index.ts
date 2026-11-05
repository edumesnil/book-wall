// `book-wall covers`: a cover for every book, fetched once by the owner and
// self-hosted. Run by hand, never in a build: a visitor never calls a cover
// API, and a build never depends on one being up.
//
// Each cover is written three times — <id>.webp (720 wide, the open book),
// <id>.sm.webp (320 wide, the wall), <id>.back.webp (48 wide, pre-blurred:
// the back cover's wash) — and covers.json records its proportions, a spine
// colour and a tint, so the wall knows a cover's shape before it loads.
//
// The search matches on title and author and can still pick the wrong
// edition: check the report, pin a `cover` URL in books.json, rerun with
// that id.

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import sharp from "sharp";
import { readLibrary, visible } from "../../core/library.js";
import type { Book, CoverInfo, Covers } from "../../core/types.js";
import { inkOn, mean, over, parseHex, vibrant } from "./colour.js";
import { Apple, USER_AGENT, openLibrary, type Fetch, type Query } from "./sources.js";

export interface CoversOptions {
  /** Path to books.json. */
  books: string;
  /** The covers folder; covers.json is written inside it. */
  out: string;
  /** Refetch only these ids (even if they already have a cover). */
  ids?: string[];
  /** Refetch everything. */
  force?: boolean;
  /** Only books with a `cover` pinned in books.json; never search a cover API. */
  pinned?: boolean;
  log?: (line: string) => void;
  fetch?: Fetch;
}

export type CoverRow = [id: string, source: string, info: string];

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  );

/** `coverTitle` names another edition, so the ISBN (of the edition read) no longer applies. */
export const queryFor = (b: Book): Query =>
  b.coverTitle ? { title: b.coverTitle, author: b.author } : b;

async function load(src: string, base: string, get: Fetch): Promise<Buffer> {
  if (!/^https?:/i.test(src)) return readFile(isAbsolute(src) ? src : resolve(base, src));
  const res = await get(src, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${res.status} ${src}`);
  return Buffer.from(await res.arrayBuffer());
}

/** The three files for one cover. Returns its size. */
export async function writeCover(buf: Buffer, dir: string, id: string) {
  const img = sharp(buf).rotate();
  const { width = 0, height = 0 } = await img.metadata();
  await img.clone().resize({ width: 720, withoutEnlargement: true }).webp({ quality: 82 }).toFile(join(dir, `${id}.webp`));
  await img.clone().resize({ width: 320, withoutEnlargement: true }).webp({ quality: 78 }).toFile(join(dir, `${id}.sm.webp`));
  return { w: width, h: height };
}

/**
 * Tint, spine and back wash, from the wall-sized file. Cheap and local, so it
 * runs over every cover each time. The back is blurred here rather than by a
 * CSS filter: a blur on a face that rotates in 3D is re-rastered every frame
 * of a flip. Tiny and pre-blurred, it upscales into the same wash for free.
 */
export async function finishCover(dir: string, id: string): Promise<Pick<CoverInfo, "tint" | "spine" | "backInk">> {
  const img = sharp(join(dir, `${id}.sm.webp`));
  const thumb = await img.clone().resize(32, 48, { fit: "fill" }).removeAlpha().raw().toBuffer();
  await img
    .clone()
    .resize({ width: 48 })
    .blur(5)
    .modulate({ saturation: 1.7, brightness: 1.05 })
    .webp({ quality: 70 })
    .toFile(join(dir, `${id}.back.webp`));
  const { width = 1, height = 1 } = await img.metadata();
  const hinge = await img
    .clone()
    .extract({ left: 0, top: 0, width: Math.max(2, Math.round(width * 0.05)), height })
    .removeAlpha()
    .raw()
    .toBuffer();
  const tint = vibrant(thumb);
  // The back is the wash (the cover, blurred and brightened a little) under
  // the tint at 62% → 34%: the ink is chosen on that mix, where the text sits,
  // not on the tint alone, which reads far darker than the back looks.
  const wash = parseHex(mean(thumb)).map((c) => Math.min(255, c * 1.05)) as [number, number, number];
  const backInk = inkOn(over(parseHex(tint), wash, 0.55));
  return { tint, spine: mean(hinge), backInk };
}

export async function fetchCovers(opts: CoversOptions): Promise<CoverRow[]> {
  const log = opts.log ?? (() => {});
  const get = opts.fetch ?? fetch;
  const base = dirname(resolve(opts.books));
  const dir = resolve(opts.out);
  const manifestPath = join(dir, "covers.json");
  const only = new Set(opts.ids ?? []);
  const books = visible(readLibrary(JSON.parse(await readFile(opts.books, "utf8"))));
  for (const id of only)
    if (!books.some((b) => b.id === id)) log(`unknown id: ${id}`);

  let manifest: Covers = {};
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Covers;
  } catch {
    /* first run */
  }
  await mkdir(dir, { recursive: true });
  const save = () => writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  const apple = new Apple(get);
  const report: CoverRow[] = [];
  for (const b of books) {
    if (only.size && !only.has(b.id)) continue;
    if (opts.pinned && !b.cover) continue;
    if (!opts.force && !only.size && (await exists(join(dir, `${b.id}.webp`)))) continue;
    log(`… ${b.id}`);
    const q = queryFor(b);
    let source: CoverInfo["source"] | null = b.cover ? "manual" : null;
    let url = b.cover ?? null;
    try {
      if (!url && (url = await apple.find(q))) source = "apple";
      if (!url && (url = await openLibrary(q, get))) source = "openlibrary";
      if (!url || !source) {
        report.push([b.id, "none", "stays typographic"]);
        continue;
      }
      const size = await writeCover(await load(url, base, get), dir, b.id);
      manifest[b.id] = { ...size, source };
      report.push([b.id, source, `${size.w}×${size.h}`]);
      await save();
    } catch (e) {
      report.push([b.id, "error", (e as Error).message]);
    }
  }

  for (const [id, entry] of Object.entries(manifest)) {
    try {
      Object.assign(entry, await finishCover(dir, id));
    } catch {
      /* file missing: the wall falls back to the book's tone */
    }
  }
  await save();
  return report;
}
