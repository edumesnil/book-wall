import { readFileSync } from "node:fs";
import Ajv from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { importText } from "../src/cli/import.js";

const schema = JSON.parse(readFileSync(new URL("../schema/books.v1.json", import.meta.url), "utf8"));
const CSV = readFileSync(new URL("./fixtures/goodreads-synthetic.csv", import.meta.url), "utf8");
const validate = new Ajv.default({ allErrors: true }).compile(schema);

describe("schema/books.v1.json", () => {
  it("accepts what the importer writes", () => {
    const ok = validate(importText(CSV).library);
    expect(validate.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  it("accepts hand fields and overrides", () => {
    const lib = importText(CSV).library;
    Object.assign(lib.books[0]!, {
      quote: "q",
      note: { en: "n", fr: "n" },
      tone: "moss",
      layout: "band",
      override: { binding: null, hidden: true, coverTitle: "Other" },
    });
    expect(validate(lib)).toBe(true);
  });

  it("rejects an unknown version, a bad date and an override of the id", () => {
    expect(validate({ version: 2, books: [] })).toBe(false);
    expect(validate({ version: 1, books: [{ id: "a", title: "A", author: "B", read: "15/03/2024" }] })).toBe(false);
    expect(validate({ version: 1, books: [{ id: "a", title: "A", author: "B", override: { id: "b" } }] })).toBe(false);
  });
});
