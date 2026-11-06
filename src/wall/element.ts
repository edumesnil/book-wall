// <book-wall src="/books.json" covers="/covers/">
//
// Attributes
//   src       books.json (written by `book-wall import`)
//   covers    the covers folder (written by `book-wall covers`), ending in "/"
//   lang      language for labels and notes; defaults to the page's
//   theme     "light" | "dark"; defaults to the visitor's system setting
//   heading   the frosted title in the corner; none if absent
//   focus-style  how a book focused from the keyboard is marked: "ring"
//             (default), "frame" (a hairline on the cover's edge) or "handles"
//             (the frame with selection handles). Not `focus`: frameworks such
//             as React 19 set a JSX prop as a property when one exists, and
//             `focus` is HTMLElement.focus(). `focus` and `handles` still work
//             as plain HTML attributes, from 0.2 and 0.1.
//
// Styling: the --bw-* custom properties and ::part()s listed at the top of
// wall.css, set on the element or any ancestor.
//
// Properties
//   library   a books.json object, instead of `src`
//   coverData a covers.json object, instead of fetching it from `covers`
//   labels    overrides for the built-in labels (see labels.ts)
//
// Events (bubble out of the element)
//   book-wall:open   detail: { book }
//   book-wall:close  detail: { book }

import css from "./wall.css?inline";
import { prepare, type Book, type Covers, type Library, type Shelfed } from "./data.js";
import { h, s } from "./dom.js";
import { labelsFor, type Labels } from "./labels.js";
import { Reader } from "./reader.js";
import { Wall, type FocusStyle } from "./wall.js";

let sheet: CSSStyleSheet | null = null;
const styles = () => {
  if (!sheet && "replaceSync" in CSSStyleSheet.prototype) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
  }
  return sheet;
};
let uid = 0;

export class BookWall extends HTMLElement {
  static observedAttributes = ["src", "covers", "lang", "theme", "heading", "focus-style", "focus", "handles"];

  private readonly root: ShadowRoot;
  private _library: Library | null = null;
  private _covers: Covers | null = null;
  private _labels: Partial<Labels> = {};
  private data: Shelfed | null = null;
  private wall: Wall | null = null;
  private reader: Reader | null = null;
  private open: { i: number; j: number } | null = null;
  private caption: HTMLParagraphElement | null = null;
  private ro: ResizeObserver | null = null;
  private io: IntersectionObserver | null = null;
  private visible = 0;
  private scheme = matchMedia("(prefers-color-scheme: light)");
  private loadId = 0;
  private built = false;
  private preloadTimer = 0;
  private builtFor: Shelfed | null = null;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    const sh = styles();
    if (sh) this.root.adoptedStyleSheets = [sh];
    else this.root.append(h("style", null, css));
  }

  get library() {
    return this._library;
  }
  set library(v: Library | null) {
    this._library = v;
    if (this.isConnected) void this.load();
  }
  get coverData() {
    return this._covers;
  }
  set coverData(v: Covers | null) {
    this._covers = v;
    if (this.isConnected) void this.load();
  }
  get labels(): Labels {
    return labelsFor(this.lang_, this._labels);
  }
  set labels(v: Partial<Labels>) {
    this._labels = v ?? {};
    if (this.data) this.rebuild();
  }

  connectedCallback() {
    this.applyTheme();
    this.scheme.addEventListener("change", this.applyTheme);
    this.ro = new ResizeObserver(() => this.wall?.resize(this.clientWidth, this.clientHeight));
    this.ro.observe(this);
    this.io = new IntersectionObserver(([e]) => (this.visible = e?.intersectionRatio ?? 0), {
      threshold: [0, 0.5, 1],
    });
    this.io.observe(this);
    void this.load();
  }

  disconnectedCallback() {
    this.scheme.removeEventListener("change", this.applyTheme);
    this.ro?.disconnect();
    this.io?.disconnect();
    clearTimeout(this.preloadTimer);
    this.teardown();
    this.built = false;
  }

  attributeChangedCallback(name: string, prev: string | null, next: string | null) {
    if (prev === next || !this.isConnected) return;
    if (name === "theme") this.applyTheme();
    else if (name === "src" || name === "covers") void this.load();
    else if (this.data) this.rebuild();
  }

  /** Several attributes set in a row rebuild once. */
  private pending = false;
  private rebuild() {
    if (this.pending) return;
    this.pending = true;
    queueMicrotask(() => {
      this.pending = false;
      this.build();
    });
  }

  /** The language: the attribute, else the nearest `lang`, else the browser's. */
  private get lang_() {
    const own = this.getAttribute("lang") || this.closest("[lang]")?.getAttribute("lang") || navigator.language || "en";
    return own.toLowerCase();
  }

  private applyTheme = () => {
    const t = this.getAttribute("theme");
    this.dataset.theme = t === "light" || t === "dark" ? t : this.scheme.matches ? "light" : "dark";
  };

  private async load() {
    const id = ++this.loadId;
    const src = this.getAttribute("src");
    const base = this.getAttribute("covers") ?? "";
    try {
      const lib = this._library ?? (src ? await getJson(src) : null);
      if (!lib) return;
      let covers = this._covers;
      if (!covers && base) {
        const url = `${base.endsWith("/") ? base : base + "/"}covers.json`;
        covers = await fetch(url)
          .then((r) => (r.ok ? (r.json() as Promise<Covers>) : {}))
          .catch(() => ({}));
      }
      if (id !== this.loadId) return;
      this.data = prepare(lib, covers ?? {}, base);
      this.build();
    } catch (e) {
      if (id !== this.loadId) return;
      console.error("<book-wall>", e);
      this.teardown();
      this.root.replaceChildren(
        h("p.bw-empty", { role: "status" }, `Couldn't show the library. ${(e as Error).message}`),
      );
    }
  }

  private teardown() {
    this.reader?.destroy();
    this.reader = null;
    this.open = null;
    this.wall?.destroy();
    this.wall = null;
  }

  private build() {
    const d = this.data;
    if (!d) return;
    // A rebuild (new language, new heading) keeps the camera where it was.
    const cam = this.wall && this.data === this.builtFor ? { ...this.wall.cam } : null;
    this.builtFor = d;
    this.teardown();
    const l = this.labels;
    const heading = this.getAttribute("heading");
    const nodes: Node[] = [];
    if (heading) nodes.push(h("h1.bw-sr", null, heading));

    if (!d.books.length) {
      this.root.replaceChildren(...nodes, h("p.bw-empty", { role: "status" }, l.empty));
      return;
    }

    const wall = new Wall(d, {
      labels: l,
      focus: this.focusStyle,
      onOpen: (i, j) => this.openAt(i, j, 0),
      ownsKey: this.ownsKey,
      onCaption: (b) => {
        const el = this.caption;
        if (!el) return;
        if (b) el.textContent = `${b.title} — ${b.author}`;
        el.style.opacity = b ? "1" : "0";
      },
    });
    this.wall = wall;
    if (cam) wall.place(cam);
    this.caption = h("p.bw-caption", { "aria-hidden": "true" });
    nodes.push(
      wall.el,
      h(
        "div.bw-fades",
        { "aria-hidden": "true" },
        h("span.bw-fade-t"),
        h("span.bw-fade-b"),
        h("span.bw-fade-l"),
        h("span.bw-fade-r"),
      ),
    );
    if (heading) nodes.push(h("header.bw-header", { part: "header" }, frost(heading)));
    nodes.push(
      h("div.bw-foot", { part: "footer" }, h("span.bw-hint", null, l.hint), this.caption, h("span.bw-foot-end")),
    );
    this.root.replaceChildren(...nodes);
    wall.resize(this.clientWidth || innerWidth, this.clientHeight || innerHeight);
    if (!this.built) {
      this.built = true;
      this.preloadTimer = window.setTimeout(() => this.wall?.preload(), 300);
    }
  }

  /** The focus-style attribute, as a property (React and friends set this one). */
  get focusStyle(): FocusStyle {
    for (const a of ["focus-style", "focus"]) {
      const f = this.getAttribute(a);
      if (f === "ring" || f === "frame" || f === "handles") return f;
    }
    return this.hasAttribute("handles") ? "handles" : "ring";
  }
  set focusStyle(v: FocusStyle) {
    this.setAttribute("focus-style", v);
  }

  /** Arrow keys pan the wall when focus is inside it, or when it fills the view. */
  private ownsKey = (e: KeyboardEvent) => {
    if (e.composedPath().includes(this)) {
      const t = e.composedPath()[0] as HTMLElement | undefined;
      return !(t?.isContentEditable || /input|textarea|select/i.test(t?.tagName ?? ""));
    }
    const a = document.activeElement;
    return (!a || a === document.body) && this.visible >= 0.5;
  };

  private openAt(i: number, j: number, dir: 1 | -1 | 0) {
    const wall = this.wall;
    const d = this.data;
    if (!wall || !d) return;
    const first = !this.reader;
    this.open = { i, j };
    const key = `${i}:${j}`;
    const book = wall.bookAt(i, j);
    if (first) {
      wall.setOpen(true);
      this.reader = new Reader({
        data: d,
        labels: this.labels,
        lang: this.lang_,
        ratingShape: getComputedStyle(this).getPropertyValue("--bw-rating-shape").trim(),
        from: () => {
          const o = this.open;
          return o ? (wall.slot(o.i, o.j)?.querySelector(".book-front") ?? null) : null;
        },
        onStep: (dd) => this.step(dd),
        onClosed: (via) => this.closed(via),
      });
      this.root.append(this.reader.el);
      this.emit("book-wall:open", book);
    }
    wall.setHidden(key);
    this.reader!.show(book, wall.indexAt(i, j), dir);
  }

  /** Previous / next walk along the shelf, and the wall slides one book under the blur. */
  private step(dd: 1 | -1) {
    const o = this.open;
    if (!o || !this.wall) return;
    this.wall.slide(dd);
    this.openAt(o.i + dd, o.j, dd);
  }

  private closed(via: "pointer" | "keyboard") {
    const o = this.open;
    const book = o && this.wall ? this.wall.bookAt(o.i, o.j) : null;
    this.reader?.destroy();
    this.reader = null;
    this.open = null;
    this.wall?.setOpen(false);
    this.wall?.setHidden(null);
    if (o) requestAnimationFrame(() => this.restoreFocus(this.wall?.slot(o.i, o.j) ?? null, via));
    if (book) this.emit("book-wall:close", book);
  }

  /**
   * Focus goes back to the book that was open. Closed from the keyboard
   * (Esc), it shows the focus mark at once; closed with a pointer, it doesn't
   * until a key is pressed, the way browsers treat focus after a click.
   */
  private restoreFocus(slot: HTMLButtonElement | null, via: "pointer" | "keyboard") {
    if (!slot) return;
    const quiet = via === "pointer";
    if (quiet) {
      slot.dataset.quiet = "";
      const wake = () => {
        delete slot.dataset.quiet;
        slot.removeEventListener("keydown", wake);
        slot.removeEventListener("blur", wake);
      };
      slot.addEventListener("keydown", wake);
      slot.addEventListener("blur", wake);
    }
    slot.focus({ preventScroll: true, focusVisible: !quiet } as FocusOptions);
  }

  private emit(type: string, book: Book) {
    this.dispatchEvent(new CustomEvent(type, { detail: { book }, bubbles: true, composed: true }));
  }
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  const missing = `There's no file at ${url}. Check the src attribute.`;
  if (res.status === 404) throw new Error(missing);
  if (!res.ok) throw new Error(`${url} answered with an error (HTTP ${res.status}).`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // A dev server answers a missing file with its index page.
    throw new Error(text.trimStart().startsWith("<") ? missing : `${url} isn't valid JSON.`);
  }
}

/** The frosted title: see `.bw-title` in wall.css. */
function frost(text: string) {
  const id = `bw-title-clip-${++uid}`;
  const t = () => s("text", { x: 0, y: "50%", "dominant-baseline": "central" }, text);
  const shadow = t();
  shadow.setAttribute("dy", "0.06em");
  return h(
    "span.bw-title",
    { "aria-hidden": "true", part: "heading" },
    h("span.bw-title-size", null, text),
    s("svg", { class: "bw-title-shadow" }, shadow),
    s("svg", {}, s("defs", {}, s("clipPath", { id }, t()))),
    h("span.bw-title-glass", { style: { "clip-path": `url(#${id})` } }),
  );
}
