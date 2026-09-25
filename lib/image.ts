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

export type Shape = "original" | "1:1" | "4:5" | "3:4" | "2:3" | "exact";

export type ProcessOptions = {
  mime: string;
  quality: number; // 0..1, jpeg/webp only
  trim: boolean;
  trimPadding: number;
  background: RGB; // detected background colour of the source image
  bgMode: "keep" | "white" | "transparent";
  bgTolerance: number; // colour distance (sum of RGB differences) still treated as background
  shape: Shape;
  fit: "pad" | "fill"; // pad = add background around, fill = crop edges
  exactW: number;
  exactH: number;
  maxW: number; // 0 = no limit
  maxH: number;
  maxKB: number; // 0 = no limit
};

type Canvas = HTMLCanvasElement;

function makeCanvas(w: number, h: number): [Canvas, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return [c, ctx];
}

/** Canvas size before any max-size limit is applied. */
export function shapedSize(w: number, h: number, o: Pick<ProcessOptions, "shape" | "fit" | "exactW" | "exactH">) {
  if (o.shape === "original") return { w, h };
  if (o.shape === "exact") return { w: Math.max(1, o.exactW), h: Math.max(1, o.exactH) };
  const [a, b] = o.shape.split(":").map(Number);
  const R = a / b;
  const wider = w / h > R;
  if (o.fit === "pad") return wider ? { w, h: Math.round(w / R) } : { w: Math.round(h * R), h };
  return wider ? { w: Math.round(h * R), h } : { w, h: Math.round(w / R) };
}

/** Final pixel size of a tile (ignores auto-trim and file-size shrinking). */
export function outputSize(w: number, h: number, o: Pick<ProcessOptions, "shape" | "fit" | "exactW" | "exactH" | "maxW" | "maxH">) {
  const s = shapedSize(w, h, o);
  const f = Math.min(1, o.maxW > 0 ? o.maxW / s.w : 1, o.maxH > 0 ? o.maxH / s.h : 1);
  return { w: Math.max(1, Math.round(s.w * f)), h: Math.max(1, Math.round(s.h * f)) };
}

/**
 * Background cleanup: flood-fills from the tile edges through background-coloured pixels,
 * so white clothing inside the product is never touched. Edge pixels are blended for a soft outline.
 */
function cleanBackground(c: Canvas, bg: RGB, tol: number, mode: "white" | "transparent") {
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const w = c.width, h = c.height;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const dist = (p: number) => {
    const i = p * 4;
    if (d[i + 3] < 16) return 0;
    return Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]);
  };
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  const visit = (p: number) => {
    if (!seen[p] && dist(p) <= tol) {
      seen[p] = 1;
      stack[sp++] = p;
    }
  };
  for (let x = 0; x < w; x++) { visit(x); visit((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { visit(y * w); visit(y * w + w - 1); }
  while (sp > 0) {
    const p = stack[--sp];
    const x = p % w;
    if (x > 0) visit(p - 1);
    if (x < w - 1) visit(p + 1);
    if (p >= w) visit(p - w);
    if (p < w * (h - 1)) visit(p + w);
  }
  for (let p = 0; p < w * h; p++) {
    if (!seen[p]) continue;
    const t = dist(p) / Math.max(1, tol);
    const keep = t < 0.5 ? 0 : (t - 0.5) / 0.5; // 0 = pure background, 1 = original pixel
    const i = p * 4;
    if (mode === "transparent") {
      d[i + 3] = Math.round(d[i + 3] * keep);
    } else {
      d[i] = Math.round(d[i] * keep + 255 * (1 - keep));
      d[i + 1] = Math.round(d[i + 1] * keep + 255 * (1 - keep));
      d[i + 2] = Math.round(d[i + 2] * keep + 255 * (1 - keep));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** High-quality resize (halves in steps for big reductions to avoid aliasing). */
function resize(src: Canvas, w: number, h: number): Canvas {
  let cur = src;
  while (cur.width / 2 >= w && cur.height / 2 >= h) {
    const [c, ctx] = makeCanvas(cur.width / 2, cur.height / 2);
    ctx.drawImage(cur, 0, 0, c.width, c.height);
    cur = c;
  }
  if (cur.width === Math.round(w) && cur.height === Math.round(h)) return cur;
  const [c, ctx] = makeCanvas(w, h);
  ctx.drawImage(cur, 0, 0, c.width, c.height);
  return c;
}

function reshape(src: Canvas, o: ProcessOptions, pad: string | null): Canvas {
  if (o.shape === "original") return src;
  const w = src.width, h = src.height;
  const t = shapedSize(w, h, o);
  const scale = o.fit === "pad" ? Math.min(t.w / w, t.h / h) : Math.max(t.w / w, t.h / h);
  const dw = w * scale, dh = h * scale;
  const scaled = scale < 1 ? resize(src, dw, dh) : src;
  const [c, ctx] = makeCanvas(t.w, t.h);
  if (pad) {
    ctx.fillStyle = pad;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.drawImage(scaled, (t.w - dw) / 2, (t.h - dh) / 2, dw, dh);
  return c;
}

function toBlob(c: Canvas, mime: string, quality: number): Promise<Blob> {
  let src = c;
  if (mime === "image/jpeg") {
    // JPG has no transparency — flatten onto white instead of black.
    const [f, ctx] = makeCanvas(c.width, c.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, f.width, f.height);
    ctx.drawImage(c, 0, 0);
    src = f;
  }
  return new Promise((res, rej) => src.toBlob((b) => (b ? res(b) : rej(new Error("Failed to encode image"))), mime, quality));
}

/** Encode, lowering quality (JPG/WebP) and then dimensions until under the size limit. */
async function encode(c: Canvas, o: ProcessOptions): Promise<Blob> {
  const limit = o.maxKB * 1024;
  let blob = await toBlob(c, o.mime, o.quality);
  if (!limit || blob.size <= limit) return blob;
  const lossy = o.mime !== "image/png";
  let q = o.quality;
  if (lossy) {
    let lo = 0.4, hi = o.quality, best: Blob | null = null;
    for (let i = 0; i < 7; i++) {
      const mid = (lo + hi) / 2;
      const b = await toBlob(c, o.mime, mid);
      if (b.size <= limit) { best = b; lo = mid; } else hi = mid;
    }
    if (best) return best;
    q = 0.4;
    blob = await toBlob(c, o.mime, q);
  }
  if (o.shape === "exact") return blob; // exact dimensions win over the file-size limit
  let cur = c;
  for (let i = 0; i < 20 && blob.size > limit && cur.width > 64; i++) {
    cur = resize(cur, cur.width * 0.85, cur.height * 0.85);
    blob = await toBlob(cur, o.mime, q);
  }
  return blob;
}

export async function processTile(img: HTMLImageElement, rect: Rect, o: ProcessOptions): Promise<Blob> {
  const r = o.trim ? trimRect(img, rect, o.background, o.trimPadding) : rect;
  let [c, ctx] = makeCanvas(r.w, r.h);
  ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);

  const transparent = o.bgMode === "transparent" && o.mime !== "image/jpeg";
  if (o.bgMode !== "keep") cleanBackground(c, o.background, o.bgTolerance, transparent ? "transparent" : "white");

  const pad = transparent ? null : "#fff";
  c = reshape(c, o, pad);

  const f = Math.min(1, o.maxW > 0 ? o.maxW / c.width : 1, o.maxH > 0 ? o.maxH / c.height : 1);
  if (f < 1) c = resize(c, c.width * f, c.height * f);

  return encode(c, o);
}

export async function cropTiles(img: HTMLImageElement, lines: Lines, o: ProcessOptions): Promise<Blob[]> {
  const rects = tileRects(img.naturalWidth, img.naturalHeight, lines);
  const blobs: Blob[] = [];
  for (const r of rects) blobs.push(await processTile(img, r, o));
  return blobs;
}
