// The wall: an infinite grid of cells. Every row is the whole library in
// reading order, and each row starts SHIFT books further along than the one
// above, so a book never sits under itself and the pattern only comes back
// after N rows (SHIFT is coprime with N). Each shelf runs the full width.
//
// The camera is a native scroll position. Moving the wall with a transform
// made Chrome re-layerize the whole 3D scene every frame; a scroll offset is
// handled by the compositor, and trackpad and touch get their native momentum
// for free. The scroller is huge and recentres by a whole period of the wall
// when it drifts far, which shows exactly the same books. A mouse drags it by
// hand, with inertia. The wall itself never tilts: that is the open book's job.
//
// Only the cells the viewport needs are in the DOM, plus OVERSCAN columns each
// side, and the range only moves once the viewport runs out of it. New cells
// are mounted in slices of a frame budget, nearest first, so mounting books
// never blocks a frame of a pan.

import { aspectOf, lean, thickness, type Book, type Shelfed } from "./data.js";
import { bookBox } from "./book.js";
import { h } from "./dom.js";
import type { Labels } from "./labels.js";

export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const mod = (a: number, n: number) => ((a % n) + n) % n;
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

type Metrics = { bw: number; cw: number; rh: number; lh: number };
const metricsFor = (vw: number): Metrics => {
  const bw = Math.round(Math.min(150, Math.max(92, vw * 0.085)));
  return { bw, cw: bw * 1.42, rh: bw * 2.2, lh: bw * 0.42 };
};

type Range = { i0: number; i1: number; j0: number; j1: number };
const covers = (r: Range | null, n: Range) => !!r && r.i0 <= n.i0 && r.i1 >= n.i1 && r.j0 <= n.j0 && r.j1 >= n.j1;
const OVERSCAN = 1;
/** Frame budget for mounting cells, in ms. */
const BUDGET = 6;
/** A pointer held this long (ms) before release has stopped: no coast. */
export const STILL = 80;

export type Cam = { x: number; y: number };
export type FocusStyle = "ring" | "frame" | "handles";

export interface WallOptions {
  labels: Labels;
  /** How a book focused from the keyboard is marked. */
  focus: FocusStyle;
  onOpen: (i: number, j: number) => void;
  /** Should this keydown pan the wall? (Focus is in the element, or it fills the page.) */
  ownsKey: (e: KeyboardEvent) => boolean;
  onCaption: (b: Book | null) => void;
}

export class Wall {
  readonly el: HTMLDivElement;
  private readonly world: HTMLDivElement;
  private readonly space: HTMLDivElement;
  private readonly n: number;
  private readonly shift: number;
  /** The nightstand's label sits on the ledge in front of its first book. */
  private readonly opens: boolean[];
  private m: Metrics = metricsFor(1200);
  private vw = 0;
  private vh = 0;
  private origin = 400_000;
  readonly cam: Cam = { x: 0, y: 0 };
  private range: Range | null = null;
  private readonly cells = new Map<string, HTMLElement>();
  private readonly rows = new Map<number, [HTMLElement, HTMLElement]>();
  private queue: [number, number][] = [];
  private mountRaf = 0;
  private hiddenKey: string | null = null;
  /**
   * The wall's one tab stop (roving focus): the last book that had focus, or
   * the one nearest the middle. Every other book is tabindex -1, so Tab
   * leaves the wall in one press, and the arrow keys move between books.
   */
  private current: string | null = null;
  private open = false;
  private teardown: (() => void) | null = null;

  // Camera motion.
  private raf = 0;
  private lastT = 0;
  private vx = 0;
  private vy = 0;
  private drag: { x: number; y: number; moved: boolean; t: number } | null = null;
  private tween: { fx: number; fy: number; tx: number; ty: number; t0: number; ms: number } | null = null;
  private suppress = false;
  private started = false;

  constructor(
    private readonly d: Shelfed,
    private readonly o: WallOptions,
  ) {
    this.n = d.books.length;
    let sh = Math.max(1, Math.round(this.n * 0.37));
    while (gcd(sh, this.n) !== 1) sh++;
    this.shift = sh;
    this.opens = d.books.map((b, k) => k === 0 || d.shelf.get(b.id) !== d.shelf.get(d.books[k - 1]!.id));

    this.world = h("div.lib-world");
    this.space = h("div.bw-space.lib-3d", null, this.world);
    // The cursor's near-miss probes hit-test the 3D wall: a host cursor can skip them.
    this.el = h("div.bw-viewport", { part: "wall", "data-cursor-direct": "" }, this.space);
    this.bindWorld();
  }

  indexAt = (i: number, j: number) => mod(i + j * this.shift, this.n);
  bookAt = (i: number, j: number) => this.d.books[this.indexAt(i, j)]!;
  slot = (i: number, j: number) => this.cells.get(`${i}:${j}`)?.querySelector<HTMLButtonElement>(".lib-slot") ?? null;
  cellX = (i: number) => i * this.m.cw;
  cellY = (j: number) => j * this.m.rh;

  /** (Re)lays the wall out for a viewport size. Keeps the camera where it is. */
  resize(vw: number, vh: number) {
    if (vw === this.vw && vh === this.vh) return;
    const first = !this.started;
    this.vw = vw;
    this.vh = vh;
    this.m = metricsFor(vw);
    const period = Math.max(this.n * this.m.cw, this.n * this.m.rh);
    this.origin = Math.min(8_000_000, Math.max(400_000, Math.ceil(period * 2)));
    this.space.style.width = this.space.style.height = `${this.origin * 2}px`;
    Object.assign(this.world.style, { left: `${this.origin}px`, top: `${this.origin}px` });
    this.world.style.setProperty("--w", `${this.m.bw}px`);
    if (first) {
      // Arrive with the nightstand (the first books of row 0) in the middle.
      const reading = this.d.books.filter((b) => b.status === "reading").length || 1;
      this.cam.x = (reading * this.m.cw) / 2 - vw / 2;
      this.cam.y = this.m.rh / 2 - vh / 2;
      this.started = true;
    }
    for (const el of this.cells.values()) el.remove();
    for (const [a, b] of this.rows.values()) a.remove(), b.remove();
    this.cells.clear();
    this.rows.clear();
    this.range = null;
    this.current = null;
    this.queue = [];
    this.install();
  }

  /** Starts the camera here instead of on the nightstand. */
  place(cam: Cam) {
    this.cam.x = cam.x;
    this.cam.y = cam.y;
    this.started = true;
  }

  setOpen(open: boolean) {
    this.open = open;
    if (open) this.stop();
    this.el.inert = open;
    if (open) this.el.setAttribute("aria-hidden", "true");
    else this.el.removeAttribute("aria-hidden");
  }

  /** Hides the cell whose book is open in the reader (the gap it left). */
  setHidden(key: string | null) {
    if (this.hiddenKey) this.cells.get(this.hiddenKey)?.querySelector(".lib-slot")?.classList.remove("bw-hidden");
    this.hiddenKey = key;
    if (key) this.cells.get(key)?.querySelector(".lib-slot")?.classList.add("bw-hidden");
  }

  /** Where the camera is heading: the running tween's end, or where it is. */
  target = (): Cam => (this.tween ? { x: this.tween.tx, y: this.tween.ty } : { x: this.cam.x, y: this.cam.y });

  tweenTo = (x: number, y: number, ms = 320) => {
    this.vx = this.vy = 0;
    if (reduced()) return this.setScroll(x, y);
    this.tween = { fx: this.cam.x, fy: this.cam.y, tx: x, ty: y, t0: performance.now(), ms };
    this.kick();
  };

  /** One cell along, for the reader's ←/→: keeps the gap under the open book. */
  slide(d: 1 | -1) {
    const t = this.target();
    this.tweenTo(t.x + d * this.m.cw, t.y, 260);
  }

  /** Warm the wall's images once, so a column scrolling in never decodes cold. */
  preload() {
    for (const b of this.d.books) {
      if (!this.d.covers[b.id]) continue;
      const img = new Image();
      img.decoding = "async";
      img.src = `${this.d.base}${b.id}.sm.webp`;
    }
  }

  destroy() {
    this.teardown?.();
    cancelAnimationFrame(this.mountRaf);
  }

  // ─── Camera ────────────────────────────────────────────────────────────────

  private setScroll(x: number, y: number) {
    this.el.scrollLeft = this.origin + x;
    this.el.scrollTop = this.origin + y;
  }

  private stop = () => {
    this.tween = null;
    this.vx = this.vy = 0;
  };

  private kick() {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    const t = this.tween;
    if (t) {
      const p = Math.min(1, (now - t.t0) / t.ms);
      const e = 1 - Math.pow(1 - p, 4);
      this.setScroll(t.fx + (t.tx - t.fx) * e, t.fy + (t.ty - t.fy) * e);
      if (p >= 1) this.tween = null;
      this.kick();
    } else if (!this.drag && (Math.abs(this.vx) > 0.01 || Math.abs(this.vy) > 0.01)) {
      // Time-based so a 120Hz screen coasts exactly like a 60Hz one.
      const dt = Math.min(64, now - this.lastT);
      this.lastT = now;
      this.el.scrollLeft += this.vx * dt;
      this.el.scrollTop += this.vy * dt;
      const decay = Math.exp(-dt / 325);
      this.vx *= decay;
      this.vy *= decay;
      this.kick();
    }
  };

  private sync = () => {
    const c = this.cam;
    c.x = this.el.scrollLeft - this.origin;
    c.y = this.el.scrollTop - this.origin;
    const limit = this.origin / 2;
    let jumped = false;
    if (Math.abs(c.x) > limit || Math.abs(c.y) > limit) {
      jumped = true;
      const px = this.n * this.m.cw;
      const py = this.n * this.m.rh;
      // Whole periods, counted, not divided back out of pixels (cw isn't an integer).
      const nx = Math.round(c.x / px);
      const ny = Math.round(c.y / py);
      const kx = nx * px;
      const ky = ny * py;
      c.x -= kx;
      c.y -= ky;
      if (this.tween) {
        this.tween.fx -= kx;
        this.tween.tx -= kx;
        this.tween.fy -= ky;
        this.tween.ty -= ky;
      }
      this.setScroll(c.x, c.y);
      this.shiftFocused(nx * this.n, ny * this.n);
    }
    const m = this.m;
    // The cells the viewport needs (one row extra above: the 3D lean shows it).
    const need: Range = {
      i0: Math.floor(c.x / m.cw) - 1,
      i1: Math.ceil((c.x + this.vw) / m.cw),
      j0: Math.floor(c.y / m.rh) - 1,
      j1: Math.ceil((c.y + this.vh) / m.rh),
    };
    if (!covers(this.range, need)) {
      // A recentre jumps a whole period: every cell is new, so mount them
      // at once rather than over several frames of empty shelves.
      this.render({ ...need, i0: need.i0 - OVERSCAN, i1: need.i1 + OVERSCAN }, !this.range || jumped);
    }
  };

  private install() {
    this.teardown?.();
    const vp = this.el;
    // Touch scrolls natively; only a mouse needs dragging by hand.
    const onDown = (e: PointerEvent) => {
      if (this.open || e.button !== 0 || e.pointerType !== "mouse") return;
      this.stop();
      this.drag = { x: e.clientX, y: e.clientY, moved: false, t: e.timeStamp };
    };
    const onMove = (e: PointerEvent) => {
      const d = this.drag;
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 5) return;
      if (!d.moved) {
        d.moved = true;
        vp.dataset.dragging = "";
      }
      const dt = Math.max(1, e.timeStamp - d.t);
      this.vx = this.vx * 0.5 + (-dx / dt) * 0.5;
      this.vy = this.vy * 0.5 + (-dy / dt) * 0.5;
      d.x = e.clientX;
      d.y = e.clientY;
      d.t = e.timeStamp;
      vp.scrollLeft -= dx;
      vp.scrollTop -= dy;
    };
    const onUp = (e: PointerEvent) => {
      if (!this.drag) return;
      if (this.drag.moved) this.suppress = true;
      // A drag that stopped before the release doesn't coast: the speed is
      // only updated on a move, so it would still be the last move's.
      if (reduced() || e.timeStamp - this.drag.t > STILL) this.vx = this.vy = 0;
      this.drag = null;
      delete vp.dataset.dragging;
      setTimeout(() => (this.suppress = false), 0);
      this.lastT = performance.now();
      this.kick();
    };
    // A drag that ends over a book must not open it.
    const onClick = (e: MouseEvent) => {
      if (!this.suppress) return;
      e.stopPropagation();
      e.preventDefault();
      this.suppress = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (this.open || e.metaKey || e.ctrlKey || e.altKey || !this.o.ownsKey(e)) return;
      const step = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[e.key];
      if (!step) return;
      e.preventDefault();
      // On a book: focus moves to the next one (same column on the shelf above
      // or below), and the camera follows only when it nears the edge. The
      // wall is infinite, so the neighbour always exists; it is mounted first
      // if it isn't yet.
      const from = (e.composedPath()[0] as Element | undefined)?.closest?.<HTMLElement>(".lib-slot");
      if (from && this.world.contains(from)) {
        const i = Number(from.dataset.i) + step[0]!;
        const j = Number(from.dataset.j) + step[1]!;
        if (!this.cells.has(`${i}:${j}`)) this.mount(i, j);
        this.slot(i, j)?.focus({ preventScroll: true });
        return;
      }
      // Anywhere else in the wall: pan.
      const base = this.target();
      this.tweenTo(base.x + step[0]! * this.m.cw * 2, base.y + step[1]! * this.m.rh);
    };

    this.setScroll(this.cam.x, this.cam.y);
    this.sync();
    vp.addEventListener("scroll", this.sync, { passive: true });
    vp.addEventListener("wheel", this.stop, { passive: true });
    vp.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    vp.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);
    this.teardown = () => {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      vp.removeEventListener("scroll", this.sync);
      vp.removeEventListener("wheel", this.stop);
      vp.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      vp.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
    };
  }

  // ─── Cells ─────────────────────────────────────────────────────────────────

  private render(r: Range, sync: boolean) {
    this.range = r;
    const m = this.m;
    // One ledge per shelf, across everything rendered: per-book segments left
    // hairline seams between books.
    const left = `${this.cellX(r.i0)}px`;
    const width = `${(r.i1 - r.i0 + 1) * m.cw}px`;
    for (const [j, [ledge, cast]] of this.rows)
      if (j < r.j0 || j > r.j1) {
        ledge.remove();
        cast.remove();
        this.rows.delete(j);
      }
    for (let j = r.j0; j <= r.j1; j++) {
      let row = this.rows.get(j);
      if (!row) {
        const top = this.cellY(j) + m.rh - m.lh;
        row = [
          h("div.lib-ledge", { style: { top: `${top}px` } }),
          h("div.lib-ledge-cast", { "aria-hidden": "true", style: { top: `${top + 16}px` } }),
        ];
        this.world.prepend(...row);
        this.rows.set(j, row);
      }
      for (const el of row) Object.assign(el.style, { left, width });
    }
    const active = (this.el.getRootNode() as ShadowRoot | Document).activeElement;
    for (const [key, el] of this.cells) {
      const [i, j] = key.split(":").map(Number) as [number, number];
      // The focused book stays, even out of range: removing it drops focus.
      if ((i < r.i0 || i > r.i1 || j < r.j0 || j > r.j1) && !(active && el.contains(active))) {
        el.remove();
        this.cells.delete(key);
      }
    }
    const want: [number, number][] = [];
    for (let j = r.j0; j <= r.j1; j++)
      for (let i = r.i0; i <= r.i1; i++) if (!this.cells.has(`${i}:${j}`)) want.push([i, j]);
    if (sync) {
      for (const [i, j] of want) this.mount(i, j);
      this.keepTabStop();
      return;
    }
    // Nearest the middle of the viewport first.
    const cx = this.cam.x + this.vw / 2;
    const cy = this.cam.y + this.vh / 2;
    const dist = ([i, j]: [number, number]) => Math.hypot(this.cellX(i) + m.cw / 2 - cx, this.cellY(j) + m.rh / 2 - cy);
    this.queue = want.sort((a, b) => dist(a) - dist(b));
    if (!this.mountRaf) this.mountRaf = requestAnimationFrame(this.flush);
  }

  private flush = () => {
    this.mountRaf = 0;
    const end = performance.now() + BUDGET;
    const r = this.range;
    while (this.queue.length && performance.now() < end) {
      const [i, j] = this.queue.shift()!;
      if (r && i >= r.i0 && i <= r.i1 && j >= r.j0 && j <= r.j1 && !this.cells.has(`${i}:${j}`)) this.mount(i, j);
    }
    if (this.queue.length) this.mountRaf = requestAnimationFrame(this.flush);
    else this.keepTabStop();
  };

  /**
   * A recentre moves the camera by whole periods (di columns, dj rows), and
   * every other cell is remounted in the new frame. The focused cell is kept
   * mounted, so it moves with them: same book, new coordinates, focus intact.
   */
  private shiftFocused(di: number, dj: number) {
    const active = (this.el.getRootNode() as ShadowRoot | Document).activeElement;
    for (const [key, cell] of this.cells) {
      if (!active || !cell.contains(active)) continue;
      const [i, j] = key.split(":").map(Number) as [number, number];
      const ni = i - di;
      const nj = j - dj;
      const nk = `${ni}:${nj}`;
      this.cells.delete(key);
      this.cells.get(nk)?.remove();
      this.cells.set(nk, cell);
      Object.assign(cell.style, { left: `${this.cellX(ni)}px`, top: `${this.cellY(nj)}px` });
      const slot = cell.querySelector<HTMLElement>(".lib-slot")!;
      slot.dataset.i = String(ni);
      slot.dataset.j = String(nj);
      if (this.current === key) this.current = nk;
      return;
    }
  }

  /** Moves the tab stop to this book. */
  private setCurrent(key: string) {
    if (key === this.current) return;
    this.cells.get(this.current ?? "")?.querySelector(".lib-slot")?.setAttribute("tabindex", "-1");
    this.current = key;
    this.cells.get(key)?.querySelector(".lib-slot")?.setAttribute("tabindex", "0");
  }

  /** The tab stop scrolled away: the book nearest the middle takes it. */
  private keepTabStop() {
    if (this.current && this.cells.has(this.current)) return;
    const cx = this.cam.x + this.vw / 2;
    const cy = this.cam.y + this.vh / 2;
    let best: string | null = null;
    let bd = Infinity;
    for (const key of this.cells.keys()) {
      const [i, j] = key.split(":").map(Number) as [number, number];
      const dd = Math.hypot(this.cellX(i) + this.m.cw / 2 - cx, this.cellY(j) + this.m.rh / 2 - cy);
      if (dd < bd) [bd, best] = [dd, key];
    }
    if (best) this.setCurrent(best);
  }

  /** One place on the wall: a stretch of ledge, a book standing on it, maybe a label. */
  private mount(i: number, j: number) {
    const m = this.m;
    const k = this.indexAt(i, j);
    const b = this.d.books[k]!;
    const key = `${i}:${j}`;
    // Every book is the same width; its cover's proportions set the height.
    const vars: Record<string, string | number> = {
      "--lean": `${lean(b)}deg`,
      "--t": thickness(b),
      "--ar": aspectOf(this.d, b),
    };
    const overlay = h(
      "span.bw-overlay",
      null,
      h(
        `span.bw-focus.bw-focus-${this.o.focus}`,
        { part: "focus" },
        ...(this.o.focus === "handles" ? HANDLES.map((p) => h(`span.bw-handle.bw-${p}`)) : []),
      ),
      // No backdrop-filter: on a hundred books it is a hundred offscreen passes.
      h("span.bw-open-tag", null, this.o.labels.open),
    );
    const slot = h(
      `button.lib-slot.lib-3d${this.hiddenKey === key ? ".bw-hidden" : ""}`,
      {
        type: "button",
        tabindex: this.current === key ? 0 : -1,
        "aria-label": `${b.title} — ${b.author}`,
        "data-i": i,
        "data-j": j,
        style: vars,
      },
      h("span.lib-cast", { "aria-hidden": "true" }),
      h("span.lib-lean.lib-3d", null, bookBox(this.d, b, { overlay })),
    );
    const cell = h(
      "div.bw-cell.lib-3d",
      { style: { left: `${this.cellX(i)}px`, top: `${this.cellY(j)}px`, width: `${m.cw}px`, height: `${m.rh}px` } },
      h("div.bw-stand.lib-3d", { style: { bottom: `${m.lh}px` } }, slot),
    );
    // Only the nightstand is labelled: years on every shelf were noise.
    if (this.opens[k] && this.d.shelf.get(b.id) === "reading")
      cell.append(
        h(
          "span.bw-shelf-label",
          { "aria-hidden": "true", style: { top: `${m.rh - m.lh}px`, left: `${m.cw * 0.1}px` } },
          h("span.bw-shelf-label-rule"),
          this.o.labels.reading,
        ),
      );
    this.world.append(cell);
    this.cells.set(key, cell);
  }

  private bindWorld() {
    const slotOf = (t: EventTarget | null) => (t as Element | null)?.closest?.<HTMLButtonElement>(".lib-slot") ?? null;
    const at = (s: HTMLButtonElement) => [Number(s.dataset.i), Number(s.dataset.j)] as const;
    this.world.addEventListener("click", (e) => {
      const s = slotOf(e.target);
      if (s) this.o.onOpen(...at(s));
    });
    // The caption is written straight to the DOM: hovering re-renders nothing.
    this.world.addEventListener("pointerover", (e) => {
      const s = slotOf(e.target);
      if (s && s !== slotOf(e.relatedTarget)) this.o.onCaption(this.bookAt(...at(s)));
    });
    this.world.addEventListener("pointerout", (e) => {
      const s = slotOf(e.target);
      if (s && s !== slotOf(e.relatedTarget)) this.o.onCaption(null);
    });
    this.world.addEventListener("focusin", (e) => {
      const s = slotOf(e.target);
      if (!s) return;
      const [i, j] = at(s);
      this.setCurrent(`${i}:${j}`);
      this.o.onCaption(this.bookAt(i, j));
      // Tabbing onto a book near the edge brings it to the middle. Keyboard
      // focus only: a click focuses the button too, and a recentre started on
      // pointerdown slides the book out from under the pointer before the
      // click lands, so it never opens.
      if (!s.matches(":focus-visible")) return;
      const m = this.m;
      const x = this.cellX(i) + m.cw / 2 - this.cam.x;
      const y = this.cellY(j) + m.rh / 2 - this.cam.y;
      if (x < this.vw * 0.15 || x > this.vw * 0.85 || y < this.vh * 0.3 || y > this.vh * 0.85)
        this.tweenTo(this.cellX(i) + m.cw / 2 - this.vw / 2, this.cellY(j) + m.rh / 2 - this.vh * 0.55);
    });
    this.world.addEventListener("focusout", () => this.o.onCaption(null));
  }
}

const HANDLES = ["tl", "tc", "tr", "mr", "br", "bc", "bl", "ml"];
