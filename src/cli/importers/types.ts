import type { Book, Source } from "../../core/types.js";

/** The fields a source owns: refreshed on every import, never kept from before. */
export const OWNED = [
  "title",
  "author",
  "series",
  "volume",
  "status",
  "read",
  "rating",
  "pages",
  "isbn",
  "binding",
] as const satisfies readonly (keyof Book)[];

export type Imported = Pick<Book, (typeof OWNED)[number]> & {
  /** The source's own id for the book: what a re-import matches on. */
  sourceId: string;
};

/**
 * One importer per export format. To add a source (Hardcover, StoryGraph…):
 * add its key to `Source` in core/types.ts, write an importer, register it in
 * importers/index.ts. The merge, the aliases and the id rules are shared.
 */
export interface Importer {
  source: Source;
  /** Shown in messages: "Goodreads". */
  name: string;
  /** True when a CSV header looks like this source's export. */
  detect(headers: string[]): boolean;
  /** Books from the export's records, in file order, already normalised. */
  read(records: Record<string, string>[]): Imported[];
}
