# book-wall

Your Goodreads library as an infinite wall of 3D books. Visitors pan the wall, take a book off its shelf, turn it in their hands and flip it over to read your notes on the back.

It comes in two parts:

- a **CLI** that turns your Goodreads export into a `books.json` and fetches a cover for each book, once, on your machine;
- a **custom element**, `<book-wall>`, that renders them. It's plain TypeScript and CSS, with no framework, and it calls no third-party service while visitors browse.

> Status: pre-release. The package isn't on npm yet; build it from this repository (see [Development](#development)).

## Quick start

**1. Export your library from Goodreads.** My Books → Import and export → Export library. You get `goodreads_library_export.csv`.

**2. Run the CLI** in your site's folder:

```sh
npx book-wall import goodreads_library_export.csv --out public/books.json
npx book-wall covers --books public/books.json
```

The first command writes `public/books.json`. The second fetches the covers into `public/covers/`, next to it. Expect a few seconds per book: the cover search is rate-limited to stay polite.

**3. Add the element** to a page:

```html
<script type="module">
  import "book-wall";
</script>

<book-wall src="/books.json" covers="/covers/" heading="Library"></book-wall>
```

Without a bundler, load `dist/book-wall.iife.js` with a plain `<script>` tag instead. The element fills its box (100svh tall by default); for a full-page wall:

```css
book-wall {
  position: fixed;
  inset: 0;
  height: auto;
}
```

Add `overscroll-behavior: none` on `html` and `body` too, or a horizontal swipe on the wall navigates back in some browsers.

Read more, export again, run both commands again. Nothing you wrote by hand is lost.

## Your data: books.json

`books.json` is yours to edit. Its format is versioned and documented in [docs/format.md](docs/format.md), with a JSON Schema in [`schema/books.v1.json`](schema/books.v1.json); most editors check it as you type.

**Re-importing is safe.** Books are matched on their Goodreads id. The export refreshes what Goodreads owns (title, author, series, dates, rating, pages, ISBN, binding); everything else on an entry is kept: a `quote` for the back cover, a `note` (in one or several languages), a cover colour, and any field you add.

**Corrections go under `override`.** If Goodreads gets something wrong, don't fix the field itself, or the next import puts it back. Write the correction under `override` and it survives every import:

```json
{
  "id": "walden",
  "title": "Walden; or, Life in the Woods",
  "override": { "title": "Walden" }
}
```

`null` removes a field, `"hidden": true` takes a book off the wall (an omnibus that duplicates the volumes you logged one by one), and `"coverTitle"` searches covers by another edition's title.

### Aliases: what a series or an author is called

Goodreads writes a book's series inside its title, `The Salt Orchard (Lanternfall, #1)`, and doesn't always spell it the same way from one volume to the next. On the wall, a series stands together in volume order and shares one cover design, so a series spelled two ways would become two.

Most of the time **you don't have to do anything**: the import merges spellings that differ only by case, accents, punctuation or a leading article. `The Lanternfall` and `Lanternfall` become one series, under the spelling most of its books use; `J.R.R. Tolkien` and `J. R. R. Tolkien` become one author.

Aliases are for what no program can guess: **the names you prefer**. Say you want Liu Cixin's trilogy shelved as *The Three-Body Problem* rather than Goodreads' *Remembrance of Earth's Past*, and his name written in Chinese order:

```json
"aliases": {
  "series": { "remembrance of earth's past": "The Three-Body Problem" },
  "authors": { "Cixin Liu": "Liu Cixin" }
}
```

The key is the name as Goodreads writes it (matched loosely, so one key covers every spelling); the value is the name the wall prints. Aliases apply on every import, so next year's volume lands in the right series without another edit.

When two series look alike but aren't close enough to merge on their own, the import tells you:

```
series "Starward Saga" and "Starward" look alike: add an alias in books.json if they are one
```

**Alias or override?** An alias renames a series or an author everywhere, now and later. An override corrects one book.

## Covers

`book-wall covers` looks for each book's cover on Apple Books first (the publisher's original artwork, up to 2000 px), then Open Library. Each cover is saved three times: 720 px wide for the open book, 320 px for the wall, and a tiny pre-blurred copy that washes the back cover. Their proportions, a spine colour and the back's tint and ink go in `covers/covers.json`, so the wall knows each book's shape before an image loads.

- **The search checks what it finds.** An ISBN lookup is accepted only if the title and author match: Apple has answered one novel's ISBN with a book of poems.
- **A wrong cover:** put the right image's URL in the book's `cover` field (or a path to a local file), then rerun with that book's id: `npx book-wall covers walden --books public/books.json`.
- **No cover found:** the book gets a typographic cover, in a colour and layout picked from its title. A series shares one design.
- **Your own images only:** `--pinned` processes the books with a `cover` set and never searches.
- `--force` fetches everything again. A plain rerun only fetches what's missing, but it recomputes the colours of every cover.

The covers are fetched by you, from your machine, for your site. book-wall doesn't host or serve cover images for anyone, and the rights to display them on your site are yours to check.

## The element

```html
<book-wall src="/books.json" covers="/covers/" heading="Library" lang="fr" theme="dark"></book-wall>
```

| Attribute | |
| --- | --- |
| `src` | Your `books.json`. |
| `covers` | The covers folder, ending in `/`. Without it, every book gets a typographic cover. |
| `heading` | The title in the corner, set in frosted glass. None if absent. |
| `lang` | Language of the labels and of your notes (`note: { "en": …, "fr": … }`). Defaults to the page's `lang`. English and French labels are built in. |
| `theme` | `light` or `dark`. Defaults to the visitor's system setting. |
| `handles` | Draws selection handles on the keyboard focus frame, instead of a hairline. |

From JavaScript, `library` and `coverData` take the two JSON objects directly (no fetch), and `labels` overrides any built-in label:

```js
const wall = document.querySelector("book-wall");
wall.labels = { reading: "On my nightstand", hint: "Drag to browse" };
wall.addEventListener("book-wall:open", (e) => console.log(e.detail.book.title));
```

`book-wall:open` and `book-wall:close` bubble out of the element with the book in `detail`.

**Browsing.** Drag with the mouse or scroll (trackpad and touch have their native momentum). Arrow keys pan the wall when it has focus or fills the page. Click a book to open it; drag it to turn it any way; Flip (or `F`) turns it to the back. `←`/`→` walk along the shelf, `Esc` puts the book back. With reduced motion, books fade instead of flying.

### Theming

Every colour and font is a CSS custom property. Set them on the element or on any ancestor:

```css
:root {
  --bw-canvas: #15140f; /* the wall */
  --bw-fg: #ece6da; /* text */
  --bw-accent: #c2a878; /* links, focus */
  --bw-font-display: "Instrument Serif", serif; /* title, typographic covers, quotes */
  --bw-font-body: "IBM Plex Mono", monospace; /* everything else */
  --bw-display-weight: 400; /* for a display face with a single weight */
  --bw-rating-shape: star; /* stars instead of squares, or url(…) of an SVG mask */
}
book-wall[data-theme="light"] {
  --bw-canvas: #f4efe4;
}
```

The element ships no fonts: bring your own. The full list (shelf colours, the nine cover tones, paper, inks, motion curves) is at the top of [`src/wall/wall.css`](src/wall/wall.css). For anything else, these parts take `::part()`: `wall`, `header`, `heading`, `footer`, `reader`, `rating`, `rating-box`.

### Performance

The wall is built so that panning never drops a frame on a few hundred books:

- the camera is a native scroll position, so the compositor moves the wall and trackpads keep their momentum;
- only the books in view are in the page, and new ones are added a few at a time between frames;
- a book on the wall is three faces (cover, spine, pages), not a full box;
- shadows are gradients, never `filter`, and nothing on the wall uses `backdrop-filter`.

Only the open book is a full 3D object, with 16 faces.

## Demo

```sh
npm install
npm run dev
```

The demo is a library of public-domain classics; [demo/CREDITS.md](demo/CREDITS.md) lists every source and licence. To try it on your own library without committing it, copy your `books.json` and `covers/` into `demo/public/local/` (ignored by git) and open the demo with `?local`. `?theme=light`, `?lang=fr` and `?handles` work too.

## Development

```sh
npm install
npm test            # CLI and importer tests, on a synthetic Goodreads export
npm run typecheck
npm run build       # dist/cli (the CLI), dist/book-wall.js and .iife.js (the element)
```

Node 22 or later. The importers are pluggable: a new source (StoryGraph, Hardcover) is one file in `src/cli/importers/`, writing into the same `books.json`.

## Licence

MIT, for the code. The demo's images and fonts keep their own licences, listed in [demo/CREDITS.md](demo/CREDITS.md).
