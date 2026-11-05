// One book as a CSS 3D box. Its size comes from custom properties set by
// whoever places it: `--w` (the cover width), `--ar` (height ÷ width, 1.5 by
// default) and `--t` (thickness as a fraction of `--w`, from the page count).
// The face geometry lives in wall.css (`.book`).
//
// A book with a fetched cover shows it; one without gets a typographic cover
// in the `--bw-tone-*` colours (read as `--_tone-*`). Either way it keeps the hinge and the light,
// which is most of what makes it look like an object. A cover that fails to
// load falls back to the typographic one.

import {
  backInkOf,
  buildOf,
  coverUrl,
  hash,
  inkFor,
  inkOf,
  layoutOf,
  seriesLine,
  thickness,
  toneOf,
  type Book,
  type CoverSize,
  type Shelfed,
} from "./data.js";
import { h, s } from "./dom.js";

// Title size in em of the cover's base size (a tenth of its width). The length
// picks a step; the longest word caps it, so "Programmer" never runs off.
function titleSize(title: string) {
  const len = title.length;
  const step = len <= 6 ? 2.1 : len <= 12 ? 1.6 : len <= 20 ? 1.3 : 1.05;
  const longest = Math.max(...title.split(/\s+/).map((w) => w.length));
  return `${Math.min(step, 8 / (longest * 0.58)).toFixed(2)}em`;
}

const title = (b: Book, cls = "") => h(`span.bw-art-title${cls}`, { style: { "font-size": titleSize(b.title) } }, b.title);
const author = (b: Book, cls = "") => h(`span.bw-art-author${cls}`, null, b.author);

const CORNERS = ["tl", "tr", "br", "bl"];

/** The typographic cover: three layouts, one per series or standalone. */
function art(b: Book): HTMLElement {
  const series = seriesLine(b);
  const tag = series ? h("span.bw-art-series", null, series) : null;
  const layout = layoutOf(b);

  if (layout === "band")
    return h(
      "div.bw-art.bw-art-band",
      null,
      author(b),
      tag && h("span.bw-art-band-tag", null, tag),
      h("div.bw-art-checker"),
      title(b),
    );

  if (layout === "frame")
    return h(
      "div.bw-art-frame",
      null,
      h("span.bw-art-frame-line"),
      // Corner squares, as a printer's ornament.
      ...CORNERS.map((c) => h(`span.bw-art-corner.bw-${c}`, { style: { background: toneOf(b).bg } })),
      h(
        "div.bw-art-frame-body",
        null,
        tag && h("span.bw-art-frame-tag", null, tag),
        title(b),
        author(b, ".bw-art-frame-author"),
      ),
    );

  return h(
    "div.bw-art.bw-art-classic",
    null,
    h("div", null, h("div.bw-art-rule"), tag && h("span.bw-art-classic-tag", null, tag), title(b)),
    author(b),
  );
}

/** Hinge crease and a raking light: what turns a rectangle into a cover. */
const finish = (back = false) => [h(`span.bw-hinge${back ? ".bw-hinge-back" : ""}`), h("span.bw-rake")];

function cover(d: Shelfed, b: Book, size: CoverSize): HTMLElement {
  const el = h("div.bw-cover", { style: { background: toneOf(b).bg, color: inkOf(b) } });
  const url = coverUrl(d, b, size);
  if (url) {
    const img = h("img.bw-cover-img", { src: url, alt: "", draggable: "false", decoding: "async" });
    img.addEventListener("error", () => img.replaceWith(art(b)), { once: true });
    el.append(img);
  } else el.append(art(b));
  el.append(...finish(), h("span.lib-sheen", { "aria-hidden": "true" }));
  return el;
}

/**
 * The box, built in CSS 3D: every face is a flat div placed in space with a
 * translate3d + rotate inside a `preserve-3d` container, and
 * `backface-visibility: hidden` drops any face turned away from the viewer.
 *
 * Two models. On the wall (`back` absent) a book is only ever seen from the
 * front, so it draws three faces (cover, spine, fore-edge) and paints the
 * boards' edges onto the fore-edge as two stripes: Chrome re-layerizes the
 * wall's 3D context every frame it moves, at a cost proportional to its
 * planes. Open in the reader, where it can be turned any way, it is a real
 * book: two boards with thickness (outer face, inner endpaper, three cut edges
 * each), a text block inset by the square, and a spine wrapping the full depth
 * with its own cut ends. Sixteen faces, for one book.
 */
export function bookBox(
  d: Shelfed,
  b: Book,
  opts: { back?: HTMLElement; overlay?: HTMLElement; size?: "sm" | "lg" } = {},
): HTMLElement {
  const tone = toneOf(b);
  const shape = d.covers[b.id];
  const sampled = shape?.spine;
  const spine = sampled ?? tone.bg;
  // The spine is the sampled colour at 82% over black.
  const spineInk = sampled ? inkFor(sampled, 0.82) : inkOf(b);
  const build = buildOf(b);
  const hard = b.binding === "Hardcover";
  // Cloth boards read as a darker spine colour; a paperback's card edge is
  // mostly white stock with the print showing through.
  const edge = hard
    ? `color-mix(in oklab, ${spine} 70%, black)`
    : `color-mix(in oklab, ${spine} 45%, var(--_paper))`;
  const endpaper = hard ? `color-mix(in oklab, var(--_paper) 80%, ${spine})` : "var(--_paper)";
  const solid = opts.back !== undefined;

  const box = h(`div.book${solid ? ".book-solid" : ""}`, {
    style: {
      "--t": thickness(b),
      "--board": build.board,
      "--square": build.square,
      "--edge": edge,
      "--endpaper": endpaper,
    },
  });

  const front = h("div.book-face.book-front", null, cover(d, b, opts.size ?? "sm"), opts.overlay);
  const spineFace = h(
    "div.book-face.book-spine",
    { style: { background: `color-mix(in oklab, ${spine} 82%, black)`, color: spineInk } },
    h("span.bw-spine-title", null, b.title),
  );
  box.append(front, spineFace);

  if (!solid) {
    box.append(h("div.book-face.book-pages"));
    return box;
  }

  // The back takes the front's colour, Spotify-style: the cover itself,
  // blurred to a wash, pulled toward its dominant colour so the notes read.
  const tint = shape?.tint;
  const wash = coverUrl(d, b, "back");
  const back = h("div.book-face.book-back", {
    style: { background: tint ?? tone.bg, color: backInkOf(d, b) },
  });
  if (wash && tint) {
    const img = h("img.bw-back-img", { src: wash, alt: "", "aria-hidden": "true", draggable: "false", decoding: "async" });
    img.addEventListener("error", () => img.remove(), { once: true });
    back.append(
      img,
      // The tint over the wash, strongest at the top where the text sits.
      h("span.bw-back-tint", {
        style: {
          background: `linear-gradient(170deg, color-mix(in srgb, ${tint} 62%, transparent), color-mix(in srgb, ${tint} 34%, transparent))`,
        },
      }),
    );
  }
  back.append(opts.back!, ...finish(true), h("span.lib-sheen.lib-sheen-back", { "aria-hidden": "true" }));

  box.append(
    back,
    // The boards' inner faces (endpapers), seen in the overhang.
    h("div.book-face.s-inner-front"),
    h("div.book-face.s-inner-back"),
    // Each board's cut edges: fore-edge, head, tail.
    ...["s-fore", "s-head", "s-tail"].flatMap((e) => [
      h(`div.book-face.s-edge.${e}.s-at-front`),
      h(`div.book-face.s-edge.${e}.s-at-back`),
    ]),
    // The spine's cut ends, closing the corners at head and tail.
    h("div.book-face.s-spine-head"),
    h("div.book-face.s-spine-tail"),
    // The text block, set back from the boards by the square.
    h("div.book-face.s-pages-fore"),
    h("div.book-face.s-pages-head"),
    h("div.book-face.s-pages-tail"),
  );
  return box;
}

/**
 * Five marks, filled up to the rating (fractions fill part of one). Squares by
 * default; `shape` is --bw-rating-shape as the page set it: "star", or a
 * mask image (url(…)).
 */
export function rating(value: number, label: string, shape = ""): HTMLElement {
  const el = h(
    `span.bw-rating${shape ? ".bw-rating-shaped" : ""}`,
    { role: "img", "aria-label": label, part: "rating" },
    ...[1, 2, 3, 4, 5].map((n) =>
      h(
        "span.bw-rating-box",
        { part: "rating-box" },
        h("span", { style: { width: `${Math.max(0, Math.min(1, value - n + 1)) * 100}%` } }),
      ),
    ),
  );
  if (shape) el.style.setProperty("--_rating-mask", shape === "star" ? STAR : shape);
  return el;
}

/** The built-in shape for --bw-rating-shape: star. */
export const STAR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 1.8l3.1 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.6l-6.4 3.6 1.5-7.1L1.7 9.2l7.2-.8z'/%3E%3C/svg%3E")`;

// EAN-13, the barcode printed on every book: an ISBN-13 *is* an EAN-13, so
// this one scans. Left half alternates L/G codes by the first digit's parity
// pattern, right half is R codes, with guard bars at both ends and the middle.
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function eanBits(isbn: string): string | null {
  const dg = isbn.replace(/\D/g, "");
  if (dg.length !== 13) return null;
  const n = [...dg].map(Number);
  return (
    "101" +
    n.slice(1, 7).map((x, i) => (PARITY[n[0]!]![i] === "L" ? L : G)[x]).join("") +
    "01010" +
    n.slice(7).map((x) => R[x]).join("") +
    "101"
  );
}

export function barcode(isbn: string): HTMLElement | null {
  const bits = eanBits(isbn);
  if (!bits) return null;
  const svg = s("svg", { viewBox: "0 0 95 34", class: "bw-barcode-bars", "shape-rendering": "crispEdges" });
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] !== "1") continue;
    let j = i;
    while (bits[j + 1] === "1") j++;
    svg.append(s("rect", { x: i, y: 0, width: j - i + 1, height: 34, fill: "currentColor" }));
    i = j;
  }
  return h("span.bw-barcode", { "aria-hidden": "true" }, svg, h("span.bw-barcode-digits", null, isbn.replace(/\D/g, "")));
}

export { hash };
