// The open book. It flies from its place on the wall to the centre (a FLIP:
// measured on the wall, laid out at the centre, animated back from the
// difference), follows the pointer in 3D, and flips to its back cover, the
// notes. Closing flies it back to the gap it left.

import { barcode, bookBox, rating } from "./book.js";
import { aspectOf, lean, say, seriesLine, type Book, type Shelfed } from "./data.js";
import { h } from "./dom.js";
import { readOn, type Labels } from "./labels.js";
import { STILL, reduced } from "./wall.js";

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";
const fine = () => matchMedia("(pointer: fine)").matches;
const clamp = (v: number, m = 1) => Math.max(-m, Math.min(m, v));
const mat = (el: Element | null) => {
  const v = el ? getComputedStyle(el).transform : "none";
  return v && v !== "none" ? new DOMMatrix(v) : new DOMMatrix();
};

export interface ReaderOptions {
  data: Shelfed;
  labels: Labels;
  lang: string;
  /** --bw-rating-shape as the page set it ("" for squares). */
  ratingShape: string;
  /** The book's cover on the wall, to fly from and back to. */
  from: () => Element | null;
  onStep: (d: 1 | -1) => void;
  /** `keyboard` when Esc (or Close, from the keyboard) put the book back. */
  onClosed: (via: "pointer" | "keyboard") => void;
}

type Drag = { px: number; py: number; vx: number; vy: number; t: number; ax: number; ay: number; raf: number };

export class Reader {
  readonly el: HTMLDivElement;
  private readonly scroller: HTMLDivElement;
  private readonly backdrop: HTMLDivElement;
  private readonly closeBtn: HTMLButtonElement;
  private readonly meta: HTMLElement;
  private readonly stage: HTMLDivElement;
  private readonly floor: HTMLSpanElement;
  private readonly fly: HTMLDivElement;
  private readonly tilt: HTMLDivElement;
  private readonly swap: HTMLDivElement;
  private readonly actions: HTMLDivElement;
  private readonly flipBtn: HTMLButtonElement;
  private flipper: HTMLDivElement | null = null;

  private book: Book | null = null;
  private first = true;
  private closing = false;
  // The book's orientation is two free angles, not a face: dragging turns it
  // any way at all and it stays where it is let go (with a little coast). Only
  // the Flip button snaps, to the other face.
  private rot = { x: 0, y: 0 };
  private showingBack = false;
  private coast = 0;
  private openAnim: Animation | null = null;
  private shineUntil = 0;
  private shineRaf = 0;
  private box: DOMRect | null = null;
  private drag: Drag | null = null;
  private endDrag = () => {};
  /** Until when the pointer tilt eases back in slowly, after a drag. */
  private calm = 0;
  private cleanups: (() => void)[] = [];

  constructor(private readonly o: ReaderOptions) {
    const l = o.labels;
    this.backdrop = h("div.bw-backdrop", { "aria-hidden": "true" });
    this.closeBtn = h(
      "button.bw-close",
      { type: "button", style: { opacity: 0 } },
      `${l.close} `,
      h("span.bw-close-key", null, "Esc"),
    );
    this.meta = h("aside.bw-meta.bw-fade", { style: { opacity: 0 } });
    this.floor = h("span.bw-floor", { "aria-hidden": "true", style: { opacity: 0 } });
    this.swap = h("div.lib-3d");
    this.tilt = h("div.bw-tilt.lib-3d", { role: "img" }, this.swap);
    this.fly = h("div.bw-fly.lib-3d", null, this.tilt);
    this.stage = h("div.bw-stage", null, this.floor, this.fly);
    this.flipBtn = h("button.bw-flip", { type: "button", "aria-pressed": "false" }, l.flip);
    this.actions = h("div.bw-actions.bw-fade", { style: { opacity: 0 } }, this.flipBtn);
    const grid = h(
      "div.bw-reader-grid",
      null,
      this.meta,
      h("div.bw-center", null, this.stage, this.actions),
      h("div.bw-balance"),
    );
    this.scroller = h("div.bw-reader-scroll", null, this.backdrop, grid);
    this.el = h(
      "div.bw-reader",
      { role: "dialog", "aria-modal": "true", "aria-labelledby": "bw-reader-title", part: "reader" },
      this.scroller,
      this.closeBtn,
    );

    // A click with no pointer (Enter or Space on Close) counts as the keyboard.
    const byClick = (e: MouseEvent) => this.close(e.detail === 0 ? "keyboard" : "pointer");
    this.backdrop.addEventListener("click", byClick);
    this.closeBtn.addEventListener("click", byClick);
    this.flipBtn.addEventListener("click", this.flip);
    // The grab is on the stage, never transformed: see .bw-stage.
    this.stage.addEventListener("pointerdown", this.onGrab);
    this.listen();
  }

  /** Shows a book: the first call flies it in, later ones swap it in from the side. */
  show(book: Book, k: number, dir: number) {
    const d = this.o.data;
    this.book = book;
    this.stage.style.setProperty("--ar", String(aspectOf(d, book)));
    this.tilt.setAttribute("aria-label", `${book.title} — ${this.o.labels.flipLabel}`);
    this.renderMeta(book, k);
    const flipper = h("div.lib-flipper", null, bookBox(d, book, { back: this.back(book), size: "lg" }));
    if (this.flipper) this.flipper.replaceWith(flipper);
    else this.swap.append(flipper);
    this.flipper = flipper;

    if (this.first) {
      this.first = false;
      const t = this.offset();
      if (reduced()) this.fly.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: EASE_OUT });
      else if (t)
        this.openAnim = this.fly.animate([{ transform: t }, { transform: "none" }], { duration: 480, easing: EASE_OUT });
      this.wake();
      // A timeout, not a frame: the browser needs one frame at opacity 0 to
      // fade the backdrop from.
      const id = setTimeout(() => this.setVisible(true), 20);
      this.cleanups.push(() => clearTimeout(id));
      this.flipBtn.focus({ preventScroll: true });
    } else if (!reduced()) {
      // A keyboard step is repeated to scan: short, no fade, and a second
      // press retargets rather than flickering in from invisible.
      const dd = dir || 1;
      this.swap.getAnimations().forEach((a) => a.cancel());
      this.swap.animate([{ transform: `translateX(${dd * 24}px)` }, { transform: "none" }], {
        duration: 180,
        easing: EASE_OUT,
      });
    }
    cancelAnimationFrame(this.coast);
    this.rot = { x: 0, y: 0 };
    this.showingBack = false;
    this.flipBtn.setAttribute("aria-pressed", "false");
    this.wake();
  }

  destroy() {
    this.endDrag();
    cancelAnimationFrame(this.coast);
    // Reset as well as cancel: a stale id would make wake() believe the loop
    // is still running.
    cancelAnimationFrame(this.shineRaf);
    this.shineRaf = 0;
    for (const c of this.cleanups) c();
    this.el.remove();
  }

  // ─── Content ───────────────────────────────────────────────────────────────

  private renderMeta(b: Book, k: number) {
    const { labels: l, lang, data } = this.o;
    const n = data.books.length;
    const series = seriesLine(b);
    const parts: (Node | null)[] = [
      h("p.bw-meta-when", null, readOn(b, lang, l)),
      h("h2.bw-meta-title", { id: "bw-reader-title" }, b.title),
      h("p.bw-meta-author", null, b.author),
      series ? h("p.bw-meta-series", null, series) : null,
      b.rating
        ? h("p.bw-meta-rating", null, rating(b.rating, l.rating(b.rating), this.o.ratingShape), h("span.bw-meta-rating-n", { "aria-hidden": "true" }, `${b.rating}/5`))
        : null,
      h("p.bw-meta-count", null, `${String(k + 1).padStart(String(n).length, "0")} / ${n}`),
    ];
    this.meta.replaceChildren(...parts.filter((x): x is Node => !!x));
  }

  /** The back cover: when it was read, a line from it, and what the reader made of it. */
  private back(b: Book): HTMLElement {
    const { labels: l, lang } = this.o;
    const series = seriesLine(b);
    const note = say(b.note, lang);
    return h(
      "div.bw-back-body",
      null,
      h("div.bw-back-head", null, h("span", null, readOn(b, lang, l)), b.pages ? h("span", null, l.pages(b.pages)) : null),
      h("div.bw-back-rule"),
      series ? h("p.bw-back-series", null, series) : null,
      b.quote ? h("blockquote.bw-back-quote", null, l.quote(b.quote)) : null,
      note ? h("p.bw-back-note", null, note) : null,
      h(
        "div.bw-back-foot",
        null,
        h("div", null, b.rating ? rating(b.rating, l.rating(b.rating), this.o.ratingShape) : null, h("p.bw-back-author", null, b.author)),
        b.isbn ? barcode(b.isbn) : null,
      ),
    );
  }

  private setVisible(v: boolean) {
    const still = reduced();
    this.backdrop.classList.toggle("bw-on", v);
    for (const el of [this.closeBtn, this.floor]) el.style.opacity = v ? "1" : "0";
    this.meta.style.opacity = this.actions.style.opacity = v ? "1" : "0";
    // Reduced motion keeps the fades and drops the rise.
    this.meta.style.translate = v || still ? "0 0" : "0 8px";
    this.actions.style.translate = v || still ? "0 0" : "0 6px";
  }

  // ─── Motion ────────────────────────────────────────────────────────────────

  /** The transform that puts the centred book exactly over the one on the wall. */
  private offset() {
    const a = this.o.from()?.getBoundingClientRect();
    if (!a || !a.width || !this.book) return null;
    const b = this.fly.getBoundingClientRect();
    const dx = a.left + a.width / 2 - (b.left + b.width / 2);
    const dy = a.top + a.height / 2 - (b.top + b.height / 2);
    return `translate(${dx}px, ${dy}px) scale(${a.width / b.width}) rotateX(${lean(this.book)}deg)`;
  }

  /**
   * The sheen follows the book's real orientation. Whatever is moving it (the
   * fly-in, the pointer tilt, a drag, its coast, a flip easing over 600ms) the
   * loop reads the composed transform actually on screen (fly × tilt × flip,
   * mid-transition values included), takes where the cover's normal points,
   * and slides the band against it, like a light fixed above-left of the
   * viewer. It only runs while something moves: every mover calls wake(),
   * which keeps it alive for 900ms after the last call.
   */
  private wake = () => {
    if (reduced()) return;
    this.shineUntil = performance.now() + 900;
    if (this.shineRaf) return;
    const loop = (now: number) => {
      const f = this.flipper;
      if (f) {
        const m = mat(this.fly).multiply(mat(this.tilt)).multiply(mat(f));
        const o = m.transformPoint(new DOMPoint(0, 0, 0));
        const p = m.transformPoint(new DOMPoint(0, 0, 1));
        const len = Math.hypot(p.x - o.x, p.y - o.y, p.z - o.z) || 1;
        const nx = (p.x - o.x) / len;
        const ny = (p.y - o.y) / len;
        // During the fly-in the band also sweeps across once, landing at rest.
        const prog = this.openAnim?.effect?.getComputedTiming().progress;
        const sweep = typeof prog === "number" ? (1 - prog) * -40 : 0;
        f.style.setProperty("--sx", `${(-16 - nx * 55 + sweep).toFixed(2)}%`);
        f.style.setProperty("--sy", `${(-10 - ny * 45 + sweep * 0.6).toFixed(2)}%`);
        // The back's own x axis runs the other way (it is turned 180°).
        f.style.setProperty("--bx", `${(-16 - nx * 55).toFixed(2)}%`);
        f.style.setProperty("--by", `${(-10 + ny * 45).toFixed(2)}%`);
      }
      this.shineRaf = now < this.shineUntil ? requestAnimationFrame(loop) : 0;
    };
    this.shineRaf = requestAnimationFrame(loop);
  };

  /** Orient the book; `ms` 0 follows the pointer, anything else eases there. */
  private turn(x: number, y: number, ms = 600, easing = EASE_IN_OUT) {
    this.rot = { x, y };
    const el = this.flipper;
    if (el) {
      el.style.transition = ms && !reduced() ? `transform ${ms}ms ${easing}` : "none";
      el.style.transform = `rotateX(${x}deg) rotateY(${y}deg)`;
    }
    this.wake();
    // The back faces the viewer when the cover's normal points away:
    // rotateX(x) rotateY(y) takes (0,0,1) to a z of cos x · cos y.
    const r = Math.PI / 180;
    const back = Math.cos(x * r) * Math.cos(y * r) < 0;
    if (back !== this.showingBack) {
      this.showingBack = back;
      this.flipBtn.setAttribute("aria-pressed", String(back));
    }
  }

  /** The button's flip: square the book up and snap it to the other face. */
  private flip = () => {
    cancelAnimationFrame(this.coast);
    const { x, y } = this.rot;
    const nx = Math.round(x / 360) * 360;
    const ny = this.showingBack ? Math.round(y / 360) * 360 : Math.round((y - 180) / 360) * 360 + 180;
    this.turn(nx, ny);
  };

  close = (via: "pointer" | "keyboard" = "pointer") => {
    if (this.closing) return;
    this.closing = true;
    this.el.classList.add("bw-closing");
    this.setVisible(false);
    cancelAnimationFrame(this.coast);
    this.turn(Math.round(this.rot.x / 360) * 360, Math.round(this.rot.y / 360) * 360, 380);
    const el = this.fly;
    const done = () => this.o.onClosed(via);
    // Reduced motion: no flight back, but a fade rather than a pop.
    if (reduced()) {
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: EASE_OUT, fill: "forwards" }).finished.then(done, done);
      return;
    }
    // Start from where the book is now: if the open flight is still running,
    // capture its current transform, then cancel it so offset() measures the
    // untransformed layout box. Otherwise an Esc mid-flight snaps the book to
    // the centre before it flies back.
    const from = getComputedStyle(el).transform;
    el.getAnimations().forEach((a) => a.cancel());
    const t = this.offset();
    if (!t) return done();
    el.animate([{ transform: from }, { transform: t }], { duration: 420, easing: EASE_IN_OUT, fill: "forwards" }).finished.then(done, done);
  };

  // Drag the book to turn it any way: sideways spins it, up and down tips it,
  // half a turn per book width / height. Letting go leaves it where it is,
  // coasting briefly on the drag's speed. The move and release are listened
  // for on the window: a release outside the book (or outside the window,
  // seen as a move with no button down) must always end the drag. Pointer
  // events can arrive at 1000Hz; they only accumulate, and the book is turned
  // once per frame.
  private onGrab = (e: PointerEvent) => {
    if (e.button !== 0 || this.closing) return;
    e.preventDefault();
    cancelAnimationFrame(this.coast);
    this.endDrag();
    const d: Drag = { px: e.clientX, py: e.clientY, vx: 0, vy: 0, t: e.timeStamp, ax: 0, ay: 0, raf: 0 };
    this.drag = d;
    const apply = () => {
      d.raf = 0;
      this.turn(this.rot.x + d.ax, this.rot.y + d.ay, 0);
      d.ax = d.ay = 0;
    };
    const onMove = (ev: PointerEvent) => {
      // A release we never saw (outside the window): end without a coast,
      // the last speed is stale.
      if (ev.buttons === 0) return this.endDrag();
      const w = this.box?.width || 300;
      const hh = this.box?.height || 450;
      const dy = ((ev.clientX - d.px) / w) * 180;
      const dx = (-(ev.clientY - d.py) / hh) * 180;
      // Speed over at least 8ms (high-rate mice report every 1ms), capped so
      // a flick spins the book about a turn at most.
      const dt = Math.max(8, ev.timeStamp - d.t);
      d.vx = clamp(d.vx * 0.6 + (dx / dt) * 0.4, 0.9); // deg per ms
      d.vy = clamp(d.vy * 0.6 + (dy / dt) * 0.4, 0.9);
      d.px = ev.clientX;
      d.py = ev.clientY;
      d.t = ev.timeStamp;
      d.ax += dx;
      d.ay += dy;
      if (!d.raf) d.raf = requestAnimationFrame(apply);
    };
    const onUp = (ev: Event) => {
      if (d.raf) {
        cancelAnimationFrame(d.raf);
        apply();
      }
      this.endDrag();
      this.calm = performance.now() + 800;
      // Held still before letting go: it stays exactly where it is.
      if (reduced() || ev.timeStamp - d.t > STILL) return;
      // A short coast on the release speed, decaying by time, then it stays.
      let { vx, vy } = d;
      let last = performance.now();
      const step = (now: number) => {
        const dt = Math.min(64, now - last);
        last = now;
        const k = Math.exp(-dt / 180);
        vx *= k;
        vy *= k;
        this.turn(this.rot.x + vx * dt, this.rot.y + vy * dt, 0);
        if (Math.abs(vx) + Math.abs(vy) > 0.005) this.coast = requestAnimationFrame(step);
      };
      if (Math.abs(vx) + Math.abs(vy) > 0.02) this.coast = requestAnimationFrame(step);
    };
    this.endDrag = () => {
      if (d.raf) cancelAnimationFrame(d.raf);
      if (this.drag === d) this.drag = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onUp);
      this.endDrag = () => {};
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("blur", onUp);
  };

  private listen() {
    // The book's screen box, measured on the stage: it is never transformed,
    // so this stays valid while the book tilts and spins, and nothing reads
    // layout per pointer event (a read right after the drag wrote a transform
    // forced a style recalc every event).
    const measure = () => (this.box = this.stage.getBoundingClientRect());
    const ro = new ResizeObserver(measure);
    ro.observe(this.stage);
    window.addEventListener("resize", measure);
    this.scroller.addEventListener("scroll", measure, { passive: true });
    this.cleanups.push(() => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      this.scroller.removeEventListener("scroll", measure);
    });

    // The book follows the pointer: it tips toward it while the pointer is
    // over it, and drifts back to rest when it leaves. It shares the book with
    // the drag without competing: while a drag is on, the tilt holds exactly
    // where it was, and once it ends the tilt eases back toward the pointer
    // slowly for a moment instead of jumping to it.
    if (!reduced() && fine()) {
      let tx = 0,
        ty = 0,
        x = 0,
        y = 0,
        px = 0,
        py = 0,
        raf = 0,
        last = 0;
      const tick = (now: number) => {
        const r = this.box;
        if (!this.drag && r) {
          const nx = (px - (r.left + r.width / 2)) / (r.width / 2);
          const ny = (py - (r.top + r.height / 2)) / (r.height / 2);
          const f = Math.abs(nx) <= 1 && Math.abs(ny) <= 1 ? 1 : 0.25;
          tx = clamp(ny, 1.4) * -9 * f;
          ty = clamp(nx, 1.4) * 14 * f;
        }
        // Time-based easing, the same pace at any refresh rate.
        const tau = now < this.calm ? 420 : 110;
        const k = 1 - Math.exp(-Math.min(64, now - last) / tau);
        last = now;
        const nx = x + (tx - x) * k;
        const ny = y + (ty - y) * k;
        // Held during a drag: skip the write, or every frame restyles the book.
        if (Math.abs(nx - x) + Math.abs(ny - y) > 0.0005) {
          this.tilt.style.transform = `rotateX(${nx}deg) rotateY(${ny}deg)`;
          this.wake();
        }
        x = nx;
        y = ny;
        raf = this.drag || Math.abs(tx - x) + Math.abs(ty - y) > 0.01 ? requestAnimationFrame(tick) : 0;
      };
      const onMove = (e: PointerEvent) => {
        px = e.clientX;
        py = e.clientY;
        if (!raf) {
          last = performance.now();
          raf = requestAnimationFrame(tick);
        }
      };
      window.addEventListener("pointermove", onMove);
      this.cleanups.push(() => {
        window.removeEventListener("pointermove", onMove);
        cancelAnimationFrame(raf);
      });
    }

    const onKey = (e: KeyboardEvent) => {
      // While the book flies back, keys would swap in another book under it.
      if (this.closing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") this.close("keyboard");
      else if (e.key === "ArrowRight") this.o.onStep(1);
      else if (e.key === "ArrowLeft") this.o.onStep(-1);
      else if (e.key.toLowerCase() === "f") this.flip();
      else if (e.key === "Tab") {
        // Keep focus inside the dialog.
        const els = [...this.el.querySelectorAll<HTMLElement>("button")];
        if (!els.length) return;
        const active = (this.el.getRootNode() as ShadowRoot).activeElement as HTMLElement | null;
        const i = active ? els.indexOf(active) : -1;
        const j = e.shiftKey ? (i <= 0 ? els.length - 1 : i - 1) : (i + 1) % els.length;
        e.preventDefault();
        els[j]!.focus();
      } else return;
      if (e.key !== "Tab") e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    this.cleanups.push(() => window.removeEventListener("keydown", onKey));
  }
}
