/**
 * RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside
 * quotes, LF or CRLF line ends, a leading byte-order mark. Blank lines are
 * dropped.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = "";
  let q = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const end = () => {
    row.push(f);
    f = "";
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') {
        f += '"';
        i++;
      } else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") end();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      end();
      rows.push(row);
      row = [];
    } else f += c;
  }
  if (f || row.length) {
    end();
    rows.push(row);
  }
  return rows.filter((r) => r.some(Boolean));
}

/** Rows as objects keyed by the header. Missing trailing cells read as "". */
export function readRecords(text: string): { headers: string[]; records: Record<string, string>[] } {
  const [head = [], ...body] = parseCsv(text);
  const headers = head.map((h) => h.trim());
  return {
    headers,
    records: body.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))),
  };
}
