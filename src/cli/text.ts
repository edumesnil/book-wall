const stripMarks = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** "L'Assassin royal : Première époque" → "l-assassin-royal-premiere-epoque". */
export const slug = (s: string) =>
  stripMarks(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Loose comparison key: case, accents and punctuation ignored. */
export const looseKey = (s: string) =>
  stripMarks(s)
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Leading articles a series name is spelled with or without.
const ARTICLE = /^(the|an?|les?|la|une?|der|die|das|el|los|las)\b/;

/** A series' key: `looseKey` with a leading article dropped too. */
export const seriesKey = (s: string) => {
  const k = stripMarks(s)
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .trim();
  const bare = k.replace(/^l'\s*/, "").replace(ARTICLE, "");
  return looseKey(bare || k);
};

export const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

export interface TitleParts {
  title: string;
  series?: string;
  volume?: number;
}

/**
 * Goodreads writes "Title (Series, #3)". The series goes on the cover as its
 * own line; books of one series share a design, like a real edition.
 */
export function splitTitle(raw: string): TitleParts {
  const t = collapse(raw);
  const m = /^(.*?)\s*\(([^()]+?),?\s*#(\d+(?:\.\d+)?)\)$/.exec(t);
  let title = m ? m[1]! : t;
  const series = m ? m[2]!.trim() : undefined;
  // Omnibus editions: "L'Assassin royal : Première époque, 2".
  const omni = /^(.+?)\s?:\s(.+,\s\d+)$/.exec(title);
  if (!m && omni) return { title: omni[2]!, series: omni[1]!.trim() };
  // Long subtitles ("Patterns for Creating Winning Websites") and genre tags
  // ("A Thriller") stay off the cover; short ones ("The Final Empire") are
  // part of the title.
  const sub = /^(.+?):\s+(.+)$/.exec(title);
  if (sub && (sub[2]!.length >= 22 || /^(an?|une?) /i.test(sub[2]!))) title = sub[1]!;
  if (!title) title = t;
  title = title[0]!.toUpperCase() + title.slice(1);
  return { title, ...(series && { series }), ...(m && { volume: Number(m[3]) }) };
}

/** ISBN-10 → ISBN-13 (978 prefix, new check digit). */
export function isbn13(raw: string): string | undefined {
  const s = raw.replace(/[^0-9X]/gi, "").toUpperCase();
  if (/^\d{13}$/.test(s)) return s;
  if (!/^\d{9}[\dX]$/.test(s)) return undefined;
  const body = "978" + s.slice(0, 9);
  const sum = [...body].reduce((n, d, i) => n + Number(d) * (i % 2 ? 3 : 1), 0);
  return body + ((10 - (sum % 10)) % 10);
}

/** Edit distance, for near-miss series names. */
export function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length]!;
}
