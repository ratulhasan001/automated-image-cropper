"use client";

import { AnimatePresence, LayoutGroup, motion, MotionConfig } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import ImageCard from "@/components/ImageCard";
import Logo from "@/components/Logo";
import SettingsPanel from "@/components/SettingsPanel";
import { Button, softSpring, spring } from "@/components/ui";
import { Check, Download, Grid, Plus, Shield, Trash, Upload, Zap } from "@/components/icons";
import { cropTiles, detectLines, extensionFor, loadImage } from "@/lib/image";
import { APP_NAME, DEFAULTS, processOptions, SETTINGS_KEY, type Item, type Settings } from "@/lib/settings";

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

type Busy = { label: string; progress: number | null };

export default function Home() {
  const [items, setItems] = useState<Item[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) setSettings({ ...DEFAULTS, ...JSON.parse(saved) });
    } catch {}
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

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
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setBusy({ label: `Analysing ${i + 1} of ${files.length}`, progress: i / files.length });
      const url = URL.createObjectURL(file);
      try {
        const img = await loadImage(url);
        const { lines, background } = detectLines(img);
        const item: Item = {
          id: crypto.randomUUID(),
          file,
          url,
          width: img.naturalWidth,
          height: img.naturalHeight,
          lines,
          detected: lines,
          background,
          linked: false,
        };
        // Add one at a time so cards cascade in.
        setItems((prev) => [...prev, item]);
      } catch {
        URL.revokeObjectURL(url);
      }
    }
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
      if (it) setTimeout(() => URL.revokeObjectURL(it.url), 1000); // after exit animation
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
    const urls = items.map((it) => it.url);
    setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 1000);
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
      setBusy({ label: `Cropping ${i + 1} of ${items.length}`, progress: i / items.length });
      const it = items[i];
      const img = await loadImage(it.url);
      const options = processOptions(settings, it);
      const blobs = await cropTiles(img, it.lines, options);
      for (let t = 0; t < 4; t++) await onTile(fileNameFor(i, t, options.mime), blobs[t]);
    }
  };

  const downloadZip = async () => {
    try {
      const zip = new JSZip();
      await produce((name, blob) => {
        zip.file(name, blob);
      });
      setBusy({ label: "Packing ZIP", progress: 1 });
      const out = await zip.generateAsync({ type: "blob", compression: "STORE" });
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      triggerDownload(out, `yoyo-cropper-${stamp}.zip`);
      setToast(`${items.length * 4} photos downloaded as ZIP`);
    } catch (e) {
      setToast(`Something went wrong: ${(e as Error).message}`);
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
      setToast(`${items.length * 4} photos downloaded`);
    } catch (e) {
      setToast(`Something went wrong: ${(e as Error).message}`);
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

  const pick = () => inputRef.current?.click();
  const hasItems = items.length > 0;

  return (
    <MotionConfig reducedMotion="user">
      <div
        className="min-h-screen pb-36"
        onDragEnter={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          dragDepth.current++;
          setDragOver(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <div className="ambient" aria-hidden>
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <div className="blob blob-3" />
        </div>

        {/* Header */}
        <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--bg)]/60 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
            <a href="/" className="flex items-center gap-2.5">
              <Logo size={30} />
              <span className="text-[15px] font-semibold tracking-tight">{APP_NAME}</span>
            </a>
            <div className="flex items-center gap-3">
              <span className="hidden items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1 text-xs text-[var(--muted)] sm:flex">
                <Shield size={13} /> Private · runs in your browser
              </span>
              <Button variant="primary" onClick={pick}>
                <Plus /> Add images
              </Button>
            </div>
          </div>
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
        </header>

        <main className="mx-auto max-w-7xl px-4">
          {/* Plain conditional (no exit tracking) so the hero can never get stuck mid-transition. */}
          {!hasItems ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Hero onPick={pick} active={dragOver} />
            </motion.div>
          ) : (
            <div className="pt-6" />
          )}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...softSpring, delay: 0.35 }}
            className={hasItems ? "" : "mt-10"}
          >
            <SettingsPanel settings={settings} onChange={updateSettings} />
          </motion.div>

          {hasItems && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted)]"
            >
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-[var(--cut-h)]" /> horizontal cut
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-0.5 rounded bg-[var(--cut-v)]" /> vertical cuts (top &amp; bottom move separately)
              </span>
              <span>Drag lines · click + arrow keys to nudge 1px (Shift = 10px) · magnifier shows while dragging</span>
            </motion.p>
          )}

          <LayoutGroup>
            <div className="mt-5 space-y-10">
              <AnimatePresence initial={false}>
                {products.map((group, p) => (
                  <motion.section
                    key={`product-${p}`}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.2 } }}
                  >
                    <motion.h2 layout="position" className="mb-3 flex items-center gap-3">
                      <span className="text-lg font-semibold tracking-tight">
                        Product {settings.layout === "folders" ? p + settings.startNumber : p + 1}
                      </span>
                      <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-xs font-medium text-[var(--accent)]">
                        {group.length * 4} photos
                      </span>
                      {group.length < settings.perProduct && (
                        <span className="rounded-full bg-amber-500/12 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                          needs {settings.perProduct - group.length} more image{settings.perProduct - group.length > 1 && "s"}
                        </span>
                      )}
                      <span className="h-px flex-1 bg-gradient-to-r from-[var(--line-strong)] to-transparent" />
                    </motion.h2>
                    <div className="grid gap-5 md:grid-cols-2">
                      <AnimatePresence initial={false} mode="popLayout">
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
                                update(it.id, { linked, lines: linked ? { ...it.lines, vBottom: it.lines.vTop } : it.lines })
                              }
                              onReset={() => update(it.id, { lines: it.detected, linked: false })}
                              onMove={(d) => moveItem(index, d)}
                              onRemove={() => remove(it.id)}
                              onApplyAll={() => applyToAll(it)}
                            />
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </motion.section>
                ))}
              </AnimatePresence>
            </div>

            {hasItems && (
              <motion.button
                layout
                onClick={pick}
                whileHover={{ scale: 1.005 }}
                whileTap={{ scale: 0.99 }}
                transition={spring}
                className="dropzone mt-10 flex w-full items-center justify-center gap-2 rounded-3xl py-10 text-sm font-medium text-[var(--muted)] hover:text-[var(--text)]"
              >
                <Plus /> Add more images
              </motion.button>
            )}
          </LayoutGroup>
        </main>

        {/* Bottom action bar */}
        <AnimatePresence>
          {hasItems && (
            <motion.div
              initial={{ y: 120, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 120, opacity: 0 }}
              transition={softSpring}
              className="fixed inset-x-0 bottom-4 z-40 px-4"
            >
              <div className="glass-strong mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 overflow-hidden rounded-2xl px-4 py-3 shadow-[var(--shadow-lg)] relative">
                <div className="flex items-center gap-4 text-sm">
                  <Stat value={items.length} label={items.length === 1 ? "image" : "images"} />
                  <span className="text-[var(--line-strong)]">→</span>
                  <Stat value={items.length * 4} label="photos" />
                  <span className="text-[var(--line-strong)]">·</span>
                  <Stat value={products.length} label={products.length === 1 ? "product" : "products"} />
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={clearAll} disabled={!!busy}>
                    <Trash /> <span className="hidden sm:inline">Clear</span>
                  </Button>
                  <Button onClick={downloadFiles} disabled={!!busy} title="Each photo as a separate file (browser may ask to allow multiple downloads)">
                    <Download /> <span className="hidden sm:inline">Files</span>
                  </Button>
                  <Button variant="primary" onClick={downloadZip} disabled={!!busy} busy={!!busy} className="relative min-w-48">
                    {/* Both labels stay mounted and crossfade — label text can change many times a second while busy. */}
                    {/* Plain CSS transitions: the browser always completes them, even if the tab was in the background. */}
                    <span
                      className={`flex items-center gap-1.5 transition-all duration-200 ${busy ? "-translate-y-2 opacity-0" : "opacity-100"}`}
                    >
                      <Zap /> Crop &amp; download ZIP
                    </span>
                    <span
                      className={`absolute inset-0 flex items-center justify-center tabular-nums transition-all duration-200 ${
                        busy ? "opacity-100" : "translate-y-2 opacity-0"
                      }`}
                      aria-hidden={!busy}
                    >
                      {busy ? `${busy.label}…` : ""}
                    </span>
                  </Button>
                </div>
                {/* progress */}
                <AnimatePresence>
                  {busy && (
                    <motion.div
                      className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)]"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: busy.progress ?? 0.5 }}
                      exit={{ opacity: 0 }}
                      transition={softSpring}
                    />
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Busy pill while analysing the very first upload */}
        <AnimatePresence>
          {busy && !hasItems && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="glass fixed inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-full px-4 py-2 text-sm shadow-[var(--shadow-lg)]"
            >
              {busy.label}…
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={spring}
              className="glass fixed inset-x-0 top-20 z-50 mx-auto flex w-fit items-center gap-2 rounded-full py-2 pr-4 pl-2 text-sm font-medium shadow-[var(--shadow-lg)]"
            >
              <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-white">
                <Check size={14} />
              </span>
              {toast}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Full-page drop overlay */}
        <AnimatePresence>
          {dragOver && hasItems && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-[var(--bg)]/70 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
                transition={spring}
                className="dropzone flex flex-col items-center gap-3 rounded-[2rem] px-16 py-14"
                data-active="true"
              >
                <Upload size={36} className="text-[var(--accent)]" />
                <span className="text-lg font-semibold">Drop to add images</span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex items-baseline gap-1">
      {/* Re-keying replays the entrance on every change; no exit animation to get stuck. */}
      <motion.b
        key={value}
        initial={{ y: 6, opacity: 0.3 }}
        animate={{ y: 0, opacity: 1 }}
        transition={spring}
        className="font-mono text-base tabular-nums"
      >
        {value}
      </motion.b>
      <span className="text-xs text-[var(--muted)]">{label}</span>
    </span>
  );
}

/* ---------------- Empty state ---------------- */

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { ...softSpring, delay: 0.08 * i } }),
};

function Hero({ onPick, active }: { onPick: () => void; active: boolean }) {
  return (
    <section className="grid items-center gap-10 pt-14 pb-2 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
      <div>
        <motion.div
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1 text-xs text-[var(--muted)] backdrop-blur"
        >
          <Grid size={13} className="text-[var(--accent)]" /> 2×2 grid → 4 product photos
        </motion.div>
        <motion.h1
          custom={1}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl lg:text-6xl"
        >
          Split grids into <span className="text-gradient">perfect product photos</span>.
        </motion.h1>
        <motion.p custom={2} variants={fadeUp} initial="hidden" animate="show" className="mt-5 max-w-xl text-base text-[var(--muted)] sm:text-lg">
          Drop in any number of 2×2 images. Cut lines are detected automatically, numbered per product, sized for your store
          and zipped — all without leaving your browser.
        </motion.p>

        <motion.button
          custom={3}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={onPick}
          data-active={active ? "true" : undefined}
          className="dropzone glass mt-8 flex w-full max-w-xl flex-col items-center gap-3 rounded-3xl px-6 py-10 text-center"
        >
          <motion.span
            animate={active ? { y: -6, scale: 1.1 } : { y: [0, -5, 0] }}
            transition={active ? spring : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white shadow-lg"
          >
            <Upload size={24} />
          </motion.span>
          <span className="text-base font-semibold">{active ? "Release to add images" : "Drop your grid images here"}</span>
          <span className="text-sm text-[var(--muted)]">
            or <span className="font-medium text-[var(--accent)]">browse files</span> · paste with ⌘/Ctrl + V · sorted by filename
          </span>
        </motion.button>

        <motion.ol custom={4} variants={fadeUp} initial="hidden" animate="show" className="mt-8 grid max-w-xl grid-cols-3 gap-3 text-xs">
          {[
            ["Upload", "Any amount, 2 images per product"],
            ["Adjust", "Auto lines, drag to fine-tune"],
            ["Download", "Numbered folders in a ZIP"],
          ].map(([t, d], i) => (
            <li key={t} className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3 backdrop-blur">
              <div className="mb-1 flex items-center gap-2 font-semibold">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--accent-soft)] font-mono text-[10px] text-[var(--accent)]">
                  {i + 1}
                </span>
                {t}
              </div>
              <div className="text-[var(--muted)]">{d}</div>
            </li>
          ))}
        </motion.ol>
      </div>

      <SplitDemo />
    </section>
  );
}

/** Looping illustration: a 2×2 grid that splits into 4 numbered photos and back. */
function SplitDemo() {
  const [split, setSplit] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setSplit((s) => !s), 2200);
    return () => clearInterval(t);
  }, []);
  const tiles = [
    { x: -1, y: -1, hue: "from-violet-400/70 to-fuchsia-400/60" },
    { x: 1, y: -1, hue: "from-sky-400/60 to-violet-400/60" },
    { x: -1, y: 1, hue: "from-fuchsia-400/60 to-rose-400/60" },
    { x: 1, y: 1, hue: "from-indigo-400/60 to-sky-400/60" },
  ];
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, rotate: -2 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={{ ...softSpring, delay: 0.25 }}
      className="relative mx-auto hidden aspect-square w-full max-w-md lg:block"
      aria-hidden
    >
      <div className="absolute inset-10 rounded-[2.5rem] bg-gradient-to-br from-[var(--accent)]/25 to-[var(--accent-2)]/20 blur-3xl" />
      <div className="absolute inset-0 grid place-items-center">
        <div className="relative h-72 w-72">
          {tiles.map((t, i) => (
            <motion.div
              key={i}
              animate={{
                x: split ? t.x * 26 : 0,
                y: split ? t.y * 26 : 0,
                rotate: split ? t.x * t.y * 3 : 0,
                borderRadius: split ? 24 : 6,
              }}
              transition={{ type: "spring", stiffness: 180, damping: 18, delay: i * 0.05 }}
              className={`absolute h-[142px] w-[142px] overflow-hidden border border-white/20 bg-gradient-to-br ${t.hue} shadow-[var(--shadow-lg)] backdrop-blur-md`}
              style={{ left: t.x < 0 ? 2 : 146, top: t.y < 0 ? 2 : 146 }}
            >
              {/* abstract product silhouette */}
              <div className="absolute inset-x-8 top-6 h-8 rounded-full bg-white/50" />
              <div className="absolute inset-x-5 top-16 bottom-0 rounded-t-[2rem] bg-white/40" />
              <motion.span
                animate={{ opacity: split ? 1 : 0, scale: split ? 1 : 0.6 }}
                transition={spring}
                className="absolute top-2 right-2 grid h-6 w-6 place-items-center rounded-full bg-black/60 font-mono text-[11px] font-semibold text-white"
              >
                {i + 1}
              </motion.span>
            </motion.div>
          ))}
          {/* cut lines */}
          <motion.div
            animate={{ opacity: split ? 0 : 1, scaleX: split ? 0.3 : 1 }}
            className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-[var(--cut-h)] shadow-[0_0_12px_var(--cut-h)]"
          />
          <motion.div
            animate={{ opacity: split ? 0 : 1, scaleY: split ? 0.3 : 1 }}
            className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-[var(--cut-v)] shadow-[0_0_12px_var(--cut-v)]"
          />
        </div>
      </div>
    </motion.div>
  );
}
