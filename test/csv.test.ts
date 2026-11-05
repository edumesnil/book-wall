import { describe, expect, it } from "vitest";
import { parseCsv, readRecords } from "../src/cli/csv.js";

describe("parseCsv", () => {
  it("splits plain fields", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("keeps commas, doubled quotes and newlines inside quotes", () => {
    expect(parseCsv('"The ""Quiet"" Hour, Revised","one\ntwo"\n')).toEqual([
      ['The "Quiet" Hour, Revised', "one\ntwo"],
    ]);
  });

  it("reads Goodreads' formula ISBNs as text", () => {
    expect(parseCsv('"=""9780000000019""","="""""\n')).toEqual([['="9780000000019"', '=""']]);
  });

  it("handles CRLF, a lone CR and a missing final newline", () => {
    expect(parseCsv("a,b\r\n1,2\r3,4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("keeps CRLF inside a quoted field", () => {
    expect(parseCsv('"x\r\ny",z\r\n')).toEqual([["x\r\ny", "z"]]);
  });

  it("strips a byte-order mark", () => {
    expect(parseCsv("﻿Book Id,Title\n1,A")[0]).toEqual(["Book Id", "Title"]);
  });

  it("drops blank lines and keeps empty fields", () => {
    expect(parseCsv("a,,c\n\n\n,,\n1,,\n")).toEqual([
      ["a", "", "c"],
      ["1", "", ""],
    ]);
  });
});

describe("readRecords", () => {
  it("keys rows by header and fills short rows", () => {
    const { headers, records } = readRecords("Book Id, Title ,Author\n1,Dune\n");
    expect(headers).toEqual(["Book Id", "Title", "Author"]);
    expect(records).toEqual([{ "Book Id": "1", Title: "Dune", Author: "" }]);
  });

  it("returns nothing for an empty file", () => {
    expect(readRecords("")).toEqual({ headers: [], records: [] });
  });
});
