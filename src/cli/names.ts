// Series and author names. Goodreads spells one series several ways
// ("Assassin royal", "L'Assassin royal"); books of one series must agree to
// share a cover design and stand together on the wall.
//
//  1. aliases (books.json) win: they are the owner's preferred names
//  2. otherwise spellings that differ only by case, accents, punctuation or,
//     for a series, a leading article are merged under the most common one
//  3. names that still look alike are reported, never merged

import type { Aliases, Entry } from "../core/types.js";
import { distance, looseKey, seriesKey } from "./text.js";

type Field = "series" | "author";
const KEY: Record<Field, (s: string) => string> = { series: seriesKey, author: looseKey };
const ALIAS: Record<Field, keyof Aliases> = { series: "series", author: "authors" };

/** Most frequent spelling; ties go to more capitals, then the longer one. */
function pick(counts: Map<string, number>): string {
  const caps = (s: string) => s.replace(/[^\p{Lu}]/gu, "").length;
  return [...counts].sort(
    ([a, n], [b, m]) => m - n || caps(b) - caps(a) || b.length - a.length || a.localeCompare(b),
  )[0]![0];
}

function unifyField(books: Entry[], field: Field, aliases: Aliases): void {
  const key = KEY[field];
  const alias = new Map(Object.entries(aliases[ALIAS[field]] ?? {}).map(([k, v]) => [key(k), v]));
  const spellings = new Map<string, Map<string, number>>();
  for (const b of books) {
    const v = b[field];
    if (typeof v !== "string" || !v) continue;
    const k = key(v);
    const m = spellings.get(k) ?? new Map<string, number>();
    m.set(v, (m.get(v) ?? 0) + 1);
    spellings.set(k, m);
  }
  const name = new Map([...spellings].map(([k, m]) => [k, alias.get(k) ?? pick(m)]));
  for (const b of books) {
    const v = b[field];
    if (typeof v === "string" && v) b[field] = name.get(key(v))!;
  }
}

/** Applies aliases and merges loose spellings, in place. */
export function unifyNames(books: Entry[], aliases: Aliases = {}): void {
  unifyField(books, "series", aliases);
  unifyField(books, "author", aliases);
}

/**
 * Series names that are probably one series but weren't merged: one contains
 * the other as whole words ("Expanse" / "The Expanse Series"), or they are a
 * couple of letters apart.
 */
export function nearSeries(books: Entry[]): [string, string][] {
  const names = [...new Set(books.map((b) => b.series).filter((s): s is string => !!s))];
  const out: [string, string][] = [];
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      const a = seriesKey(names[i]!);
      const b = seriesKey(names[j]!);
      const words = (x: string, y: string) => ` ${y} `.includes(` ${x} `);
      const close = Math.min(a.length, b.length) >= 6 && distance(a, b) <= 2;
      if (words(a, b) || words(b, a) || close) out.push([names[i]!, names[j]!]);
    }
  return out;
}
