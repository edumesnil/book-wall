import { monthOf, yearOf, type Book } from "./data.js";

export interface Labels {
  hint: string;
  reading: string;
  open: string;
  flip: string;
  flipLabel: string;
  close: string;
  read: string;
  /** "Read in March 2025": `when` is the month and year, already formatted. */
  readIn: (when: string) => string;
  rating: (n: number) => string;
  pages: (n: number) => string;
  quote: (q: string) => string;
  empty: string;
}

const EN: Labels = {
  hint: "Drag or scroll to browse",
  reading: "Reading now",
  open: "Open",
  flip: "Flip",
  flipLabel: "Drag to turn the book",
  close: "Close",
  read: "Read",
  readIn: (w) => `Read in ${w}`,
  rating: (n) => `Rated ${n} out of 5`,
  pages: (n) => `${n} pages`,
  quote: (q) => `“${q}”`,
  empty: "No books yet",
};

const FR: Labels = {
  hint: "Glissez ou défilez pour explorer",
  reading: "En cours",
  open: "Ouvrir",
  flip: "Retourner",
  flipLabel: "Glissez pour tourner le livre",
  close: "Fermer",
  read: "Lu",
  readIn: (w) => `Lu en ${w}`,
  rating: (n) => `Noté ${n} sur 5`,
  pages: (n) => `${n} pages`,
  quote: (q) => `« ${q} »`,
  empty: "Aucun livre pour l’instant",
};

export const BUILT_IN: Record<string, Labels> = { en: EN, fr: FR };

export const labelsFor = (lang: string, extra?: Partial<Labels>): Labels => ({
  ...(BUILT_IN[lang] ?? BUILT_IN[lang.split("-")[0]!] ?? EN),
  ...extra,
});

/** "Reading now", "Read in March 2025", "Read in 2025", or "Read". */
export function readOn(b: Book, lang: string, l: Labels) {
  if (b.status === "reading") return l.reading;
  const year = yearOf(b);
  if (!year) return l.read;
  const m = monthOf(b);
  const month = m ? new Intl.DateTimeFormat(lang, { month: "long" }).format(new Date(year, m - 1)) : null;
  return l.readIn(month ? `${month} ${year}` : `${year}`);
}
