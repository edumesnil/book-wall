// The books.json format, version 1. Documented in docs/format.md, validated
// by schema/books.v1.json. Only id, title and author are required.

/** A string, or one string per language: { "en": "…", "fr": "…" }. */
export type Text = string | Record<string, string>;

export type Tone =
  | "bone"
  | "sage"
  | "moss"
  | "clay"
  | "ochre"
  | "ink"
  | "oxblood"
  | "slate"
  | "mist";
export type Layout = "classic" | "band" | "frame";

/** Where an entry came from. Each source owns one field holding its own id. */
export type Source = "goodreads";
export const SOURCES: readonly Source[] = ["goodreads"];

export interface Book {
  id: string;
  /** Goodreads' "Book Id": what a re-import matches on. */
  goodreads?: string;
  title: string;
  author: string;
  /** Date read: "YYYY-MM-DD", "YYYY-MM" or "YYYY". Orders the wall. */
  read?: string;
  /** "reading" puts the book on the nightstand, the first shelf. */
  status?: "reading";
  series?: string;
  volume?: number;
  /** Sets the book's thickness. */
  pages?: number;
  /** 0–5, fractions allowed. */
  rating?: number;
  /** ISBN-13. Prints a real EAN-13 barcode on the back. */
  isbn?: string;
  /** The format as Goodreads names it: "Hardcover", "Mass Market Paperback"… */
  binding?: string;
  /** A cover image URL pinned by hand, used by `book-wall covers`. */
  cover?: string;
  tone?: Tone;
  layout?: Layout;
  /** One line, set large on the back cover. */
  quote?: string;
  /** The back-cover text. */
  note?: Text;
  /** Drops the entry from the wall (set it under `override`). */
  hidden?: boolean;
  /** Title to search covers by, when the edition read has no good cover. */
  coverTitle?: string;
}

/** Hand corrections laid over what the source says. `null` removes a field. */
export type Override = { [K in keyof Book]?: Book[K] | null };

export type Entry = Book & { override?: Override } & Record<string, unknown>;

/**
 * Preferred names, applied on every import. Keys match loosely (case, accents,
 * punctuation and, for series, a leading article are ignored).
 */
export interface Aliases {
  series?: Record<string, string>;
  authors?: Record<string, string>;
}

export interface Library {
  $schema?: string;
  version: 1;
  aliases?: Aliases;
  books: Entry[];
}

/** One entry of covers/covers.json, keyed by book id. */
export interface CoverInfo {
  /** The source image's size: the book's proportions before it loads. */
  w: number;
  h: number;
  source: "manual" | "apple" | "openlibrary";
  /** Sampled from the cover's hinge edge. */
  spine?: string;
  /** The colour the cover reads as: washes the back cover. */
  tint?: string;
  /** The ink that reads on the back cover (wash + tint). */
  backInk?: "dark" | "light";
}
export type Covers = Record<string, CoverInfo>;
