import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readLibrary, shelve, visible } from "../src/core/library.js";
import type { Entry, Library } from "../src/core/types.js";
import { importText } from "../src/cli/import.js";

const CSV = readFileSync(new URL("./fixtures/goodreads-synthetic.csv", import.meta.url), "utf8");
const first = () => importText(CSV);
const byGr = (lib: Library, gr: string) => lib.books.find((b) => b.goodreads === gr)!;

describe("Goodreads import", () => {
  it("detects the export and takes the read and currently-reading shelves", () => {
    const { library, rows, source } = first();
    expect(source).toBe("Goodreads");
    expect(rows).toBe(18);
    expect(library.version).toBe(1);
    expect(library.books).toHaveLength(16);
    const ids = library.books.map((b) => b.goodreads);
    expect(ids).not.toContain("9000013"); // to-read
    expect(ids).not.toContain("9000014"); // a custom shelf
  });

  it("maps a full row", () => {
    expect(byGr(first().library, "9000001")).toEqual({
      id: "the-salt-orchard",
      goodreads: "9000001",
      title: "The Salt Orchard",
      author: "Mara Okafor",
      series: "Lanternfall",
      volume: 1,
      read: "2025-03-14",
      rating: 5,
      pages: 412,
      isbn: "9780000000019",
      binding: "Hardcover",
    });
  });

  it("keeps quoted titles with commas and quotes intact", () => {
    const b = byGr(first().library, "9000011");
    expect(b.title).toBe('The "Quiet" Hour, Revised');
    expect(b.id).toBe("the-quiet-hour-revised");
    expect(b.author).toBe("Sam Whitlock");
  });

  it("reads series from parentheses, fractional volumes included", () => {
    const { library } = first();
    expect(byGr(library, "9000003")).toMatchObject({ title: "Embers Between", series: "Lanternfall", volume: 2.5 });
  });

  it("reads an omnibus title", () => {
    expect(byGr(first().library, "9000008")).toMatchObject({ title: "Première époque, 2", series: "Les Marées" });
  });

  it("leaves out a missing date, a zero rating, empty pages and an empty ISBN", () => {
    const { library } = first();
    const ferry = byGr(library, "9000006");
    expect(ferry.title).toBe("Night Ferry");
    expect(ferry).not.toHaveProperty("read");
    const omni = byGr(library, "9000008");
    expect(omni).not.toHaveProperty("rating");
    expect(omni).not.toHaveProperty("pages");
    expect(byGr(library, "9000003")).not.toHaveProperty("isbn");
  });

  it("keeps fractional ratings", () => {
    expect(byGr(first().library, "9000004").rating).toBe(4.5);
  });

  it("puts currently-reading on the nightstand, without a date", () => {
    const b = byGr(first().library, "9000012");
    expect(b.status).toBe("reading");
    expect(b).not.toHaveProperty("read");
  });

  it("falls back to the ISBN-10, converted", () => {
    expect(byGr(first().library, "9000015")).toMatchObject({ title: "The glass wardens", isbn: "9780306406157" });
  });

  it("gives a second book with the same title its own id", () => {
    const { library } = first();
    expect(byGr(library, "9000012").id).toBe("between-tides");
    expect(byGr(library, "9000016").id).toBe("between-tides-9000016");
  });

  it("collapses spaces in author names", () => {
    expect(byGr(first().library, "9000007").author).toBe("Ines Varga");
  });

  it("rejects a file that isn't a known export", () => {
    expect(() => importText("Title,Author\nDune,Frank Herbert\n")).toThrow(/look like a Goodreads export/);
  });
});

describe("series names", () => {
  it("merges spellings that differ by a leading article, under the most common", () => {
    const { library } = first();
    expect(byGr(library, "9000004").series).toBe("Lanternfall");
  });

  it("breaks a tie by capitals, then length", () => {
    const { library } = first();
    expect(byGr(library, "9000009").series).toBe(byGr(library, "9000010").series);
    expect(byGr(library, "9000009").series).toBe("Le Cycle des marées");
  });

  it("reports names that look alike but aren't merged", () => {
    const { report } = first();
    expect(report.near).toContainEqual(["Starward Saga", "Starward"]);
    expect(report.near).toContainEqual(["Les Marées", "Le Cycle des marées"]);
    expect(report.near.flat()).not.toContain("Lanternfall");
  });

  it("applies aliases from books.json, matched loosely", () => {
    const prev: Library = {
      version: 1,
      aliases: { series: { starward: "The Starward Cycle", "starward saga": "The Starward Cycle" }, authors: { "june achebe": "J. Achebe" } },
      books: [],
    };
    const { library, report } = importText(CSV, prev);
    expect(byGr(library, "9000017")).toMatchObject({ series: "The Starward Cycle", author: "J. Achebe" });
    expect(byGr(library, "9000018").series).toBe("The Starward Cycle");
    expect(report.near.flat()).not.toContain("Starward");
    expect(library.aliases).toEqual(prev.aliases);
  });
});

describe("re-import", () => {
  it("keeps hand-written fields and overrides, refreshes what Goodreads owns", () => {
    const { library: before } = first();
    const salt = byGr(before, "9000001");
    Object.assign(salt, {
      id: "salt",
      title: "Stale title",
      rating: 1,
      quote: "Every orchard is a clock.",
      note: { en: "Read on a train.", fr: "Lu dans un train." },
      tone: "moss",
      cover: "https://example.org/salt.jpg",
      override: { binding: null, title: "The Salt Orchard (Revised)" },
      shelfNote: "a field the format doesn't know",
    } satisfies Partial<Entry>);
    const { library, report } = importText(CSV, before);
    const b = byGr(library, "9000001");
    expect(b).toMatchObject({
      id: "salt",
      title: "The Salt Orchard",
      rating: 5,
      quote: "Every orchard is a clock.",
      note: { en: "Read on a train.", fr: "Lu dans un train." },
      tone: "moss",
      cover: "https://example.org/salt.jpg",
      override: { binding: null, title: "The Salt Orchard (Revised)" },
      shelfNote: "a field the format doesn't know",
    });
    expect(report.added).toHaveLength(0);
    expect(report.updated).toBe(16);
  });

  it("keeps entries written by hand and reports books that left the export", () => {
    const { library: before } = first();
    before.books.push({ id: "hand", title: "A Book Read Elsewhere", author: "Someone" } as Entry);
    before.books.push({ id: "gone", goodreads: "1", title: "Shelved Away", author: "X" } as Entry);
    const { library, report } = importText(CSV, before);
    expect(library.books.map((b) => b.id)).toContain("hand");
    expect(library.books.map((b) => b.id)).not.toContain("gone");
    expect(report.removed).toEqual(["Shelved Away"]);
    expect(report.kept).toBe(1);
  });

  it("never gives a new book an id an existing entry already has", () => {
    const { library: before } = first();
    before.books = before.books.filter((b) => b.goodreads !== "9000012");
    before.books.push({ id: "between-tides", title: "Between Tides", author: "Hand" } as Entry);
    const { library } = importText(CSV, before);
    expect(byGr(library, "9000012").id).toBe("between-tides-9000012");
  });

  it("is stable: importing twice writes the same file", () => {
    const once = first().library;
    const twice = importText(CSV, structuredClone(once)).library;
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it("upgrades the unversioned array of earlier books.json files", () => {
    const legacy = readLibrary([{ id: "x", goodreads: "9000001", title: "Old", author: "Mara Okafor", quote: "q" }]);
    const { library } = importText(CSV, legacy);
    expect(library.version).toBe(1);
    expect(byGr(library, "9000001")).toMatchObject({ id: "x", quote: "q", title: "The Salt Orchard" });
  });
});

describe("library", () => {
  it("refuses an unknown version", () => {
    expect(() => readLibrary({ version: 2, books: [] })).toThrow(/version 2/);
  });

  it("lays overrides on top and drops hidden books", () => {
    const lib: Library = {
      version: 1,
      books: [
        { id: "a", title: "A", author: "X", binding: "Hardcover", override: { binding: null, title: "A2" } },
        { id: "b", title: "B", author: "X", override: { hidden: true } },
      ],
    };
    expect(visible(lib)).toEqual([{ id: "a", title: "A2", author: "X" }]);
  });

  it("shelves the nightstand first, then newest first, a series together", () => {
    const { books, shelf } = shelve(visible(first().library));
    expect(books[0]!.status).toBe("reading");
    const lantern = books.filter((b) => b.series === "Lanternfall").map((b) => b.volume);
    expect(lantern).toEqual([1, 2, 2.5, 3]);
    const start = books.findIndex((b) => b.series === "Lanternfall");
    expect(books.slice(start, start + 4).every((b) => b.series === "Lanternfall")).toBe(true);
    expect(shelf.get("the-salt-orchard")).toBe(2025);
    expect(books.at(-1)!.title).toBe("Night Ferry");
    expect(shelf.get(books.at(-1)!.id)).toBe("undated");
  });
});
