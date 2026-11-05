#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { fetchCovers } from "./covers/index.js";
import { importFile } from "./import.js";

const HELP = `book-wall turns a Goodreads export into a wall of 3D books.

Usage
  book-wall import <export.csv> [--out books.json]
  book-wall covers [id ...] [--books books.json] [--out <folder>] [--force] [--pinned]

import   Reads your Goodreads export and writes books.json. To get the
         export, go to My Books, then Import and export, then Export library.
         Run it again whenever you like: it finds each book by its Goodreads
         id and keeps everything you wrote by hand.

covers   Downloads a cover for each book that doesn't have one yet, from
         Apple Books or Open Library, into a covers folder next to
         books.json. List ids to download only those books again.

Options
  -o, --out      where to write books.json (import) or the covers (covers)
  -b, --books    the books.json to read (covers). Default: ./books.json
  -f, --force    download every cover again
      --pinned   only books whose \`cover\` you set in books.json; never search
      --from     the export's source, if book-wall can't tell (goodreads)
  -h, --help
  -v, --version

Docs: https://github.com/edumesnil/book-wall
`;

async function main(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: "string", short: "o" },
      books: { type: "string", short: "b" },
      force: { type: "boolean", short: "f" },
      pinned: { type: "boolean" },
      from: { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  const [cmd, ...rest] = positionals;

  if (values.version) {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    console.log(pkg.version);
    return;
  }
  if (values.help || !cmd) {
    console.log(HELP);
    return;
  }

  if (cmd === "import") {
    const csv = rest[0];
    if (!csv) throw new Error("Which export? Run book-wall import <export.csv>.");
    const out = values.out ?? "books.json";
    const { library, report, source, rows } = await importFile(csv, out, values.from);
    console.log(`Wrote ${out}: ${library.books.length} books, from ${rows} rows in the ${source} export.`);
    if (report.added.length) console.log(`  ${report.added.length} new`);
    if (report.updated) console.log(`  ${report.updated} updated`);
    if (report.kept) console.log(`  ${report.kept} added by hand, left as they were`);
    if (report.removed.length)
      console.log(`  ${report.removed.length} removed, no longer on a read shelf: ${report.removed.join("; ")}`);
    for (const [a, b] of report.near)
      console.log(`"${a}" and "${b}" look like the same series. If they are, add an alias in books.json.`);
    return;
  }

  if (cmd === "covers") {
    const books = values.books ?? "books.json";
    const out = values.out ?? join(dirname(books), "covers");
    const report = await fetchCovers({
      books,
      out,
      ids: rest,
      force: !!values.force,
      pinned: !!values.pinned,
      // Progress on one line that rewrites itself, in a terminal only.
      log: (l) => process.stderr.isTTY && process.stderr.write(`\r\x1b[K${l}`),
    });
    if (process.stderr.isTTY) process.stderr.write("\r\x1b[K");
    for (const [id, src, info] of report) console.log(`${src.padEnd(12)} ${id.padEnd(42)} ${info}`);
    const low = report.filter(([, , info]) => /^\d+×/.test(info) && parseInt(info) < 600);
    if (low.length)
      console.log(
        `\n${low.length === 1 ? "1 cover is" : `${low.length} covers are`} under 600 pixels wide and will look soft. ` +
          "To use a sharper one, put its URL in the book's `cover` field and run book-wall covers <id>.",
      );
    if (!report.length)
      console.log(
        rest.length
          ? "None of those ids matched a book, so nothing was downloaded."
          : "Every book already has a cover. To download some again, list their ids, or use --force for all.",
      );
    return;
  }

  throw new Error(`There's no "${cmd}" command. Run book-wall --help to see the commands.`);
}

main(process.argv.slice(2)).catch((e: NodeJS.ErrnoException) => {
  console.error(e.code === "ENOENT" ? `Can't find ${e.path}. Check the path and try again.` : e.message);
  process.exit(1);
});
