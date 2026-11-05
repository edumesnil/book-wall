import { describe, expect, it } from "vitest";
import { isbn13, looseKey, seriesKey, slug, splitTitle } from "../src/cli/text.js";

describe("splitTitle", () => {
  it("takes the series and volume out of parentheses", () => {
    expect(splitTitle("The Salt Orchard (Lanternfall, #1)")).toEqual({
      title: "The Salt Orchard",
      series: "Lanternfall",
      volume: 1,
    });
  });

  it("reads a fractional volume and a missing comma", () => {
    expect(splitTitle("Embers Between (Lanternfall #2.5)")).toEqual({
      title: "Embers Between",
      series: "Lanternfall",
      volume: 2.5,
    });
  });

  it("leaves parentheses without a volume in the title", () => {
    expect(splitTitle("Notes (Collected)")).toEqual({ title: "Notes (Collected)" });
  });

  it("reads an omnibus title as series + tome", () => {
    expect(splitTitle("Les Marées : Première époque, 2")).toEqual({
      title: "Première époque, 2",
      series: "Les Marées",
    });
  });

  it("drops long subtitles and genre tags, keeps short subtitles", () => {
    expect(splitTitle("Quiet Engines: Notes Toward a Theory of Small Machines").title).toBe("Quiet Engines");
    expect(splitTitle("Night Ferry: A Thriller").title).toBe("Night Ferry");
    expect(splitTitle("Mistborn: The Final Empire (Mistborn, #1)").title).toBe("Mistborn: The Final Empire");
  });

  it("capitalises the first letter and collapses spaces", () => {
    expect(splitTitle("  the glass   wardens ").title).toBe("The glass wardens");
  });
});

describe("keys", () => {
  it("slugs accents and punctuation away", () => {
    expect(slug("L'Assassin royal : Première époque, 2")).toBe("l-assassin-royal-premiere-epoque-2");
  });

  it("matches series spellings with or without a leading article", () => {
    expect(seriesKey("L'Assassin royal")).toBe(seriesKey("Assassin Royal"));
    expect(seriesKey("L’Assassin royal")).toBe(seriesKey("assassin royal"));
    expect(seriesKey("The Lanternfall")).toBe(seriesKey("Lanternfall"));
    expect(seriesKey("Le Cycle des marées")).toBe(seriesKey("Cycle des Marées"));
  });

  it("doesn't strip a word that only starts like an article", () => {
    expect(seriesKey("Theodora")).toBe("theodora");
    expect(seriesKey("Lanterns")).toBe("lanterns");
  });

  it("compares authors by spelling, not order", () => {
    expect(looseKey("J.R.R. Tolkien")).toBe(looseKey("J. R. R. Tolkien"));
    expect(looseKey("Cixin Liu")).not.toBe(looseKey("Liu Cixin"));
  });
});

describe("isbn13", () => {
  it("keeps an ISBN-13 and unwraps Goodreads' formula", () => {
    expect(isbn13('="9780000000019"')).toBe("9780000000019");
  });

  it("converts an ISBN-10", () => {
    expect(isbn13("0306406152")).toBe("9780306406157");
    expect(isbn13("080442957X")).toBe("9780804429573");
  });

  it("rejects anything else", () => {
    expect(isbn13('=""')).toBeUndefined();
    expect(isbn13("12345")).toBeUndefined();
  });
});
