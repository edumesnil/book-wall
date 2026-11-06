# book-wall

Your Goodreads library as a wall of 3D books that never ends. Visitors pan along the shelves, take a book down, turn it over in their hands and read your notes on the back.

See it live on [ericdumesnil.com/library](https://ericdumesnil.com/library/), the page book-wall came out of.

There are two parts. A CLI reads your Goodreads export, writes a `books.json` and downloads a cover for each book, once, on your machine. A custom element, `<book-wall>`, draws the wall from those files. It has no framework and no runtime dependency, and it never calls a third-party service while someone browses.

## Quick start

**1. Export your library from Goodreads.** Go to My Books, then Import and export, then Export library. Goodreads gives you `goodreads_library_export.csv`.

**2. Run the CLI** in your site's folder.

```sh
npx book-wall import goodreads_library_export.csv --out public/books.json
npx book-wall covers --books public/books.json
```

The first command writes `public/books.json`. The second downloads the covers into `public/covers/`. It waits 3 seconds between requests to Apple, and a book can take a few requests, so 200 books take somewhere between 10 and 30 minutes.

**3. Put the element on a page.**

```html
<script type="module">
  import "book-wall";
</script>

<book-wall src="/books.json" covers="/covers/" heading="Library"></book-wall>
```

Install it with `npm install book-wall`. On a page without a bundler, load the file `book-wall.iife.js` from the package with a regular `<script>` tag instead. The element is 100svh tall by default. For a wall that fills the page, add this CSS.

```css
html,
body {
  overscroll-behavior: none; /* or a sideways swipe goes back a page in Chrome */
}
book-wall {
  position: fixed;
  inset: 0;
  height: auto;
}
```

When you've read more, export again and run both commands again. The import keeps everything you wrote by hand.

## Your data

`books.json` is a file you're meant to edit. [docs/format.md](docs/format.md) describes every field, and [`schema/books.v1.json`](schema/books.v1.json) lets your editor check the file as you type.

The import matches books on their Goodreads id. It refreshes what Goodreads knows (title, author, series, dates, rating, pages, ISBN, binding) and leaves the rest alone. That covers the `quote` printed on the back, your `note` in one language or several, a cover colour, and any field you invent.

When Goodreads gets something wrong, don't fix the field itself, because the next import would put it back. Write the correction under `override` instead.

```json
{
  "id": "walden",
  "title": "Walden; or, Life in the Woods",
  "override": { "title": "Walden" }
}
```

A `null` value removes a field. `"hidden": true` takes a book off the wall, which helps when an omnibus duplicates volumes you also logged one by one. `"coverTitle"` searches covers under another edition's title.

### Aliases

Goodreads puts the series inside the title, as in `The Salt Orchard (Lanternfall, #1)`, and it doesn't always spell the series the same way twice. That matters on the wall, where a series stands together in volume order and shares one cover design. Spelled two ways, it splits in two.

You usually don't have to do anything about it. The import merges names that differ only by case, accents, punctuation or a leading article such as "The" or "Le". `The Lanternfall` and `Lanternfall` end up as one series, under the spelling most of its books use. Authors get the same treatment, so `J.R.R. Tolkien` and `J. R. R. Tolkien` become one person.

Aliases cover what no program can guess, which is the name you prefer. Say you want Liu Cixin's trilogy shelved as *The Three-Body Problem* instead of Goodreads' *Remembrance of Earth's Past*, with his name in Chinese order.

```json
"aliases": {
  "series": { "remembrance of earth's past": "The Three-Body Problem" },
  "authors": { "Cixin Liu": "Liu Cixin" }
}
```

On the left goes the name as Goodreads writes it. Case and punctuation don't matter there, so one entry covers every spelling. On the right goes the name you want printed. The import applies aliases every time, so next year's volume lands in the right series on its own.

If two series look alike but differ too much to merge safely, the import asks you.

```
"Starward Saga" and "Starward" look like the same series. If they are, add an alias in books.json.
```

An alias renames a series or an author everywhere, now and in every future import. An override changes one book.

## Covers

`book-wall covers` searches Apple Books first, because it serves the publisher's original artwork at up to 2000 pixels, and falls back to Open Library. It accepts a result only when the title and author match. Apple once answered the ISBN of *Project Hail Mary* with Amanda Gorman's *The Hill We Climb*, so the ISBN alone isn't trusted.

It saves three files per book: 720 pixels wide for the open book, 320 for the wall, and a tiny blurred copy for the back cover. `covers/covers.json` records each cover's proportions, a spine colour, and the tint and ink of the back, so the wall can draw a book before its image arrives.

- If the search picks the wrong cover, put the right image's URL in the book's `cover` field, or a path to a file on your disk. Then rerun the command with that book's id, for example `npx book-wall covers walden --books public/books.json`.
- A book without a cover gets a typographic one, with a colour and a layout chosen from its title. Every book in a series gets the same design.
- `--pinned` only processes books whose `cover` you set, and never searches.
- `--force` downloads everything again. A plain rerun downloads only what's missing, and recomputes the colours of every cover.

You download the covers, from your own machine, for your own site. book-wall doesn't host covers or serve them to anyone, and checking that you may show them is up to you.

## The element

```html
<book-wall src="/books.json" covers="/covers/" heading="Library" lang="fr" theme="dark"></book-wall>
```

| Attribute | What it does |
| --- | --- |
| `src` | Where your `books.json` is. |
| `covers` | The covers folder, ending in `/`. Leave it out and every book gets a typographic cover. |
| `heading` | The title in the top corner, in frosted glass. No title if you leave it out. |
| `lang` | The language of the labels and of your notes, when a note has several (`{ "en": "…", "fr": "…" }`). It defaults to the page's `lang`. Labels come in English and French. |
| `theme` | `light` or `dark`. It defaults to the visitor's system setting. |
| `focus` | How a book focused with the keyboard is marked. `ring` (the default) draws a rounded outline around it, `frame` a hairline on its edge, `handles` the hairline with the eight squares of a selection in a design tool. Restyle the ring with `--bw-focus-color`, `--bw-focus-width`, `--bw-focus-offset` and `--bw-focus-radius`, or any style with `::part(focus)`. |

In JavaScript, `library` and `coverData` take the two JSON objects directly, without a fetch, and `labels` replaces any built-in label.

```js
const wall = document.querySelector("book-wall");
wall.labels = { reading: "On my nightstand", hint: "Drag to browse" };
wall.addEventListener("book-wall:open", (e) => console.log(e.detail.book.title));
```

The element fires `book-wall:open` and `book-wall:close` with the book in `event.detail`.

Visitors browse by dragging with the mouse or scrolling, with the momentum of their trackpad or touchscreen. From the keyboard, Tab lands on one book and the arrow keys move to the next one, on the same shelf or the one above or below, with the wall following. Tab again leaves the wall. A click, Enter or Space opens a book. Dragging the open book turns it any way you like, and the Flip button or the `F` key shows the back. `←` and `→` move to the next book on the shelf, and `Esc` puts it back. With reduced motion turned on, books fade in and out instead of flying.

### Theming

Every colour and font is a CSS custom property. Set them on the element or on any parent, `:root` included.

```css
:root {
  --bw-canvas: #15140f; /* the wall */
  --bw-fg: #ece6da; /* text */
  --bw-accent: #c2a878; /* links and focus */
  --bw-font-display: "Instrument Serif", serif; /* title, typographic covers, quotes */
  --bw-font-body: "IBM Plex Mono", monospace; /* everything else */
  --bw-display-weight: 400; /* for a display face that has one weight */
  --bw-rating-shape: star; /* stars instead of squares, or url() of an SVG */
  --bw-cursor: none; /* if your page draws its own cursor */
}
book-wall[data-theme="light"] {
  --bw-canvas: #f4efe4;
}
```

The element ships with no fonts, so it uses yours. The full list of properties, with the shelf colours, the nine cover tones, paper, inks, motion curves and each cursor on its own, sits at the top of [`src/wall/wall.css`](src/wall/wall.css). For anything the properties don't reach, style these parts with `::part()`: `wall`, `header`, `heading`, `footer`, `reader`, `rating`, `rating-box`, `focus`.

### Why it stays smooth

A 3D wall is easy to make slow. These choices keep panning at 60 frames a second.

- The camera is a native scroll position. The browser's compositor moves the wall, and trackpads keep their own momentum.
- Only the books in view exist in the page. New ones mount a few at a time, between frames.
- A book on the wall has three faces, cover, spine and page edges, because nobody sees the back of a book standing on a shelf. The open book is a full object with 16 faces.
- Shadows are gradients. Nothing on the wall uses `filter` or `backdrop-filter`.

## Demo

```sh
npm install
npm run dev
```

The demo shelves public-domain classics. [demo/CREDITS.md](demo/CREDITS.md) lists where each image and font comes from, with its licence. To try the demo on your own library without committing it, copy your `books.json` and `covers/` into `demo/public/local/`, which git ignores, and open the page with `?local`. The page also reads `?theme=light`, `?lang=fr` and `?focus=frame` or `?focus=handles`.

## Development

```sh
npm install
npm test            # the CLI and the importer, against a made-up Goodreads export
npm run typecheck
npm run build       # dist/cli for the CLI, dist/book-wall.js and .iife.js for the element
```

You need Node 22 or later. Each import source is one file in `src/cli/importers/`. Goodreads is the only one so far, and a StoryGraph or Hardcover importer would write the same `books.json`.

## Licence

The code is MIT. The demo's images and fonts keep their own licences, listed in [demo/CREDITS.md](demo/CREDITS.md).
