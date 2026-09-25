// All processing happens in the browser — images never leave the user's machine.

/** Split positions as fractions (0..1) of the image size. */
export type Lines = {
  h: number; // horizontal line (y)
  vTop: number; // vertical line in the top row (x)
  vBottom: number; // vertical line in the bottom row (x)
};

export type Rect = { x: number; y: number; w: number; h: number };
export type RGB = [number, number, number];

export type OutputFormat = "original" | "image/png" | "image/jpeg" | "image/webp";

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = url;
  });
}

type Pixels = { data: Uint8ClampedArray; w: number; h: number };

function readPixels(img: HTMLImageElement, maxSide: number): Pixels {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, w, h };
}

/** Background colour = per-channel median of the image border pixels. */
function estimateBackground(p: Pixels): RGB {
  const r: number[] = [], g: number[] = [], b: number[] = [];
  const push = (x: number, y: number) => {
    const i = (y * p.w + x) * 4;
    if (p.data[i + 3] < 16) {
      r.push(255); g.push(255); b.push(255);
      return;
    }
    r.push(p.data[i]); g.push(p.data[i + 1]); b.push(p.data[i + 2]);
  };
  for (let x = 0; x < p.w; x++) { push(x, 0); push(x, p.h - 1); }
  for (let y = 0; y < p.h; y++) { push(0, y); push(p.w - 1, y); }
  const med = (a: number[]) => a.sort((m, n) => m - n)[a.length >> 1];
  return [med(r), med(g), med(b)];
}

const CONTENT_THRESHOLD = 48;

function isContent(d: Uint8ClampedArray, i: number, bg: RGB) {
  if (d[i + 3] < 16) return false; // transparent counts as background
  return Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > CONTENT_THRESHOLD;
}

/** Fraction of content pixels per row (or column) inside a sub-range. */
function rowScores(p: Pixels, bg: RGB): Float32Array {
  const s = new Float32Array(p.h);
  for (let y = 0; y < p.h; y++) {
    let c = 0;
    for (let x = 0; x < p.w; x++) if (isContent(p.data, (y * p.w + x) * 4, bg)) c++;
    s[y] = c / p.w;
  }
  return s;
}

function colScores(p: Pixels, bg: RGB, y0: number, y1: number): Float32Array {
  const s = new Float32Array(p.w);
  const rows = Math.max(1, y1 - y0);
  for (let x = 0; x < p.w; x++) {
    let c = 0;
    for (let y = y0; y < y1; y++) if (isContent(p.data, (y * p.w + x) * 4, bg)) c++;
    s[x] = c / rows;
  }
  return s;
}

/** Mean colour jump between adjacent rows / columns — finds seams when tiles touch. */
function rowDiffs(p: Pixels): Float32Array {
  const s = new Float32Array(p.h);
  for (let y = 0; y < p.h - 1; y++) {
    let t = 0;
    for (let x = 0; x < p.w; x++) {
      const i = (y * p.w + x) * 4, j = i + p.w * 4;
      t += Math.abs(p.data[i] - p.data[j]) + Math.abs(p.data[i + 1] - p.data[j + 1]) + Math.abs(p.data[i + 2] - p.data[j + 2]);
    }
    s[y] = t / p.w;
  }
  return s;
}

function colDiffs(p: Pixels, y0: number, y1: number): Float32Array {
  const s = new Float32Array(p.w);
  const rows = Math.max(1, y1 - y0);
  for (let x = 0; x < p.w - 1; x++) {
    let t = 0;
    for (let y = y0; y < y1; y++) {
      const i = (y * p.w + x) * 4, j = i + 4;
      t += Math.abs(p.data[i] - p.data[j]) + Math.abs(p.data[i + 1] - p.data[j + 1]) + Math.abs(p.data[i + 2] - p.data[j + 2]);
    }
    s[x] = t / rows;
  }
  return s;
}

/**
 * Find the split position (fraction) in the middle band of the image.
 * Prefers the widest background-coloured gutter; if there is none (tiles touch),
 * falls back to the strongest seam; otherwise the exact middle.
 */
function findSplit(content: Float32Array, diffs: () => Float32Array): number {
  const n = content.length;
  const a = Math.floor(n * 0.3), b = Math.ceil(n * 0.7);
  let min = Infinity;
  for (let i = a; i < b; i++) min = Math.min(min, content[i]);

  if (min <= 0.05) {
    const tol = min + 0.01;
    let best: { len: number; center: number } | null = null;
    let start = -1;
    for (let i = a; i <= b; i++) {
      const ok = i < b && content[i] <= tol;
      if (ok && start < 0) start = i;
      if (!ok && start >= 0) {
        const len = i - start;
        const center = (start + i - 1) / 2;
        if (!best || len > best.len || (len === best.len && Math.abs(center - n / 2) < Math.abs(best.center - n / 2))) {
          best = { len, center };
        }
        start = -1;
      }
    }
    if (best) return (best.center + 0.5) / n;
  }

  const d = diffs();
  const lo = Math.floor(n * 0.4), hi = Math.ceil(n * 0.6);
  const band = Array.from(d.slice(lo, hi)).sort((x, y) => x - y);
  const median = band[band.length >> 1] || 0;
  let arg = -1, max = 0;
  for (let i = lo; i < hi; i++) if (d[i] > max) { max = d[i]; arg = i; }
  if (arg >= 0 && max > median * 2.5 && max > 8) return (arg + 1) / n;
  return 0.5;
}

export function detectLines(img: HTMLImageElement): { lines: Lines; background: RGB } {
  const p = readPixels(img, 1200);
  const bg = estimateBackground(p);
  const h = findSplit(rowScores(p, bg), () => rowDiffs(p));
  const H = Math.round(h * p.h);
  const vTop = findSplit(colScores(p, bg, 0, H), () => colDiffs(p, 0, H));
  const vBottom = findSplit(colScores(p, bg, H, p.h), () => colDiffs(p, H, p.h));
  return { lines: { h, vTop, vBottom }, background: bg };
}

/** The 4 tiles in reading order: top-left, top-right, bottom-left, bottom-right. */
export function tileRects(W: number, H: number, l: Lines): Rect[] {
  const clamp = (v: number, max: number) => Math.min(max - 1, Math.max(1, Math.round(v)));
  const y = clamp(l.h * H, H);
  const xt = clamp(l.vTop * W, W);
  const xb = clamp(l.vBottom * W, W);
  return [
    { x: 0, y: 0, w: xt, h: y },
    { x: xt, y: 0, w: W - xt, h: y },
    { x: 0, y, w: xb, h: H - y },
    { x: xb, y, w: W - xb, h: H - y },
  ];
}

/** Shrink a tile to its content (drops leftover gutter / neighbour-free white space). */
function trimRect(img: HTMLImageElement, r: Rect, bg: RGB, pad: number): Rect {
  const c = document.createElement("canvas");
  c.width = r.w;
  c.height = r.h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  const d = ctx.getImageData(0, 0, r.w, r.h).data;
  let x0 = r.w, y0 = r.h, x1 = -1, y1 = -1;
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      if (isContent(d, (y * r.w + x) * 4, bg)) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return r;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(r.w - 1, x1 + pad);
  y1 = Math.min(r.h - 1, y1 + pad);
  return { x: r.x + x0, y: r.y + y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function resolveFormat(format: OutputFormat, fileType: string): string {
  if (format !== "original") return format;
  return ["image/png", "image/jpeg", "image/webp"].includes(fileType) ? fileType : "image/png";
}

export function extensionFor(mime: string) {
  return mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
}

export type CropOptions = {
  mime: string;
  quality: number; // 0..1, jpeg/webp only
  trim: boolean;
  trimPadding: number;
  background: RGB;
};

export async function cropTiles(img: HTMLImageElement, lines: Lines, o: CropOptions): Promise<Blob[]> {
  const rects = tileRects(img.naturalWidth, img.naturalHeight, lines);
  const blobs: Blob[] = [];
  for (const base of rects) {
    const r = o.trim ? trimRect(img, base, o.background, o.trimPadding) : base;
    const c = document.createElement("canvas");
    c.width = r.w;
    c.height = r.h;
    const ctx = c.getContext("2d")!;
    if (o.mime === "image/jpeg") {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, r.w, r.h);
    }
    ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, o.mime, o.quality));
    if (!blob) throw new Error("Failed to encode image");
    blobs.push(blob);
  }
  return blobs;
}
