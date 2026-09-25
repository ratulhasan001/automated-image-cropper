"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import SplitEditor from "@/components/SplitEditor";
import {
  cropTiles,
  detectLines,
  extensionFor,
  loadImage,
  resolveFormat,
  tileRects,
  type Lines,
  type OutputFormat,
  type RGB,
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
};

const DEFAULTS: Settings = {
  startNumber: 1,
  perProduct: 2,
  layout: "flat",
  format: "original",
  quality: 0.92,
  prefix: "",
  trim: false,
  trimPadding: 0,
};

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
      const mime = resolveFormat(settings.format, it.file.type);
      const blobs = await cropTiles(img, it.lines, {
        mime,
        quality: settings.quality,
        trim: settings.trim,
        trimPadding: settings.trimPadding,
        background: it.background,
      });
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
  onLines: (l: Lines) => void;
  onLinked: (v: boolean) => void;
  onReset: () => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
  onApplyAll: () => void;
}) {
  const rects = tileRects(item.width, item.height, item.lines);
  const btn = "rounded-md border border-[var(--line)] px-2 py-1 text-xs hover:bg-[var(--hover)] disabled:opacity-40";
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold" title={item.file.name}>
            Image {index + 1} · <span className="font-normal text-[var(--muted)]">{item.file.name}</span>
          </div>
          <div className="text-xs text-[var(--muted)] tabular-nums">
            Photos {firstNumber}–{firstNumber + 3} · {rects.map((r) => `${r.w}×${r.h}`).join(", ")}
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
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({ settings, onChange }: { settings: Settings; onChange: (p: Partial<Settings>) => void }) {
  const field = "rounded-md border border-[var(--line)] bg-[var(--canvas)] px-2 py-1 text-sm";
  const label = "flex flex-col gap-1 text-xs font-medium text-[var(--muted)]";
  return (
    <details className="rounded-xl border border-[var(--line)] bg-[var(--panel)]" open>
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Output settings</summary>
      <div className="grid grid-cols-2 gap-4 px-4 pb-4 sm:grid-cols-3 lg:grid-cols-6">
        <label className={label}>
          Naming
          <select
            className={field}
            value={settings.layout}
            onChange={(e) => onChange({ layout: e.target.value as Settings["layout"] })}
          >
            <option value="flat">One folder: 1, 2, 3 … (continuous)</option>
            <option value="folders">Folder per product: 1–8 each</option>
          </select>
        </label>
        <label className={label}>
          {settings.layout === "folders" ? "First product number" : "Start numbering at"}
          <input
            type="number"
            min={0}
            className={field}
            value={settings.startNumber}
            onChange={(e) => onChange({ startNumber: Math.max(0, parseInt(e.target.value) || 0) })}
          />
        </label>
        <label className={label}>
          Images per product
          <input
            type="number"
            min={1}
            className={field}
            value={settings.perProduct}
            onChange={(e) => onChange({ perProduct: Math.max(1, parseInt(e.target.value) || 1) })}
          />
        </label>
        <label className={label}>
          Filename prefix
          <input
            className={field}
            placeholder="e.g. jacket-"
            value={settings.prefix}
            onChange={(e) => onChange({ prefix: e.target.value.replace(/[\\/:*?"<>|]/g, "") })}
          />
        </label>
        <label className={label}>
          Format
          <select
            className={field}
            value={settings.format}
            onChange={(e) => onChange({ format: e.target.value as OutputFormat })}
          >
            <option value="original">Same as original</option>
            <option value="image/png">PNG (lossless)</option>
            <option value="image/jpeg">JPG</option>
            <option value="image/webp">WebP</option>
          </select>
        </label>
        <label className={label}>
          Quality (JPG/WebP): {Math.round(settings.quality * 100)}
          <input
            type="range"
            min={50}
            max={100}
            value={Math.round(settings.quality * 100)}
            onChange={(e) => onChange({ quality: parseInt(e.target.value) / 100 })}
          />
        </label>
        <label className="col-span-2 flex items-center gap-2 text-sm sm:col-span-3">
          <input type="checkbox" checked={settings.trim} onChange={(e) => onChange({ trim: e.target.checked })} />
          Auto-trim empty background around each photo
          {settings.trim && (
            <span className="flex items-center gap-1 text-xs text-[var(--muted)]">
              · padding
              <input
                type="number"
                min={0}
                className={`${field} w-16`}
                value={settings.trimPadding}
                onChange={(e) => onChange({ trimPadding: Math.max(0, parseInt(e.target.value) || 0) })}
              />
              px
            </span>
          )}
        </label>
      </div>
    </details>
  );
}
