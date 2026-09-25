"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import SplitEditor from "@/components/SplitEditor";
import {
  cropTiles,
  detectLines,
  extensionFor,
  loadImage,
  outputSize,
  resolveFormat,
  tileRects,
  type Lines,
  type OutputFormat,
  type ProcessOptions,
  type RGB,
  type Shape,
} from "@/lib/image";

type Item = {
  id: string;
  file: File;
  url: string;
  width: number;
  height: number;
  lines: Lines;
  detected: Lines;
  background: RGB;
  linked: boolean;
};

type Settings = {
  startNumber: number;
  perProduct: number;
  layout: "flat" | "folders";
  format: OutputFormat;
  quality: number;
  prefix: string;
  trim: boolean;
  trimPadding: number;
  shape: Shape;
  fit: "pad" | "fill";
  exactW: number;
  exactH: number;
  maxW: number;
  maxH: number;
  maxKB: number;
  bgMode: "keep" | "white" | "transparent";
  bgTolerance: number;
};

const DEFAULTS: Settings = {
  startNumber: 1,
  perProduct: 2,
  layout: "folders",
  format: "original",
  quality: 0.92,
  prefix: "",
  trim: false,
  trimPadding: 0,
  shape: "exact",
  fit: "pad",
  exactW: 1000,
  exactH: 1250,
  maxW: 0,
  maxH: 0,
  maxKB: 0,
  bgMode: "keep",
  bgTolerance: 60,
};

/** Output mime for an item — transparent backgrounds can't be JPG, so those become PNG. */
function mimeFor(s: Settings, fileType: string) {
  const mime = resolveFormat(s.format, fileType);
  return s.bgMode === "transparent" && mime === "image/jpeg" ? "image/png" : mime;
}

function processOptions(s: Settings, item: Item): ProcessOptions {
  return {
    mime: mimeFor(s, item.file.type),
    quality: s.quality,
    trim: s.trim,
    trimPadding: s.trimPadding,
    background: item.background,
    bgMode: s.bgMode,
    bgTolerance: s.bgTolerance,
    shape: s.shape,
    fit: s.fit,
    exactW: s.exactW,
    exactH: s.exactH,
    maxW: s.maxW,
    maxH: s.maxH,
    maxKB: s.maxKB,
  };
}

const SETTINGS_KEY = "grid-cropper-settings";

const naturalCompare = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }).compare;

function triggerDownload(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export default function Home() {
  const [items, setItems] = useState<Item[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) setSettings({ ...DEFAULTS, ...JSON.parse(saved) });
    } catch {}
  }, []);

  const updateSettings = (patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const addFiles = useCallback(async (list: FileList | File[]) => {
    const files = Array.from(list)
      .filter((f) => f.type.startsWith("image/"))
      .sort((a, b) => naturalCompare(a.name, b.name));
    if (!files.length) return;
    setBusy(`Analysing ${files.length} image${files.length > 1 ? "s" : ""}…`);
    const added: Item[] = [];
    for (const file of files) {
      const url = URL.createObjectURL(file);
      try {
        const img = await loadImage(url);
        const { lines, background } = detectLines(img);
        added.push({
          id: crypto.randomUUID(),
          file,
          url,
          width: img.naturalWidth,
          height: img.naturalHeight,
          lines,
          detected: lines,
          background,
          linked: false,
        });
      } catch {
        URL.revokeObjectURL(url);
      }
    }
    setItems((prev) => [...prev, ...added]);
    setBusy(null);
  }, []);

  // Paste images from clipboard
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) addFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const update = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const remove = (id: string) =>
    setItems((prev) => {
      const it = prev.find((p) => p.id === id);
      if (it) URL.revokeObjectURL(it.url);
      return prev.filter((p) => p.id !== id);
    });

  const moveItem = (index: number, dir: -1 | 1) =>
    setItems((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });

  const applyToAll = (source: Item) =>
    setItems((prev) => prev.map((it) => ({ ...it, lines: { ...source.lines }, linked: source.linked })));

  const clearAll = () => {
    items.forEach((it) => URL.revokeObjectURL(it.url));
    setItems([]);
  };

  const fileNameFor = (imageIndex: number, tile: number, mime: string) => {
    const ext = extensionFor(mime);
    const s = settings;
    if (s.layout === "folders") {
      const product = Math.floor(imageIndex / s.perProduct);
      const within = (imageIndex % s.perProduct) * 4 + tile + 1;
      const folder = `${s.prefix}product-${String(product + s.startNumber).padStart(2, "0")}`;
      return `${folder}/${s.prefix}${within}.${ext}`;
    }
    return `${s.prefix}${s.startNumber + imageIndex * 4 + tile}.${ext}`;
  };

  const produce = async (onTile: (name: string, blob: Blob) => Promise<void> | void) => {
    for (let i = 0; i < items.length; i++) {
      setBusy(`Cropping image ${i + 1} of ${items.length}…`);
      const it = items[i];
      const img = await loadImage(it.url);
      const options = processOptions(settings, it);
      const mime = options.mime;
      const blobs = await cropTiles(img, it.lines, options);
      for (let t = 0; t < 4; t++) await onTile(fileNameFor(i, t, mime), blobs[t]);
    }
  };

  const downloadZip = async () => {
    try {
      const zip = new JSZip();
      await produce((name, blob) => {
        zip.file(name, blob);
      });
      setBusy("Building ZIP…");
      const out = await zip.generateAsync({ type: "blob", compression: "STORE" });
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      triggerDownload(out, `cropped-${stamp}.zip`);
    } catch (e) {
      alert(`Something went wrong: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const downloadFiles = async () => {
    try {
      await produce(async (name, blob) => {
        triggerDownload(blob, name.replace("/", "_"));
        await new Promise((r) => setTimeout(r, 150));
      });
    } catch (e) {
      alert(`Something went wrong: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const products: Item[][] = [];
  for (let i = 0; i < items.length; i += settings.perProduct) products.push(items.slice(i, i + settings.perProduct));

  const numberLabel = (imageIndex: number) => {
    if (settings.layout === "folders") return (imageIndex % settings.perProduct) * 4 + 1;
    return settings.startNumber + imageIndex * 4;
  };

  return (
    <div
      className="min-h-screen pb-28"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        addFiles(e.dataTransfer.files);
      }}
    >
      <header className="border-b border-[var(--line)] bg-[var(--panel)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">2×2 Grid Cropper</h1>
            <p className="text-sm text-[var(--muted)]">
              Split grid images into 4 separate photos. Everything runs in your browser — nothing is uploaded.
            </p>
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-white hover:opacity-90"
          >
            + Add images
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <SettingsPanel settings={settings} onChange={updateSettings} />

        {items.length === 0 ? (
          <button
            onClick={() => inputRef.current?.click()}
            className={`mt-6 flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-24 text-center transition ${
              dragOver ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] hover:border-[var(--accent)]"
            }`}
          >
            <span className="text-lg font-semibold">Drop your 2×2 grid images here</span>
            <span className="text-sm text-[var(--muted)]">
              or click to choose files · you can also paste (⌘/Ctrl + V) · files are sorted by name
            </span>
          </button>
        ) : (
          <>
            <p className="mt-6 text-sm text-[var(--muted)]">
              Drag the <span className="font-semibold text-sky-600">blue</span> line to move the horizontal cut and the{" "}
              <span className="font-semibold text-amber-600">orange</span> lines for the vertical cuts (top and bottom rows are
              independent). Click a line and use arrow keys to nudge 1px (Shift = 10px). A magnifier appears while dragging.
            </p>
            <div className="mt-4 space-y-8">
              {products.map((group, p) => (
                <section key={p}>
                  <h2 className="mb-3 flex items-baseline gap-3 text-base font-semibold">
                    Product {settings.layout === "folders" ? p + settings.startNumber : p + 1}
                    <span className="text-sm font-normal text-[var(--muted)]">
                      {group.length * 4} photos
                      {group.length < settings.perProduct && " · incomplete"}
                    </span>
                  </h2>
                  <div className="grid gap-5 md:grid-cols-2">
                    {group.map((it, k) => {
                      const index = p * settings.perProduct + k;
                      return (
                        <ImageCard
                          key={it.id}
                          item={it}
                          index={index}
                          total={items.length}
                          firstNumber={numberLabel(index)}
                          settings={settings}
                          onLines={(lines) => update(it.id, { lines })}
                          onLinked={(linked) =>
                            update(it.id, {
                              linked,
                              lines: linked ? { ...it.lines, vBottom: it.lines.vTop } : it.lines,
                            })
                          }
                          onReset={() => update(it.id, { lines: it.detected, linked: false })}
                          onMove={(d) => moveItem(index, d)}
                          onRemove={() => remove(it.id)}
                          onApplyAll={() => applyToAll(it)}
                        />
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            <button
              onClick={() => inputRef.current?.click()}
              className="mt-8 w-full rounded-2xl border-2 border-dashed border-[var(--line)] py-8 text-[var(--muted)] hover:border-[var(--accent)]"
            >
              + Add more images
            </button>
          </>
        )}
      </main>

      {items.length > 0 && (
        <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--panel)]/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="text-sm">
              <span className="font-semibold">{items.length}</span> image{items.length > 1 && "s"} →{" "}
              <span className="font-semibold">{items.length * 4}</span> photos ·{" "}
              <span className="font-semibold">{products.length}</span> product{products.length > 1 && "s"}
              {busy && <span className="ml-3 text-[var(--accent)]">{busy}</span>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={clearAll}
                disabled={!!busy}
                className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--hover)] disabled:opacity-50"
              >
                Clear all
              </button>
              <button
                onClick={downloadFiles}
                disabled={!!busy}
                className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--hover)] disabled:opacity-50"
                title="Downloads each photo as a separate file (browser may ask to allow multiple downloads)"
              >
                Download files
              </button>
              <button
                onClick={downloadZip}
                disabled={!!busy}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                Crop & download ZIP
              </button>
            </div>
          </div>
        </footer>
      )}

      {busy && items.length === 0 && (
        <div className="fixed inset-x-0 bottom-6 mx-auto w-fit rounded-lg bg-black/80 px-4 py-2 text-sm text-white">{busy}</div>
      )}
    </div>
  );
}

function ImageCard({
  item,
  index,
  total,
  firstNumber,
  settings,
  onLines,
  onLinked,
  onReset,
  onMove,
  onRemove,
  onApplyAll,
}: {
  item: Item;
  index: number;
  total: number;
  firstNumber: number;
  settings: Settings;
  onLines: (l: Lines) => void;
  onLinked: (v: boolean) => void;
  onReset: () => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
  onApplyAll: () => void;
}) {
  const rects = tileRects(item.width, item.height, item.lines);
  const sizes = rects.map((r) => outputSize(r.w, r.h, settings));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<{ url: string; w: number; h: number; kb: number }[] | null>(null);
  const previewUrls = useRef<string[]>([]);

  // Re-render the preview (debounced) whenever lines or settings change while it's open.
  useEffect(() => {
    if (!previewOpen) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const made: string[] = [];
      const img = await loadImage(item.url);
      const blobs = await cropTiles(img, item.lines, processOptions(settings, item));
      const out = await Promise.all(
        blobs.map(async (b) => {
          const url = URL.createObjectURL(b);
          made.push(url);
          const im = await loadImage(url);
          return { url, w: im.naturalWidth, h: im.naturalHeight, kb: Math.round(b.size / 1024) };
        }),
      );
      if (cancelled) return made.forEach((u) => URL.revokeObjectURL(u));
      previewUrls.current.forEach((u) => URL.revokeObjectURL(u));
      previewUrls.current = made;
      setPreview(out);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [previewOpen, item, settings]);

  // Free preview images when the preview is closed or the card is removed.
  useEffect(() => {
    if (previewOpen) return;
    previewUrls.current.forEach((u) => URL.revokeObjectURL(u));
    previewUrls.current = [];
  }, [previewOpen]);
  useEffect(() => {
    const urls = previewUrls;
    return () => urls.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const btn = "rounded-md border border-[var(--line)] px-2 py-1 text-xs hover:bg-[var(--hover)] disabled:opacity-40";
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold" title={item.file.name}>
            Image {index + 1} · <span className="font-normal text-[var(--muted)]">{item.file.name}</span>
          </div>
          <div className="text-xs text-[var(--muted)] tabular-nums">
            Photos {firstNumber}–{firstNumber + 3} · {sizes.map((r) => `${r.w}×${r.h}`).join(", ")}
            {settings.trim && " (before trim)"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className={btn} onClick={() => onMove(-1)} disabled={index === 0} title="Move earlier">
            ↑
          </button>
          <button className={btn} onClick={() => onMove(1)} disabled={index === total - 1} title="Move later">
            ↓
          </button>
          <button className={`${btn} text-rose-600`} onClick={onRemove} title="Remove">
            ✕
          </button>
        </div>
      </div>
      <div className="bg-[var(--canvas)] p-2">
        <SplitEditor
          url={item.url}
          naturalWidth={item.width}
          naturalHeight={item.height}
          lines={item.lines}
          linked={item.linked}
          firstNumber={firstNumber}
          onChange={onLines}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] px-3 py-2">
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={item.linked} onChange={(e) => onLinked(e.target.checked)} />
          Straight vertical line
        </label>
        <div className="ml-auto flex gap-1">
          <button className={btn} onClick={onReset} title="Go back to the auto-detected positions">
            Auto-detect
          </button>
          <button className={btn} onClick={() => onLines({ h: 0.5, vTop: 0.5, vBottom: 0.5 })}>
            Center
          </button>
          {total > 1 && (
            <button className={btn} onClick={onApplyAll} title="Copy these line positions to every image">
              Apply to all
            </button>
          )}
          <button
            className={`${btn} ${previewOpen ? "bg-[var(--accent)] text-white" : ""}`}
            onClick={() => {
              setPreviewOpen((v) => !v);
              setPreview(null);
            }}
          >
            {previewOpen ? "Hide preview" : "Preview output"}
          </button>
        </div>
      </div>
      {previewOpen && (
        <div className="grid grid-cols-4 gap-2 border-t border-[var(--line)] p-2">
          {preview
            ? preview.map((p, i) => (
                <figure key={i} className="flex flex-col gap-1">
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-[var(--canvas)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={`Photo ${firstNumber + i}`} className="checker max-h-full max-w-full shadow-sm" />
                  </div>
                  <figcaption className="text-center text-[11px] leading-tight text-[var(--muted)] tabular-nums">
                    <b className="text-[var(--text)]">{firstNumber + i}</b> · {p.w}×{p.h}
                    <br />
                    <span className={settings.maxKB && p.kb > settings.maxKB ? "font-semibold text-amber-600" : ""}>
                      {p.kb} KB{settings.maxKB > 0 && p.kb > settings.maxKB && " — over limit"}
                    </span>
                  </figcaption>
                </figure>
              ))
            : <p className="col-span-4 py-6 text-center text-sm text-[var(--muted)]">Rendering…</p>}
        </div>
      )}
    </div>
  );
}

function SettingsPanel({ settings, onChange }: { settings: Settings; onChange: (p: Partial<Settings>) => void }) {
  const field = "w-full rounded-md border border-[var(--line)] bg-[var(--canvas)] px-2 py-1 text-sm text-[var(--text)]";
  const label = "flex flex-col gap-1 text-xs font-medium text-[var(--muted)]";
  const group = "flex flex-col gap-3 rounded-lg border border-[var(--line)] p-3";
  const heading = "text-xs font-semibold uppercase tracking-wide text-[var(--text)]";
  const int = (v: string) => Math.max(0, parseInt(v) || 0);
  const lossy = settings.format === "image/jpeg" || settings.format === "image/webp" || settings.format === "original";
  const presets = [
    { label: "Original", shape: "original" },
    { label: "1:1", shape: "1:1" },
    { label: "4:5", shape: "4:5" },
    { label: "3:4", shape: "3:4" },
    { label: "2:3", shape: "2:3" },
    { label: "Exact size", shape: "exact" },
  ] as const;

  return (
    <details className="rounded-xl border border-[var(--line)] bg-[var(--panel)]" open>
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Output settings</summary>
      <div className="grid gap-3 px-4 pb-4 md:grid-cols-2 xl:grid-cols-4">
        {/* Naming */}
        <div className={group}>
          <div className={heading}>Naming</div>
          <label className={label}>
            Layout
            <select className={field} value={settings.layout} onChange={(e) => onChange({ layout: e.target.value as Settings["layout"] })}>
              <option value="flat">One folder: 1, 2, 3 … (continuous)</option>
              <option value="folders">Folder per product: 1–8 each</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={label}>
              {settings.layout === "folders" ? "First product #" : "Start at"}
              <input type="number" min={0} className={field} value={settings.startNumber} onChange={(e) => onChange({ startNumber: int(e.target.value) })} />
            </label>
            <label className={label}>
              Images / product
              <input type="number" min={1} className={field} value={settings.perProduct} onChange={(e) => onChange({ perProduct: Math.max(1, int(e.target.value)) })} />
            </label>
          </div>
          <label className={label}>
            Filename prefix
            <input className={field} placeholder="e.g. jacket-" value={settings.prefix} onChange={(e) => onChange({ prefix: e.target.value.replace(/[\\/:*?"<>|]/g, "") })} />
          </label>
        </div>

        {/* Size & shape */}
        <div className={group}>
          <div className={heading}>Size &amp; shape</div>
          <div className="flex flex-wrap gap-1">
            {presets.map((p) => (
              <button
                key={p.shape}
                onClick={() => onChange({ shape: p.shape })}
                className={`rounded-md border px-2 py-1 text-xs ${
                  settings.shape === p.shape ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] hover:bg-[var(--hover)]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {settings.shape === "exact" && (
            <div className="grid grid-cols-2 gap-2">
              <label className={label}>
                Width px
                <input type="number" min={1} className={field} value={settings.exactW} onChange={(e) => onChange({ exactW: Math.max(1, int(e.target.value)) })} />
              </label>
              <label className={label}>
                Height px
                <input type="number" min={1} className={field} value={settings.exactH} onChange={(e) => onChange({ exactH: Math.max(1, int(e.target.value)) })} />
              </label>
            </div>
          )}
          {settings.shape !== "original" && (
            <label className={label}>
              How to fit
              <select className={field} value={settings.fit} onChange={(e) => onChange({ fit: e.target.value as Settings["fit"] })}>
                <option value="pad">Pad with white (keeps whole photo)</option>
                <option value="fill">Fill frame (crops edges)</option>
              </select>
            </label>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className={label}>
              Max width px
              <input type="number" min={0} placeholder="no limit" className={field} value={settings.maxW || ""} onChange={(e) => onChange({ maxW: int(e.target.value) })} />
            </label>
            <label className={label}>
              Max height px
              <input type="number" min={0} placeholder="no limit" className={field} value={settings.maxH || ""} onChange={(e) => onChange({ maxH: int(e.target.value) })} />
            </label>
          </div>
        </div>

        {/* Background */}
        <div className={group}>
          <div className={heading}>Background</div>
          <div className="flex flex-col gap-1.5 text-sm">
            {(
              [
                ["keep", "Keep as is"],
                ["white", "Pure white (#FFFFFF)"],
                ["transparent", "Transparent (PNG/WebP)"],
              ] as const
            ).map(([v, l]) => (
              <label key={v} className="flex items-center gap-2">
                <input type="radio" name="bgMode" checked={settings.bgMode === v} onChange={() => onChange({ bgMode: v })} />
                {l}
              </label>
            ))}
          </div>
          {settings.bgMode !== "keep" && (
            <label className={label}>
              Strength: {settings.bgTolerance}
              <input type="range" min={10} max={160} value={settings.bgTolerance} onChange={(e) => onChange({ bgTolerance: parseInt(e.target.value) })} />
              <span className="font-normal">Raise it if grey shadows remain, lower it if the product edges get eaten. Use Preview to check.</span>
            </label>
          )}
          {settings.bgMode === "transparent" && (settings.format === "image/jpeg" || settings.format === "original") && (
            <p className="text-xs text-amber-600">JPG can&apos;t be transparent, so JPG photos will be saved as PNG.</p>
          )}
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.trim} onChange={(e) => onChange({ trim: e.target.checked })} />
            Auto-trim empty space
            {settings.trim && (
              <span className="flex items-center gap-1 text-xs text-[var(--muted)]">
                padding
                <input type="number" min={0} className={`${field} w-16`} value={settings.trimPadding} onChange={(e) => onChange({ trimPadding: int(e.target.value) })} />
                px
              </span>
            )}
          </label>
        </div>

        {/* Format & file size */}
        <div className={group}>
          <div className={heading}>Format &amp; file size</div>
          <label className={label}>
            Format
            <select className={field} value={settings.format} onChange={(e) => onChange({ format: e.target.value as OutputFormat })}>
              <option value="original">Same as original</option>
              <option value="image/png">PNG (lossless)</option>
              <option value="image/jpeg">JPG</option>
              <option value="image/webp">WebP</option>
            </select>
          </label>
          {lossy && (
            <label className={label}>
              Quality (JPG/WebP): {Math.round(settings.quality * 100)}
              <input type="range" min={50} max={100} value={Math.round(settings.quality * 100)} onChange={(e) => onChange({ quality: parseInt(e.target.value) / 100 })} />
            </label>
          )}
          <label className={label}>
            Max file size per photo (KB)
            <input type="number" min={0} placeholder="no limit" className={field} value={settings.maxKB || ""} onChange={(e) => onChange({ maxKB: int(e.target.value) })} />
            <span className="font-normal">
              {settings.shape === "exact"
                ? "Exact size is kept, so only quality is lowered (use JPG/WebP for small files)."
                : settings.format === "image/png"
                  ? "PNG is lossless, so it's made smaller by reducing dimensions."
                  : "Lowers quality first, then dimensions if still too big."}
            </span>
          </label>
        </div>
      </div>
    </details>
  );
}
