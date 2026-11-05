// What the wall knows about each book: the library in wall order, plus the
// covers manifest. Pure, no DOM.

import { readLibrary, shelve, visible, yearOf, monthOf, type Shelf } from "../core/library.js";
import type { Book, Covers, Layout, Library, Text, Tone } from "../core/types.js";

export type { Book, Covers, Library };

export interface Shelfed {
  books: Book[];
  shelf: Map<string, Shelf>;
  covers: Covers;
  /** Base URL of the covers folder, ending in "/". */
  base: string;
}

export function prepare(lib: Library | unknown, covers: Covers = {}, base = ""): Shelfed {
  const { books, shelf } = shelve(visible(readLibrary(lib)));
  return { books, shelf, covers, base: base && !base.endsWith("/") ? base + "/" : base };
}

export const hash = (s: string) => {
  let n = 7;
  for (const c of s) n = (n * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(n);
};

/** Thickness as a fraction of the cover width: a novella is a slab, Dune a brick. */
export const thickness = (b: Book) => 0.05 + (Math.min(b.pages ?? 300, 900) / 900) * 0.15;

/** "Dungeon Crawler Carl — 4", or just the series name. */
export const seriesLine = (b: Book) =>
  b.series ? (b.volume ? `${b.series} — ${b.volume}` : b.series) : undefined;

/** Picks a language from a Text: exact, then the base language, then the first. */
export function say(t: Text | undefined, lang: string): string | undefined {
  if (t === undefined || typeof t === "string") return t;
  return t[lang] ?? t[lang.split("-")[0]!] ?? Object.values(t)[0];
}

export { yearOf, monthOf };

/** Cover colour and the ink that reads on it. Values are CSS custom properties. */
export const TONES: Record<Tone, { bg: string; ink: "dark" | "light" }> = {
  bone: { bg: "var(--_tone-bone)", ink: "dark" },
  sage: { bg: "var(--_tone-sage)", ink: "dark" },
  mist: { bg: "var(--_tone-mist)", ink: "dark" },
  ochre: { bg: "var(--_tone-ochre)", ink: "dark" },
  moss: { bg: "var(--_tone-moss)", ink: "light" },
  clay: { bg: "var(--_tone-clay)", ink: "light" },
  ink: { bg: "var(--_tone-ink)", ink: "light" },
  oxblood: { bg: "var(--_tone-oxblood)", ink: "light" },
  slate: { bg: "var(--_tone-slate)", ink: "light" },
};
const TONE_KEYS = Object.keys(TONES) as Tone[];
const LAYOUTS: Layout[] = ["classic", "band", "frame"];

// A series shares one design, like a real edition; a standalone gets its own.
const family = (b: Book) => b.series ?? b.id;
export const toneOf = (b: Book) => TONES[b.tone ?? TONE_KEYS[hash(family(b)) % TONE_KEYS.length]!];
export const layoutOf = (b: Book): Layout => b.layout ?? LAYOUTS[hash(family(b) + "l") % LAYOUTS.length]!;
export const INK = { dark: "var(--_ink-dark)", light: "var(--_ink-light)" };
export const inkOf = (b: Book) => INK[toneOf(b).ink];

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
};
// The default inks (--bw-ink-dark / --bw-ink-light), for the contrast maths.
const DARK = lum("#1b201c");
const LIGHT = lum("#efeadb");
/** The ink with the higher WCAG contrast on #rrggbb, darkened by `shade` (0–1) first. */
export const inkFor = (hex: string, shade = 1) => {
  const y = lum(hex) * shade * shade;
  return (y + 0.05) / (DARK + 0.05) >= (LIGHT + 0.05) / (y + 0.05) ? INK.dark : INK.light;
};

/** The back cover's ink: worked out by `book-wall covers` on the real wash, else from the tint. */
export const backInkOf = (d: Shelfed, b: Book) => {
  const s = d.covers[b.id];
  if (s?.backInk) return INK[s.backInk];
  return s?.tint ? inkFor(s.tint) : inkOf(b);
};

/** Audible Originals and the like: square art, drawn as a square box. */
export const isSquare = (d: Shelfed, b: Book) => {
  const s = d.covers[b.id];
  return !!s && s.h / s.w < 1.15;
};

/** The cover's own proportions: square art stays square, the rest book-shaped. */
export const aspectOf = (d: Shelfed, b: Book) => {
  const s = d.covers[b.id];
  if (!s) return 1.5;
  return isSquare(d, b) ? 1 : Math.min(1.62, Math.max(1.38, s.h / s.w));
};

export type CoverSize = "lg" | "sm" | "back";
export const coverUrl = (d: Shelfed, b: Book, size: CoverSize) =>
  d.covers[b.id] ? `${d.base}${b.id}${size === "lg" ? "" : "." + size}.webp` : undefined;

/**
 * How a binding is built: board thickness and the "square" (how far the
 * boards overhang the text block), as fractions of the cover width. A
 * hardback has thick boards that stand proud of the pages; a paperback is a
 * card wrapper cut flush with them.
 */
const HARD = { board: 0.022, square: 0.024 };
const PAPERBACK = { board: 0.007, square: 0.004 };
export const buildOf = (b: Book) => (b.binding === "Hardcover" ? HARD : PAPERBACK);

/** Each book leans its own amount, so a shelf never looks typeset. */
export const lean = (b: Book) => 3.5 + (hash(b.id) % 5) * 0.8;

// On the starting shelf books take their real size: the binding sets the
// width, the cover's own proportions the height.
const BINDING: Record<string, number> = {
  Hardcover: 1,
  Paperback: 0.9,
  "Mass Market Paperback": 0.78,
};
export const scaleOf = (b: Book) => (BINDING[b.binding ?? ""] ?? 0.88) * (0.97 + (hash(b.id) % 7) * 0.01);

export type { Shelf };
