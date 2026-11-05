import type { Source } from "../../core/types.js";
import { goodreads } from "./goodreads.js";
import type { Importer } from "./types.js";

export const IMPORTERS: Importer[] = [goodreads];

/** The importer named by `--from`, or the first whose header matches. */
export function pickImporter(headers: string[], from?: string): Importer {
  if (from) {
    const i = IMPORTERS.find((x) => x.source === (from as Source));
    if (!i) throw new Error(`unknown source "${from}" (known: ${IMPORTERS.map((x) => x.source).join(", ")})`);
    return i;
  }
  const i = IMPORTERS.find((x) => x.detect(headers));
  if (!i)
    throw new Error(
      `this file doesn't look like a known export (${IMPORTERS.map((x) => x.name).join(", ")}). ` +
        "Use the CSV exactly as the site produces it.",
    );
  return i;
}

export type { Importer, Imported } from "./types.js";
