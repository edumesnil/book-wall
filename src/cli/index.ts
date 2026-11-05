#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { fetchCovers } from "./covers/index.js";
import { importFile } from "./import.js";

const HELP = `book-wall: your reading as a wall of 3D books

Usage
  book-wall import <export.csv> [--out books.json] [--from goodreads]
  book-wall covers [id…] [--books books.json] [--out <folder>] [--force] [--pinned]

import   Reads a Goodreads library export (My Books → Import and export →
         Export library) into books.json. Safe to rerun: books match on their
         Goodreads id, and everything written by hand is kept.

covers   Fetches a cover for every book without one (Apple Books, then Open
         Library) and writes <folder>/<id>.webp, .sm.webp, .back.webp and
         <folder>/covers.json. The folder defaults to covers/ beside
         books.json. Pass ids to refetch only those, --force to refetch all.

Options
  -o, --out      output file (import) or folder (covers)
  -b, --books    books.json to read (covers), default ./books.json
  -f, --force    refetch every cover
      --pinned   only books with a \`cover\` pinned in books.json; never search
      --from     source format, when detection fails
  -h, --help
  -v, --version
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
    if (!csv) throw new Error("usage: book-wall import <export.csv>");
    const out = values.out ?? "books.json";
    const { library, report, source, rows } = await importFile(csv, out, values.from);
    console.log(`${out}: ${library.books.length} books from ${source} (${rows} rows in the export)`);
    if (report.added.length) console.log(`  added    ${report.added.length}`);
    console.log(`  updated  ${report.updated}`);
    if (report.kept) console.log(`  kept     ${report.kept} from other sources or written by hand`);
    if (report.removed.length)
      console.log(`  removed  ${report.removed.length}, no longer on a read shelf: ${report.removed.join("; ")}`);
    for (const [a, b] of report.near)
      console.log(`  series "${a}" and "${b}" look alike: add an alias in books.json if they are one`);
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
      log: (l) => process.stderr.write(`\r\x1b[K${l}`),
    });
    process.stderr.write("\r\x1b[K");
    for (const [id, src, info] of report) console.log(`${src.padEnd(12)} ${id.padEnd(42)} ${info}`);
    const low = report.filter(([, , info]) => /^\d+×/.test(info) && parseInt(info) < 600);
    if (low.length) console.log(`\n${low.length} cover(s) under 600px wide: worth pinning a better \`cover\`.`);
    if (!report.length) console.log("Every book already has a cover. Pass ids or --force to refetch.");
    return;
  }

  throw new Error(`unknown command "${cmd}". Run book-wall --help.`);
}

main(process.argv.slice(2)).catch((e: NodeJS.ErrnoException) => {
  console.error(`book-wall: ${e.code === "ENOENT" ? `no such file: ${e.path}` : e.message}`);
  process.exit(1);
});
