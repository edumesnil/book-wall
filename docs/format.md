# books.json, version 1

`book-wall import` writes this file, `<book-wall>` reads it, and you can edit it by hand. Its JSON Schema is [`schema/books.v1.json`](../schema/books.v1.json). The `$schema` line at the top of the file lets most editors check your edits as you type.

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

## Importing again

Run `book-wall import` whenever you've read more. The import finds each book by its Goodreads id, then:

- refreshes the fields Goodreads knows about, which are `title`, `author`, `series`, `volume`, `status`, `read`, `rating`, `pages`, `isbn` and `binding`;
- keeps every other field as you left it, including `quote`, `note`, `tone`, `layout`, `cover`, `override` and any field you made up;
- never changes a book's `id` once it has one, even if the title changes, so its cover files keep their names;
- leaves alone the books you added by hand, the ones without a `goodreads` id;
- removes a book that left your read shelves on Goodreads, and prints its title so you notice.

If Goodreads gets something wrong, editing the field won't last, because the next import puts the old value back. Write the correction under `override`.

## Fields

A book needs an `id`, a `title` and an `author`. Everything else is optional.

| Field | What it does |
| --- | --- |
| `id` | A short name made from the title on the first import. The cover files use it. |
| `goodreads` | The book's id on Goodreads. The import matches books on it. |
| `title`, `author` | Printed on the cover and the spine. |
| `read` | The date you read it, as `YYYY-MM-DD`, `YYYY-MM` or `YYYY`. The wall puts the most recent first. |
| `status` | `"reading"` puts the book on the nightstand, the first shelf. |
| `series`, `volume` | Books of a series stand together, in volume order, and share one cover design. |
| `pages` | How thick the book is. |
| `rating` | From 0 to 5. Fractions work. |
| `isbn` | The ISBN-13. It prints a barcode on the back that a scanner can read, and helps find the cover. |
| `binding` | The format, as Goodreads names it. `Hardcover` gets thick boards that stick out past the pages. Anything else is built as a paperback, with a thin cover cut flush. |
| `cover` | A cover you chose, for `book-wall covers` to use: an image URL, or the path to a file, relative to `books.json`. |
| `tone` | The colour of the typographic cover, for a book without an image. One of `bone`, `sage`, `moss`, `clay`, `ochre`, `ink`, `oxblood`, `slate`, `mist`. Chosen from the title if you don't set it. |
| `layout` | The typographic cover's layout, `classic`, `band` or `frame`. Chosen from the title if you don't set it. |
| `quote` | One line, printed large on the back. |
| `note` | The text on the back. Either a string, or one string per language, as in `{ "en": "…", "fr": "…" }`. |

## override

The wall lays everything under `override` over the book's own fields.

```json
"override": {
  "binding": "Paperback",
  "series": null,
  "hidden": true,
  "coverTitle": "The Three-Body Problem"
}
```

- A value replaces the field. `"binding": "Paperback"` turns a hardcover into a paperback.
- `null` removes the field. `"series": null` takes the book out of its series.
- `"hidden": true` takes the book off the wall without deleting it.
- `"coverTitle"` searches covers under another title. Use it when the edition you read has no good cover and another one does, such as a translation of a novel with a well-known original. The search ignores the ISBN in that case.

Hiding is the usual fix for an omnibus that repeats books you also logged one at a time. Hide the omnibus, or hide the single volumes.

## aliases

Goodreads puts the series inside the title, as in `The Salt Orchard (Lanternfall, #1)`, and it doesn't always spell the series the same way twice. A series spelled two ways becomes two series on the wall, with two cover designs, in two places.

You usually don't have to do anything about it. The import merges names that differ only by case, accents, punctuation or a leading article. `The Lanternfall` and `Lanternfall` become one series, and so do `L'Assassin royal` and `Assassin Royal`. The merged series takes the spelling most of its books use. Authors get the same treatment, so `J.R.R. Tolkien` and `J. R. R. Tolkien` become one person.

Aliases are for the names you prefer, which no program can guess. Say you want Liu Cixin's trilogy shelved as *The Three-Body Problem* instead of Goodreads' *Remembrance of Earth's Past*, and his name written *Liu Cixin*. Write it once.

```json
"aliases": {
  "series": { "remembrance of earth's past": "The Three-Body Problem" },
  "authors": { "Cixin Liu": "Liu Cixin" }
}
```

- On the left goes the name as Goodreads writes it. The match ignores case and punctuation, so one entry covers every spelling.
- On the right goes the name the wall prints.
- The import applies aliases every time, so a volume you read next year joins the right series without another edit.

Sometimes two series look alike but differ too much to merge safely. The import tells you instead of guessing.

```
"Starward Saga" and "Starward" look like the same series. If they are, add an alias in books.json.
```

If they are the same series, send both to the name you want.

```json
"series": { "starward saga": "Starward", "starward": "Starward" }
```

An alias renames a series or an author in every book, now and in every future import. An override changes one book. To take a single volume out of its series, use `"override": { "series": null }`. To rename the series, use an alias.

## covers/covers.json

`book-wall covers` writes this file next to the images, with one entry per book id.

```json
{ "the-salt-orchard": { "w": 1400, "h": 2100, "source": "apple", "spine": "#606745", "tint": "#c7d42b", "backInk": "dark" } }
```

- `w` and `h` are the size of the original image. The wall uses them to give the book the right shape before the image loads.
- `spine` is a colour sampled from the cover's left edge.
- `tint` is the colour the cover reads as. It colours the back.
- `backInk` is `dark` or `light`, whichever is easier to read on the back.

Rerunning `book-wall covers` recomputes `spine`, `tint` and `backInk` for every book, without downloading anything again.

Each book with a cover has three images. `<id>.webp` is 720 pixels wide, for the open book. `<id>.sm.webp` is 320 pixels, for the wall. `<id>.back.webp` is 48 pixels and already blurred, for the back.

## Older files

A `books.json` from before the format had a version number is a plain list of books. book-wall still reads it, and the next import rewrites it as version 1.
