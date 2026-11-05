// A re-import is safe: books are matched on their source id, the export
// refreshes what the source owns (OWNED) and everything else on an entry —
// quote, note, tone, layout, cover, override, any field added by hand — is
// kept. Entries from other sources, or written by hand, are left alone.

import { SCHEMA_URL } from "../core/library.js";
import type { Entry, Library, Source } from "../core/types.js";
import { OWNED, type Imported } from "./importers/types.js";
import { nearSeries, unifyNames } from "./names.js";
import { slug } from "./text.js";

export interface MergeReport {
  added: string[];
  updated: number;
  /** Titles that left the export (shelved elsewhere, or deleted). */
  removed: string[];
  /** Entries this import doesn't own, kept as they were. */
  kept: number;
  near: [string, string][];
}

export function merge(
  prev: Library | undefined,
  imported: Imported[],
  source: Source,
): { library: Library; report: MergeReport } {
  const old = prev?.books ?? [];
  const bySource = new Map(
    old.filter((b) => typeof b[source] === "string").map((b) => [b[source] as string, b]),
  );
  const seen = new Set(imported.map((b) => b.sourceId));
  const others = old.filter((b) => typeof b[source] !== "string");

  // Ids already taken: kept entries and every entry this import will match.
  const ids = new Set<string>([...others.map((b) => b.id), ...imported.flatMap((b) => bySource.get(b.sourceId)?.id ?? [])]);
  const report: MergeReport = { added: [], updated: 0, removed: [], kept: others.length, near: [] };

  const books: Entry[] = [];
  for (const b of imported) {
    const before = bySource.get(b.sourceId);
    let id = before?.id;
    if (!id) {
      id = slug(b.title) || slug(`${source}-${b.sourceId}`);
      if (ids.has(id)) id = `${id}-${b.sourceId}`;
      ids.add(id);
      report.added.push(b.title);
    } else report.updated++;
    const hand = Object.fromEntries(
      Object.entries(before ?? {}).filter(
        ([k, v]) => k !== "id" && k !== source && !(OWNED as readonly string[]).includes(k) && v !== undefined,
      ),
    );
    const { sourceId, ...fields } = b;
    books.push({ id, [source]: sourceId, ...fields, ...hand } as Entry);
  }
  for (const [sid, b] of bySource) if (!seen.has(sid)) report.removed.push(b.title);
  books.push(...others);

  const aliases = prev?.aliases ?? { series: {}, authors: {} };
  unifyNames(books, aliases);
  report.near = nearSeries(books);

  return {
    library: { $schema: SCHEMA_URL, version: 1, aliases, books },
    report,
  };
}
