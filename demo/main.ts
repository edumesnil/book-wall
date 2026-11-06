import "book-wall";

const wall = document.querySelector("book-wall")!;
const root = document.documentElement;

// ?local reads demo/public/local/ (gitignored): your own books.json and
// covers/, to try the wall on your library without committing it.
const local = new URLSearchParams(location.search).has("local");
const SRC = local ? "./local/books.json" : "./books.json";
const COVERS = local ? "./local/covers/" : "./covers/";
wall.setAttribute("src", SRC);

// ─── Settings ────────────────────────────────────────────────────────────────
// Each one maps to an attribute or a --bw-* property, the way a site would
// set it. Nothing is saved: a reload starts from the defaults.

type Choice = { value: string; label: string };
type Setting = { key: keyof State; label: string; choices: Choice[] };
type State = {
  theme: string;
  lang: string;
  focus: string;
  rating: string;
  covers: string;
  heading: string;
  display: string;
  body: string;
  accent: string;
};

const DEFAULTS: State = {
  theme: matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark",
  lang: navigator.language.startsWith("fr") ? "fr" : "en",
  focus: "ring",
  rating: "star",
  covers: "images",
  heading: "show",
  display: "instrument",
  body: "plex",
  accent: "",
};
let state: State = { ...DEFAULTS };

const SETTINGS: Setting[] = [
  { key: "theme", label: "Theme", choices: [{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }] },
  { key: "lang", label: "Language", choices: [{ value: "en", label: "English" }, { value: "fr", label: "Français" }] },
  {
    key: "focus",
    label: "Keyboard focus",
    choices: [
      { value: "ring", label: "Ring" },
      { value: "frame", label: "Frame" },
      { value: "handles", label: "Handles" },
    ],
  },
  { key: "rating", label: "Rating", choices: [{ value: "star", label: "Stars" }, { value: "square", label: "Squares" }] },
  {
    key: "covers",
    label: "Covers",
    choices: [{ value: "images", label: "Images" }, { value: "type", label: "Typographic" }],
  },
  { key: "heading", label: "Title", choices: [{ value: "show", label: "Show" }, { value: "hide", label: "Hide" }] },
  {
    key: "display",
    label: "Display font",
    choices: [
      { value: "instrument", label: "Instrument" },
      { value: "serif", label: "Serif" },
      { value: "sans", label: "Sans" },
    ],
  },
  {
    key: "body",
    label: "Body font",
    choices: [
      { value: "plex", label: "Plex Mono" },
      { value: "mono", label: "Mono" },
      { value: "sans", label: "Sans" },
    ],
  },
];

const FONTS: Record<string, { family: string; weight?: string }> = {
  instrument: { family: '"Instrument Serif", ui-serif, Georgia, serif', weight: "400" },
  serif: { family: 'ui-serif, "Iowan Old Style", Georgia, serif' },
  sans: { family: "ui-sans-serif, system-ui, -apple-system, sans-serif" },
  plex: { family: '"IBM Plex Mono", ui-monospace, Menlo, monospace' },
  mono: { family: "ui-monospace, SFMono-Regular, Menlo, monospace" },
};
// Accents picked to hold their contrast on both themes; "" keeps the theme's own.
const ACCENTS = ["", "#c2a878", "#7fa38f", "#8fa3c9", "#c98f8f"];

function apply() {
  const s = state;
  const fr = s.lang === "fr";
  root.dataset.theme = s.theme;
  root.lang = s.lang;
  wall.setAttribute("theme", s.theme);
  wall.setAttribute("lang", s.lang);
  wall.setAttribute("focus", s.focus);
  if (s.heading === "show") wall.setAttribute("heading", fr ? "Bibliothèque" : "Library");
  else wall.removeAttribute("heading");
  if (s.covers === "images") wall.setAttribute("covers", COVERS);
  else wall.removeAttribute("covers");
  const display = FONTS[s.display]!;
  const set = (k: string, v: string | undefined) => (v ? root.style.setProperty(k, v) : root.style.removeProperty(k));
  set("--bw-font-display", display.family);
  // "initial" rather than removing it: index.html sets 400 on :root for
  // Instrument Serif, and only this lets the element's own weights back.
  set("--bw-display-weight", display.weight ?? "initial");
  set("--bw-font-body", FONTS[s.body]!.family);
  set("--bw-rating-shape", s.rating === "star" ? "star" : "initial");
  set("--bw-accent", s.accent || undefined);
  renderCode();
}

// ─── The panel ───────────────────────────────────────────────────────────────

const panel = document.querySelector<HTMLElement>("#demo-panel")!;
const gear = document.querySelector<HTMLButtonElement>(".demo-gear")!;
const bar = document.querySelector<HTMLElement>(".demo-bar")!;
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}
let code: HTMLElement;

function build() {
  panel.replaceChildren(el("h2", { textContent: "Try the options" }));
  for (const s of SETTINGS) {
    const seg = el("div", { className: "demo-seg" });
    for (const c of s.choices) {
      const input = el("input", { type: "radio", name: s.key, value: c.value, checked: state[s.key] === c.value });
      input.addEventListener("change", () => {
        state = { ...state, [s.key]: c.value };
        apply();
      });
      seg.append(el("label", {}, input, el("span", { textContent: c.label })));
    }
    panel.append(el("fieldset", { className: "demo-row" }, el("legend", { textContent: s.label }), seg));
  }

  const swatches = el("div", { className: "demo-accent" });
  for (const a of ACCENTS) {
    const b = el("button", { type: "button", title: a || "Theme default" });
    b.setAttribute("aria-label", a ? `Accent ${a}` : "Theme default accent");
    b.setAttribute("aria-pressed", String(state.accent === a));
    // The theme's own accent, not the live --bw-accent, which a pick overrides.
    b.style.setProperty("--c", a || "var(--demo-accent-default)");
    b.addEventListener("click", () => {
      state = { ...state, accent: a };
      apply();
      for (const x of swatches.querySelectorAll("button")) x.setAttribute("aria-pressed", String(x === b));
    });
    swatches.append(b);
  }
  const pick = el("input", { type: "color", value: state.accent || "#c2a878" });
  pick.setAttribute("aria-label", "Any accent colour");
  pick.addEventListener("input", () => {
    state = { ...state, accent: pick.value };
    apply();
    for (const x of swatches.querySelectorAll("button")) x.setAttribute("aria-pressed", "false");
  });
  swatches.append(el("label", { title: "Any colour" }, pick));
  panel.append(el("div", { className: "demo-row" }, el("label", { textContent: "Accent" }), swatches));

  code = el("pre", { className: "demo-code" });
  panel.append(el("div", { className: "demo-row" }, el("label", { textContent: "On your page" }), code));

  const copy = el("button", { type: "button", textContent: "Copy" });
  copy.addEventListener("click", async () => {
    await navigator.clipboard.writeText(code.textContent ?? "");
    copy.textContent = "Copied";
    setTimeout(() => (copy.textContent = "Copy"), 1200);
  });
  const reset = el("button", { type: "button", textContent: "Reset" });
  reset.addEventListener("click", () => {
    state = { ...DEFAULTS };
    apply();
    build();
    reset.focus();
  });
  panel.append(el("div", { className: "demo-foot" }, reset, copy));
  renderCode();
}

/** The markup and CSS that give this look on a real page. */
function renderCode() {
  if (!code) return;
  const s = state;
  const attrs = [
    `src="/books.json"`,
    s.covers === "images" && `covers="/covers/"`,
    s.heading === "show" && `heading="${s.lang === "fr" ? "Bibliothèque" : "Library"}"`,
    `lang="${s.lang}"`,
    `theme="${s.theme}"`,
    s.focus !== "ring" && `focus="${s.focus}"`,
  ].filter(Boolean);
  const css = [
    `--bw-font-display: ${FONTS[s.display]!.family};`,
    FONTS[s.display]!.weight && `--bw-display-weight: ${FONTS[s.display]!.weight};`,
    `--bw-font-body: ${FONTS[s.body]!.family};`,
    s.rating === "star" && `--bw-rating-shape: star;`,
    s.accent && `--bw-accent: ${s.accent};`,
  ].filter(Boolean);
  code.textContent = `<book-wall\n  ${attrs.join("\n  ")}\n></book-wall>\n\nbook-wall {\n  ${css.join("\n  ")}\n}`;
}

function setOpen(open: boolean) {
  panel.hidden = !open;
  gear.setAttribute("aria-expanded", String(open));
  if (open) panel.querySelector<HTMLInputElement>("input:checked")?.focus();
}
const isOpen = () => !panel.hasAttribute("hidden");
gear.addEventListener("click", () => setOpen(!isOpen()));
document.addEventListener("pointerdown", (e) => {
  if (isOpen() && !panel.contains(e.target as Node) && !gear.contains(e.target as Node)) setOpen(false);
});
panel.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  setOpen(false);
  gear.focus();
});

// The reader has its own chrome: the demo's steps aside while a book is open.
wall.addEventListener("book-wall:open", () => {
  setOpen(false);
  bar.dataset.hidden = "";
});
wall.addEventListener("book-wall:close", () => delete bar.dataset.hidden);

build();
apply();
