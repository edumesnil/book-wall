import type { Source } from "../../core/types.js";
import { goodreads } from "./goodreads.js";
import type { Importer } from "./types.js";

export const IMPORTERS: Importer[] = [goodreads];

/** The importer named by `--from`, or the first whose header matches. */
export function pickImporter(headers: string[], from?: string): Importer {
  if (from) {
    const i = IMPORTERS.find((x) => x.source === (from as Source));
    if (!i) throw new Error(`book-wall can't import from "${from}" yet. It reads ${IMPORTERS.map((x) => x.source).join(", ")}.`);
    return i;
  }
  const i = IMPORTERS.find((x) => x.detect(headers));
  if (!i)
    throw new Error(
      `This file doesn't look like a ${IMPORTERS.map((x) => x.name).join(" or ")} export. ` +
        "Use the CSV as you downloaded it: opening and saving it in a spreadsheet can change its columns.",
    );
  return i;
}

export type { Importer, Imported } from "./types.js";
