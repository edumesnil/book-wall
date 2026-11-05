/** Tiny element builder: h("div.a.b", { style, attrs… }, children…). */
type Style = Record<string, string | number | undefined>;
type Attrs = { [k: string]: string | number | boolean | undefined | null | Style; style?: Style };
type Child = Node | string | null | undefined | false;

type TagOf<S extends string> = S extends `${infer T}.${string}` ? T : S;
type El<S extends string> = TagOf<S> extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[TagOf<S>] : HTMLElement;

export function h<S extends string>(tag: S, attrs?: Attrs | null, ...children: Child[]): El<S> {
  const [name, ...classes] = tag.split(".");
  const el = document.createElement(name!) as El<S>;
  if (classes.length) el.className = classes.join(" ");
  if (attrs)
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "style" && v && typeof v === "object") {
        for (const [p, x] of Object.entries(v as Style)) if (x !== undefined) el.style.setProperty(p, String(x));
      } else if (v === true) el.setAttribute(k, "");
      else if (v !== false && v != null) el.setAttribute(k, String(v));
    }
  for (const c of children) if (c) el.append(c);
  return el;
}

const SVG = "http://www.w3.org/2000/svg";
export function s(tag: string, attrs: Record<string, string | number> = {}, ...children: (Node | string)[]) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...children);
  return el;
}
