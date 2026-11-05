import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { hsl, inkOn, mean, over, rgb, vibrant } from "../src/cli/covers/colour.js";
import { fetchCovers, queryFor } from "../src/cli/covers/index.js";
import { Apple, big, matches } from "../src/cli/covers/sources.js";
import type { Covers } from "../src/core/types.js";

const hailMary = { title: "Project Hail Mary", author: "Andy Weir", isbn: "9780593135204" };
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("Apple matching", () => {
  it("rejects an ISBN lookup that returns another book", () => {
    expect(matches(hailMary, { trackName: "The Hill We Climb", artistName: "Amanda Gorman" })).toBe(false);
  });

  it("accepts the book under a longer store title", () => {
    expect(matches(hailMary, { trackName: "Project Hail Mary: A Novel", artistName: "Andy Weir" })).toBe(true);
  });

  it("needs the author's last name too", () => {
    expect(matches(hailMary, { trackName: "Project Hail Mary", artistName: "Someone Else" })).toBe(false);
  });

  it("asks for the original artwork size", () => {
    expect(big("https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg")).toBe(
      "https://is1-ssl.mzstatic.com/image/thumb/x/2000x2000bb.jpg",
    );
  });

  it("falls through a wrong ISBN match to a search", async () => {
    const get = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("lookup"))
        return json({ results: [{ trackName: "The Hill We Climb", artistName: "Amanda Gorman", artworkUrl100: "https://a/hill/100x100bb.jpg" }] });
      return json({ results: [{ trackName: "Project Hail Mary", artistName: "Andy Weir", artworkUrl100: "https://a/phm/100x100bb.jpg" }] });
    });
    const apple = new Apple(get as typeof fetch, 0);
    expect(await apple.find(hailMary)).toBe("https://a/phm/2000x2000bb.jpg");
    expect(get.mock.calls.filter(([u]) => String(u).includes("lookup"))).toHaveLength(3);
  });

  it("spaces its calls by the interval, even when called concurrently", async () => {
    let t = 0;
    const waits: number[] = [];
    const apple = new Apple(
      (async () => json({ results: [] })) as typeof fetch,
      3200,
      () => t,
      async (ms) => {
        waits.push(ms);
        t += ms;
      },
    );
    await Promise.all([apple.call("a"), apple.call("b"), apple.call("c")]);
    expect(waits).toEqual([3200, 3200]);
  });

  it("searches by coverTitle without the ISBN of the edition read", () => {
    expect(queryFor({ id: "x", title: "Le Problème à trois corps", author: "Liu Cixin", isbn: "1", coverTitle: "The Three-Body Problem" })).toEqual({
      title: "The Three-Body Problem",
      author: "Liu Cixin",
    });
  });
});

describe("cover colours", () => {
  const px = (...c: [number, number, number][]) => c.flat();

  it("round-trips HSL", () => {
    const back = rgb(hsl([200, 40, 90])).map(Math.round);
    expect(back).toEqual([200, 40, 90]);
  });

  it("finds the red lettering on a near-black cover, not the black", () => {
    const cover = px(...Array(90).fill([12, 12, 14]), ...Array(10).fill([200, 30, 30]));
    const [h, s] = hsl(hexRgb(vibrant(cover)));
    expect(h < 15 || h > 345).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0.5);
  });

  it("keeps a grey cover neutral, lifted off black", () => {
    const [, s, l] = hsl(hexRgb(vibrant(px(...Array(50).fill([5, 5, 5])))));
    expect(s).toBeLessThanOrEqual(0.12);
    expect(l).toBeGreaterThanOrEqual(0.25);
  });

  it("picks the ink by contrast on the back's real mix, not on the tint", () => {
    const tint: [number, number, number] = [0xc4, 0xa8, 0x3a]; // a mid ochre: light ink reads on it alone
    const wash: [number, number, number] = [0xee, 0xe6, 0xc8]; // the blurred cover: pale
    expect(inkOn(over(tint, wash, 0.55))).toBe("dark");
    expect(inkOn([0x30, 0x20, 0x60])).toBe("light");
  });

  it("averages the hinge strip", () => {
    expect(mean(px([0, 0, 0], [255, 255, 255]))).toBe("#808080");
  });
});

describe("fetchCovers", () => {
  it("writes the three files and covers.json from a pinned local cover", async () => {
    const dir = await mkdtemp(join(tmpdir(), "book-wall-"));
    const img = await sharp({ create: { width: 800, height: 1200, channels: 3, background: { r: 30, g: 90, b: 160 } } })
      .png()
      .toBuffer();
    await writeFile(join(dir, "art.png"), img);
    await writeFile(
      join(dir, "books.json"),
      JSON.stringify({ version: 1, books: [{ id: "blue", title: "Blue", author: "A. B.", cover: "art.png" }] }),
    );
    const get = vi.fn();
    const report = await fetchCovers({ books: join(dir, "books.json"), out: join(dir, "covers"), fetch: get as typeof fetch });
    expect(get).not.toHaveBeenCalled();
    expect(report).toEqual([["blue", "manual", "800×1200"]]);
    const manifest = JSON.parse(await readFile(join(dir, "covers", "covers.json"), "utf8")) as Covers;
    expect(manifest.blue).toMatchObject({ w: 800, h: 1200, source: "manual" });
    expect(manifest.blue!.tint).toMatch(/^#[0-9a-f]{6}$/);
    expect(manifest.blue!.spine).toMatch(/^#[0-9a-f]{6}$/);
    expect(manifest.blue!.backInk).toBe("light");
    for (const f of ["blue.webp", "blue.sm.webp", "blue.back.webp"]) {
      const { width } = await sharp(join(dir, "covers", f)).metadata();
      expect(width).toBe(f === "blue.webp" ? 720 : f === "blue.sm.webp" ? 320 : 48);
    }
    // --pinned never searches: a book without a pinned cover is left alone.
    await writeFile(
      join(dir, "books.json"),
      JSON.stringify({ version: 1, books: [{ id: "blue", title: "Blue", author: "A. B.", cover: "art.png" }, { id: "plain", title: "Plain", author: "C. D." }] }),
    );
    expect(await fetchCovers({ books: join(dir, "books.json"), out: join(dir, "covers"), pinned: true, force: true, fetch: get as typeof fetch })).toEqual([["blue", "manual", "800×1200"]]);
    expect(get).not.toHaveBeenCalled();
    // A second run skips books that already have a cover.
    expect(await fetchCovers({ books: join(dir, "books.json"), out: join(dir, "covers"), pinned: true, fetch: get as typeof fetch })).toEqual([]);
  });
});

function hexRgb(h: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
