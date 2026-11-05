// Goodreads → My Books → Import and export → Export library. The CSV has one
// row per book on any shelf; only "read" and "currently-reading" go on the wall.

import { collapse, isbn13, splitTitle } from "../text.js";
import type { Imported, Importer } from "./types.js";

const REQUIRED = ["Book Id", "Title", "Author", "Exclusive Shelf"];

/** "2024/03/15" → "2024-03-15". Anything else is dropped. */
function date(raw: string): string | undefined {
  const m = /^(\d{4})(?:[/-](\d{1,2}))?(?:[/-](\d{1,2}))?$/.exec(raw.trim());
  if (!m) return undefined;
  return [m[1], m[2], m[3]]
    .filter(Boolean)
    .map((p, i) => (i ? p!.padStart(2, "0") : p))
    .join("-");
}

const positive = (raw: string | undefined) => {
  const n = Number((raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export const goodreads: Importer = {
  source: "goodreads",
  name: "Goodreads",
  detect: (headers) => REQUIRED.every((h) => headers.includes(h)),
  read: (records) =>
    records
      .filter((r) => r["Exclusive Shelf"] === "read" || r["Exclusive Shelf"] === "currently-reading")
      .filter((r) => r["Book Id"]?.trim() && r.Title?.trim())
      .map((r): Imported => {
        const { title, series, volume } = splitTitle(r.Title!);
        const reading = r["Exclusive Shelf"] === "currently-reading";
        const read = reading ? undefined : date(r["Date Read"] ?? "");
        const rating = positive(r["My Rating"]);
        const pages = positive(r["Number of Pages"]);
        // Goodreads writes ISBNs as spreadsheet formulas: ="9780593135204".
        const isbn = isbn13(r.ISBN13 ?? "") ?? isbn13(r.ISBN ?? "");
        const binding = collapse(r.Binding ?? "");
        return {
          sourceId: r["Book Id"]!.trim(),
          title,
          author: collapse(r.Author ?? ""),
          ...(series && { series }),
          ...(volume !== undefined && { volume }),
          ...(reading && { status: "reading" as const }),
          ...(read && { read }),
          ...(rating && { rating: Math.min(rating, 5) }),
          ...(pages && { pages: Math.round(pages) }),
          ...(isbn && { isbn }),
          ...(binding && { binding }),
        };
      }),
};
