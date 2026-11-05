import { readFile, writeFile } from "node:fs/promises";
import { readLibrary } from "../core/library.js";
import type { Library } from "../core/types.js";
import { readRecords } from "./csv.js";
import { pickImporter } from "./importers/index.js";
import { merge, type MergeReport } from "./merge.js";

export interface ImportResult {
  library: Library;
  report: MergeReport;
  source: string;
  rows: number;
}

/** Export text + the previous books.json (if any) → the new library. Pure. */
export function importText(text: string, prev?: Library, from?: string): ImportResult {
  const { headers, records } = readRecords(text);
  const importer = pickImporter(headers, from);
  const { library, report } = merge(prev, importer.read(records), importer.source);
  return { library, report, source: importer.name, rows: records.length };
}

export async function importFile(csv: string, out: string, from?: string): Promise<ImportResult> {
  let prev: Library | undefined;
  try {
    prev = readLibrary(JSON.parse(await readFile(out, "utf8")));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const result = importText(await readFile(csv, "utf8"), prev, from);
  await writeFile(out, JSON.stringify(result.library, null, 2) + "\n");
  return result;
}
