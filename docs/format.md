# books.json, version 1

`book-wall import` writes it, `<book-wall>` reads it, and you can edit it by hand. The JSON Schema is in [`schema/books.v1.json`](../schema/books.v1.json); the `$schema` line at the top of the file lets most editors check your edits as you type.

```json
{
  "$schema": "https://unpkg.com/book-wall/schema/books.v1.json",
  "version": 1,
  "aliases": {
    "series": { "remembrance of earth's past": "The Three-Body Problem" },
    "authors": { "Cixin Liu": "Liu Cixin" }
  },
  "books": [
    {
      "id": "the-salt-orchard",
      "goodreads": "9000001",
      "title": "The Salt Orchard",
      "author": "Mara Okafor",
      "series": "Lanternfall",
      "volume": 1,
      "read": "2025-03-14",
      "rating": 5,
      "pages": 412,
      "isbn": "9780000000019",
      "binding": "Hardcover",
      "quote": "Every orchard is a clock.",
      "override": { "binding": "Paperback" }
    }
  ]
}
```

## Re-importing is safe

Run `book-wall import` again whenever you've read more. Books are matched on their Goodreads id, so:

- what Goodreads owns is refreshed: `title`, `author`, `series`, `volume`, `status`, `read`, `rating`, `pages`, `isbn`, `binding`;
- everything else on an entry is kept: `quote`, `note`, `tone`, `layout`, `cover`, `override`, and any field you add yourself;
- the `id` never changes once given, even if the title does, so cover files keep their names;
- entries without a `goodreads` id (books you added by hand) are left alone;
- a book that left your read shelves is removed, and the import lists it by title.

To correct something Goodreads gets wrong, don't edit the field itself: the next import would put it back. Put the correction under `override`.

## Fields

Only `id`, `title` and `author` are required.

| Field | What it does |
| --- | --- |
| `id` | Stable slug, made from the title on first import. Names the cover files. |
| `goodreads` | Goodreads' Book Id. What a re-import matches on. |
| `title`, `author` | Printed on the cover and the spine. |
| `read` | Date read, `YYYY-MM-DD` (or `YYYY-MM`, `YYYY`). Orders the wall, newest first. |
| `status` | `"reading"` puts the book on the nightstand, the first shelf. |
| `series`, `volume` | A series stands together on the wall, in volume order, and shares one cover design. |
| `pages` | Sets the book's thickness. |
| `rating` | 0 to 5, fractions allowed. |
| `isbn` | ISBN-13. Prints a real EAN-13 barcode on the back, and finds the cover. |
| `binding` | Goodreads' format name. A hardcover gets thick boards that stand proud of the pages, a paperback a flush card wrapper. |
| `cover` | A cover image pinned by hand, used by `book-wall covers`: a URL, or a path to a local file, relative to books.json. |
| `tone` | Colour of the typographic cover drawn when there is no image: `bone`, `sage`, `moss`, `clay`, `ochre`, `ink`, `oxblood`, `slate`, `mist`. Picked from the title if absent. |
| `layout` | Typographic cover layout: `classic`, `band`, `frame`. Picked from the title if absent. |
| `quote` | One line, set large on the back cover. |
| `note` | The back-cover text. A string, or one per language: `{ "en": "…", "fr": "…" }`. |

## `override`: corrections that survive a re-import

Anything under `override` is laid over the entry when the wall reads it.

```json
"override": {
  "binding": "Paperback",
  "series": null,
  "hidden": true,
  "coverTitle": "The Three-Body Problem"
}
```

- A value replaces the field: `"binding": "Paperback"`.
- `null` removes the field: `"series": null` takes the book out of its series.
- `"hidden": true` drops the book from the wall without deleting it.
- `"coverTitle"` searches covers by another edition's title, for when the edition you read has no good cover (a translation whose original has a real one). The ISBN is ignored for that search.

Typical use: an omnibus edition that duplicates books you also logged one by one. Hide the omnibus, or hide the volumes.

## `aliases`: what a series or an author is called

Goodreads puts a book's series inside its title, `The Salt Orchard (Lanternfall, #1)`, and doesn't always spell it the same way from one volume to the next. Spelled two ways, one series becomes two: two cover designs, two places on the wall.

**Most of the time you don't have to do anything.** The import merges spellings that differ only by case, accents, punctuation or a leading article. `The Lanternfall` and `Lanternfall`, `L'Assassin royal` and `Assassin Royal` end up as one series, under the spelling most of its books use. The same goes for authors: `J.R.R. Tolkien` and `J. R. R. Tolkien` become one name.

**Aliases are for the rest: names you prefer.** No program can guess that you want Liu Cixin's trilogy shelved as *The Three-Body Problem* rather than Goodreads' *Remembrance of Earth's Past*, or the author written *Liu Cixin* rather than *Cixin Liu*. Write it once:

```json
"aliases": {
  "series": { "remembrance of earth's past": "The Three-Body Problem" },
  "authors": { "Cixin Liu": "Liu Cixin" }
}
```

- The key is the name as Goodreads writes it, matched as loosely as above, so one key covers every spelling of it.
- The value is the name the wall prints.
- Aliases are applied on every import, so a volume you read next year lands in the right series without a second edit.

**When the import isn't sure, it asks.** If two series look alike but aren't close enough to merge on their own, the import says so:

```
series "Starward Saga" and "Starward" look alike: add an alias in books.json if they are one
```

If they are one series, map both to the name you want:

```json
"series": { "starward saga": "Starward", "starward": "Starward" }
```

**Aliases or `override`?** An alias renames a series or an author everywhere, now and on every future import. An `override` corrects one book. To pull a single volume out of a series, use `"override": { "series": null }`; to rename the series, use an alias.

## covers/covers.json

Written by `book-wall covers`, next to the images, keyed by book id:

```json
{ "the-salt-orchard": { "w": 1400, "h": 2100, "source": "apple", "spine": "#606745", "tint": "#c7d42b", "backInk": "dark" } }
```

`w` and `h` give the cover's proportions before the image loads. `spine` is sampled from the cover's hinge edge, `tint` is the colour the cover reads as (it washes the back), `backInk` the ink that reads best on that back, worked out on the wash and the tint together. Rerunning `book-wall covers` recomputes `spine`, `tint` and `backInk` for every cover without downloading anything again. Each book has three images: `<id>.webp` (720 px wide, the open book), `<id>.sm.webp` (320 px, the wall) and `<id>.back.webp` (48 px, pre-blurred, the back cover).

## Older files

A books.json written before the format had a version (a bare array of books) is still read, and becomes version 1 on the next import.
