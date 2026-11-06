import "book-wall";

const wall = document.querySelector("book-wall")!;
const root = document.documentElement;
const q = new URLSearchParams(location.search);

// ?local reads demo/public/local/ (gitignored): your own books.json and
// covers/, to try the wall on your library without committing it.
if (q.has("local")) {
  wall.setAttribute("src", "./local/books.json");
  wall.setAttribute("covers", "./local/covers/");
}
const focus = q.get("focus");
if (focus) wall.setAttribute("focus", focus);

// The demo pins the theme and the language from its own buttons; a site
// that doesn't set them gets the visitor's system theme and the page's lang.
let theme = q.get("theme") ?? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
let lang = q.get("lang") ?? (navigator.language.startsWith("fr") ? "fr" : "en");
const themeBtn = document.querySelector<HTMLButtonElement>('[data-toggle="theme"]')!;
const langBtn = document.querySelector<HTMLButtonElement>('[data-toggle="lang"]')!;

function apply() {
  root.dataset.theme = theme;
  wall.setAttribute("theme", theme);
  root.lang = lang;
  wall.setAttribute("lang", lang);
  wall.setAttribute("heading", lang === "fr" ? "Bibliothèque" : "Library");
  const fr = lang === "fr";
  themeBtn.textContent = theme === "dark" ? (fr ? "Clair" : "Light") : fr ? "Sombre" : "Dark";
  langBtn.textContent = fr ? "English" : "Français";
}
themeBtn.addEventListener("click", () => {
  theme = theme === "dark" ? "light" : "dark";
  apply();
});
langBtn.addEventListener("click", () => {
  lang = lang === "fr" ? "en" : "fr";
  apply();
});
apply();

const bar = document.querySelector<HTMLElement>(".demo-bar")!;
wall.addEventListener("book-wall:open", () => (bar.dataset.hidden = ""));
wall.addEventListener("book-wall:close", () => delete bar.dataset.hidden);
