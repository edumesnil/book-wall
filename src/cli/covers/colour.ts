// Pure colour maths for covers: no sharp here, so it tests on plain arrays.

export type RGB = [number, number, number];
export type HSL = [number, number, number];

export const hex = (rgb: RGB) =>
  "#" + rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("");

export function hsl(px: RGB): HSL {
  const [r, g, b] = px.map((c) => c / 255) as RGB;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

export function rgb([h, s, l]: HSL): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/**
 * The colour a cover *reads* as, not its average: the dominant colour of a
 * dark cover with red lettering is near-black, which washes the back out to
 * grey. So pixels vote by hue, weighted by how saturated and how mid-toned
 * they are; the winning hue's mean is then pulled into a range where it stays
 * rich without going neon or muddy. A cover with no real colour keeps its own
 * neutral, lifted off black.
 *
 * `data` is packed RGB (3 bytes a pixel), ideally a small thumbnail.
 */
export function vibrant(data: ArrayLike<number>): string {
  const bins = Array.from({ length: 18 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  const n = data.length / 3;
  const gray: RGB = [0, 0, 0];
  for (let i = 0; i + 2 < data.length; i += 3) {
    const px: RGB = [data[i]!, data[i + 1]!, data[i + 2]!];
    const [h, s, l] = hsl(px);
    for (let k = 0; k < 3; k++) gray[k]! += px[k]! / n;
    const w = s * s * Math.max(0, 1 - Math.abs(l - 0.5) * 1.8);
    if (w < 0.02) continue;
    const bin = bins[Math.floor(h / 20) % 18]!;
    bin.w += w;
    bin.r += px[0] * w;
    bin.g += px[1] * w;
    bin.b += px[2] * w;
  }
  const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
  if (best.w < n * 0.005) {
    const [h, s, l] = hsl(gray);
    return hex(rgb([h, Math.min(s, 0.12), Math.min(0.42, Math.max(0.26, l))]));
  }
  const [h, s, l] = hsl([best.r / best.w, best.g / best.w, best.b / best.w]);
  return hex(rgb([h, Math.min(0.85, Math.max(0.5, s)), Math.min(0.5, Math.max(0.3, l))]));
}

/** Mean colour of packed RGB pixels (the spine's hinge strip). */
export function mean(data: ArrayLike<number>): string {
  const sum: RGB = [0, 0, 0];
  const n = data.length / 3;
  for (let i = 0; i + 2 < data.length; i += 3) for (let k = 0; k < 3; k++) sum[k]! += data[i + k]!;
  return hex(sum.map((c) => c / n) as RGB);
}

/** WCAG relative luminance of an sRGB colour (0–255 channels). */
export function luminance([r, g, b]: RGB): number {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export const contrast = (a: RGB, b: RGB) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
};
export const INK_DARK: RGB = [0x1b, 0x20, 0x1c];
export const INK_LIGHT: RGB = [0xef, 0xea, 0xdb];
/** The ink that reads best on a background: whichever contrasts more. */
export const inkOn = (bg: RGB): "dark" | "light" => (contrast(bg, INK_DARK) >= contrast(bg, INK_LIGHT) ? "dark" : "light");
export const parseHex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
/** `a` over `b` at opacity `t`. */
export const over = (a: RGB, b: RGB, t: number): RGB => a.map((c, i) => c * t + b[i]! * (1 - t)) as RGB;
