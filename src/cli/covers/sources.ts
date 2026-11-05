// Where covers come from, best first:
//   1. `cover` in books.json, a URL pinned by hand when the search is wrong
//   2. Apple Books (iTunes Search API, no key): the artwork URL takes a size,
//      and asking for 2000×2000 returns the publisher's original (≈1400×2100)
//   3. Open Library (≈330×500 at best, a last resort)

import type { Book } from "../../core/types.js";
import { looseKey } from "../text.js";

export type Fetch = typeof fetch;
export const USER_AGENT = "book-wall (+https://github.com/edumesnil/book-wall)";

export interface AppleResult {
  trackName?: string;
  collectionName?: string;
  artistName?: string;
  artworkUrl100?: string;
}

/** What the lookup needs from a book. */
export type Query = Pick<Book, "title" | "author" | "isbn" | "series">;

/**
 * An Apple result is the book only if title and author agree. This applies to
 * ISBN lookups too: Apple once answered Project Hail Mary's ISBN with The Hill
 * We Climb.
 */
export function matches(b: Query, r: AppleResult): boolean {
  const t = looseKey(b.title);
  const name = looseKey(r.trackName ?? r.collectionName ?? "");
  const last = looseKey(b.author).split(" ").pop() ?? "";
  if (!t || !name || !last) return false;
  return (name.includes(t) || t.includes(name)) && looseKey(r.artistName ?? "").includes(last);
}

/** Apple's artwork URLs take a size; 2000×2000 returns the original. */
export const big = (url: string) => url.replace(/\/\d+x\d+bb\.(jpg|png|webp)$/, "/2000x2000bb.jpg");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The iTunes API allows roughly 20 calls a minute; one call every 3.2 s stays
 * well under it. Calls are serialised, whoever makes them.
 */
export class Apple {
  private last = -Infinity;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly get: Fetch = fetch,
    readonly interval = 3200,
    private readonly now = () => Date.now(),
    private readonly wait = sleep,
  ) {}

  call(path: string): Promise<AppleResult[]> {
    const run = async () => {
      const d = this.last + this.interval - this.now();
      if (d > 0) await this.wait(d);
      this.last = this.now();
      const res = await this.get(`https://itunes.apple.com/${path}`);
      if (!res.ok) throw new Error(`iTunes ${res.status}`);
      return (((await res.json()) as { results?: AppleResult[] }).results ?? []) as AppleResult[];
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  async find(b: Query): Promise<string | null> {
    if (b.isbn)
      for (const country of ["ca", "us", "fr"]) {
        const [r] = await this.call(`lookup?isbn=${b.isbn}&country=${country}`);
        if (r?.artworkUrl100 && matches(b, r)) return big(r.artworkUrl100);
      }
    const terms = [`${b.title} ${b.author}`];
    if (b.series) terms.push(`${b.series} ${b.title} ${b.author}`);
    for (const entity of ["ebook", "audiobook"])
      for (const term of terms)
        for (const country of ["ca", "fr", "us"]) {
          const q = new URLSearchParams({ term, entity, country, limit: "15" });
          const r = (await this.call(`search?${q}`)).find((x) => matches(b, x) && x.artworkUrl100);
          if (r) return big(r.artworkUrl100!);
        }
    return null;
  }
}

export async function openLibrary(b: Query, get: Fetch = fetch): Promise<string | null> {
  const headers = { "User-Agent": USER_AGENT };
  if (b.isbn) {
    const url = `https://covers.openlibrary.org/b/isbn/${b.isbn}-L.jpg?default=false`;
    if ((await get(url, { method: "HEAD", headers })).ok) return url;
  }
  const q = new URLSearchParams({ title: b.title, author: b.author, limit: "5" });
  const res = await get(`https://openlibrary.org/search.json?${q}`, { headers });
  if (!res.ok) return null;
  const doc = ((await res.json()) as { docs?: { cover_i?: number }[] }).docs?.find((d) => d.cover_i);
  return doc ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null;
}
