import type { Book, Entry, Library } from "./types.js";

export const SCHEMA_URL = "https://unpkg.com/book-wall/schema/books.v1.json";

/**
 * Reads a books.json. Accepts version 1 and the bare array written before the
 * format was versioned (it becomes version 1 on the next import).
 */
export function readLibrary(json: unknown): Library {
  if (Array.isArray(json)) return { version: 1, books: json as Entry[] };
  if (json && typeof json === "object") {
    const o = json as Partial<Library> & { version?: unknown };
    if (o.version !== 1)
      throw new Error(`This books.json is format version ${String(o.version)}, and this book-wall reads version 1. Update book-wall.`);
    if (!Array.isArray(o.books)) throw new Error("This books.json has no list of books. Its \"books\" field should be an array.");
    return o as Library;
  }
  throw new Error("This doesn't look like a books.json. Run book-wall import to make one.");
}

/** The entry as its source has it, with the hand corrections laid on top. */
export function corrected({ override, ...b }: Entry): Book {
  const out: Record<string, unknown> = { ...b };
  for (const [k, v] of Object.entries(override ?? {})) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out as unknown as Book;
}

/** Every book the wall shows: corrected, hidden ones dropped. */
export const visible = (lib: Library): Book[] =>
  lib.books.map(corrected).filter((b) => !b.hidden);

export const yearOf = (b: Book) => (b.read ? Number(b.read.slice(0, 4)) : undefined);
export const monthOf = (b: Book) =>
  b.read && b.read.length >= 7 ? Number(b.read.slice(5, 7)) : undefined;

/** The shelf a book files under: the nightstand, a year, or undated. */
export type Shelf = "reading" | "undated" | number;

/**
 * The wall's order: the nightstand first, then newest first, undated last —
 * except that a series stands together, in volume order, where its most
 * recently read volume would be. A series read over two years shelves under
 * the later one.
 */
export function shelve(books: Book[]): { books: Book[]; shelf: Map<string, Shelf> } {
  const chrono = [...books].sort(
    (a, b) =>
      Number(b.status === "reading") - Number(a.status === "reading") ||
      Number(!!b.read) - Number(!!a.read) ||
      (b.read ?? "").localeCompare(a.read ?? ""),
  );
  const out: Book[] = [];
  const shelf = new Map<string, Shelf>();
  const placed = new Set<string>();
  for (const b of chrono) {
    if (b.status === "reading" || !b.series) {
      out.push(b);
      shelf.set(b.id, b.status === "reading" ? "reading" : (yearOf(b) ?? "undated"));
      continue;
    }
    if (placed.has(b.series)) continue;
    placed.add(b.series);
    const anchor = yearOf(b) ?? "undated";
    const run = chrono
      .filter((x) => x.series === b.series && x.status !== "reading")
      .sort((x, y) => (x.volume ?? 0) - (y.volume ?? 0));
    for (const x of run) shelf.set(x.id, anchor);
    out.push(...run);
  }
  return { books: out, shelf };
}
