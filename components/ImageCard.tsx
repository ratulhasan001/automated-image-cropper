"use client";

import { AnimatePresence, motion } from "motion/react";
import { forwardRef, useEffect, useRef, useState } from "react";
import SplitEditor from "./SplitEditor";
import { Button, Switch, softSpring } from "./ui";
import { ArrowDown, ArrowUp, Close, Copy, Eye, Target, Wand } from "./icons";
import { cropTiles, loadImage, outputSize, tileRects, type Lines } from "@/lib/image";
import { processOptions, type Item, type Settings } from "@/lib/settings";

type Props = {
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
};

type Preview = { url: string; w: number; h: number; kb: number };

const ImageCard = forwardRef<HTMLDivElement, Props>(function ImageCard(
  { item, index, total, firstNumber, settings, onLines, onLinked, onReset, onMove, onRemove, onApplyAll },
  ref,
) {
  const rects = tileRects(item.width, item.height, item.lines);
  const sizes = rects.map((r) => outputSize(r.w, r.h, settings));
  const sameSize = sizes.every((s) => s.w === sizes[0].w && s.h === sizes[0].h);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<Preview[] | null>(null);
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
    }, 300);
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

  return (
    <motion.article
      ref={ref}
      layout
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94, filter: "blur(4px)" }}
      transition={softSpring}
      className="glass group/card overflow-hidden rounded-3xl shadow-[var(--shadow)] transition-shadow duration-500 hover:shadow-[var(--shadow-lg)]"
    >
      <header className="flex items-center gap-3 px-4 pt-4 pb-3">
        <motion.div
          layout="position"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] font-mono text-sm font-semibold text-white shadow-md"
        >
          {index + 1}
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold" title={item.file.name}>
            {item.file.name}
          </div>
          <div className="truncate font-mono text-[11px] text-[var(--muted)]">
            #{firstNumber}–{firstNumber + 3} · {sameSize ? `${sizes[0].w}×${sizes[0].h}` : sizes.map((r) => `${r.w}×${r.h}`).join(" · ")}
            {settings.trim && " (before trim)"}
          </div>
        </div>
        <div className="flex items-center gap-0.5 opacity-70 transition-opacity group-hover/card:opacity-100">
          <Button variant="ghost" size="sm" onClick={() => onMove(-1)} disabled={index === 0} title="Move earlier" aria-label="Move earlier">
            <ArrowUp />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onMove(1)} disabled={index === total - 1} title="Move later" aria-label="Move later">
            <ArrowDown />
          </Button>
          <Button variant="danger" size="sm" onClick={onRemove} title="Remove" aria-label="Remove">
            <Close />
          </Button>
        </div>
      </header>

      <div className="mx-3 overflow-hidden rounded-2xl bg-[var(--canvas)] ring-1 ring-[var(--line)]">
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

      <footer className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Switch checked={item.linked} onChange={onLinked} label={<span className="text-xs">Straight line</span>} />
        <div className="ml-auto flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" onClick={onReset} title="Back to auto-detected positions">
            <Wand /> Auto
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onLines({ h: 0.5, vTop: 0.5, vBottom: 0.5 })} title="Put lines in the exact center">
            <Target /> Center
          </Button>
          {total > 1 && (
            <Button size="sm" variant="ghost" onClick={onApplyAll} title="Copy these line positions to every image">
              <Copy /> Apply to all
            </Button>
          )}
          <Button
            size="sm"
            variant={previewOpen ? "primary" : "outline"}
            onClick={() => {
              setPreviewOpen((v) => !v);
              setPreview(null);
            }}
          >
            <Eye /> {previewOpen ? "Hide" : "Preview"}
          </Button>
        </div>
      </footer>

      <AnimatePresence initial={false}>
        {previewOpen && (
          <motion.div
            key="preview"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: softSpring, opacity: { duration: 0.2 } }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-4 gap-2 border-t border-[var(--line)] p-3">
              {[0, 1, 2, 3].map((i) => {
                const p = preview?.[i];
                return (
                  <figure key={i} className="flex flex-col gap-1.5">
                    <div className="relative grid aspect-[4/5] place-items-center overflow-hidden rounded-xl bg-[var(--canvas)] ring-1 ring-[var(--line)]">
                      <AnimatePresence mode="popLayout">
                        {p ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <motion.img
                            key={p.url}
                            src={p.url}
                            alt={`Photo ${firstNumber + i}`}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ ...softSpring, delay: i * 0.05 }}
                            className="checker max-h-full max-w-full shadow-sm"
                          />
                        ) : (
                          <motion.div key="skeleton" className="absolute inset-2 animate-pulse rounded-lg bg-[var(--line)]" exit={{ opacity: 0 }} />
                        )}
                      </AnimatePresence>
                    </div>
                    <figcaption className="text-center font-mono text-[10.5px] leading-tight text-[var(--muted)]">
                      <b className="text-[var(--text)]">#{firstNumber + i}</b>
                      {p && (
                        <>
                          {" "}· {p.w}×{p.h}
                          <br />
                          <span className={settings.maxKB && p.kb > settings.maxKB ? "font-semibold text-amber-500" : ""}>
                            {p.kb} KB{settings.maxKB > 0 && p.kb > settings.maxKB && " — over limit"}
                          </span>
                        </>
                      )}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
});

export default ImageCard;
