"use client";

import { useRef, useState } from "react";
import type { Lines } from "@/lib/image";

type LineKey = keyof Lines;

type Props = {
  url: string;
  naturalWidth: number;
  naturalHeight: number;
  lines: Lines;
  linked: boolean;
  firstNumber: number;
  onChange: (lines: Lines) => void;
};

const LOUPE = 150; // px
const ZOOM = 4;

const clamp = (v: number) => Math.min(0.98, Math.max(0.02, v));

export default function SplitEditor({ url, naturalWidth, naturalHeight, lines, linked, firstNumber, onChange }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<LineKey | null>(null);
  const [loupe, setLoupe] = useState<{ fx: number; fy: number } | null>(null);

  const apply = (key: LineKey, value: number) => {
    const v = clamp(value);
    if (key === "h") onChange({ ...lines, h: v });
    else if (linked) onChange({ ...lines, vTop: v, vBottom: v });
    else onChange({ ...lines, [key]: v });
  };

  const move = (e: React.PointerEvent, key: LineKey) => {
    const rect = box.current!.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    apply(key, key === "h" ? fy : fx);
    setLoupe({ fx: clamp(fx), fy: clamp(fy) });
  };

  const handlers = (key: LineKey) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      setActive(key);
      move(e, key);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (active === key) move(e, key);
    },
    onPointerUp: () => {
      setActive(null);
      setLoupe(null);
    },
    onPointerCancel: () => {
      setActive(null);
      setLoupe(null);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      const size = key === "h" ? naturalHeight : naturalWidth;
      const step = (e.shiftKey ? 10 : 1) / size;
      const dec = key === "h" ? "ArrowUp" : "ArrowLeft";
      const inc = key === "h" ? "ArrowDown" : "ArrowRight";
      if (e.key !== dec && e.key !== inc) return;
      e.preventDefault();
      apply(key, lines[key] + (e.key === inc ? step : -step));
    },
  });

  const pct = (v: number) => `${v * 100}%`;
  const quadrants = [
    { left: lines.vTop / 2, top: lines.h / 2 },
    { left: (1 + lines.vTop) / 2, top: lines.h / 2 },
    { left: lines.vBottom / 2, top: (1 + lines.h) / 2 },
    { left: (1 + lines.vBottom) / 2, top: (1 + lines.h) / 2 },
  ];

  // Loupe: zoomed view of the image around the pointer, with the cut line(s) drawn in.
  let loupeEl = null;
  if (loupe && box.current) {
    const W = box.current.clientWidth, H = box.current.clientHeight;
    const px = loupe.fx * W, py = loupe.fy * H;
    let left = px + 24, top = py - LOUPE - 24;
    if (left + LOUPE > W) left = px - LOUPE - 24;
    if (top < 0) top = py + 24;
    const lx = (lines[loupe.fy < lines.h ? "vTop" : "vBottom"] * W - px) * ZOOM + LOUPE / 2;
    const ly = (lines.h * H - py) * ZOOM + LOUPE / 2;
    loupeEl = (
      <div
        className="pointer-events-none absolute z-30 overflow-hidden rounded-full border-2 border-white shadow-xl ring-1 ring-black/30"
        style={{
          width: LOUPE,
          height: LOUPE,
          left,
          top,
          backgroundImage: `url(${url})`,
          backgroundRepeat: "no-repeat",
          backgroundSize: `${W * ZOOM}px ${H * ZOOM}px`,
          backgroundPosition: `${-px * ZOOM + LOUPE / 2}px ${-py * ZOOM + LOUPE / 2}px`,
          backgroundColor: "#fff",
        }}
      >
        <div className="absolute inset-x-0 h-px bg-rose-500" style={{ top: ly }} />
        <div className="absolute inset-y-0 w-px bg-rose-500" style={{ left: lx }} />
      </div>
    );
  }

  const lineBase = "absolute z-20 flex items-center justify-center touch-none outline-none group";

  return (
    <div ref={box} className="relative w-full select-none" style={{ aspectRatio: `${naturalWidth} / ${naturalHeight}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" draggable={false} className="absolute inset-0 h-full w-full" />

      {quadrants.map((q, i) => (
        <span
          key={i}
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-md bg-black/60 px-2 py-0.5 text-sm font-semibold text-white tabular-nums"
          style={{ left: pct(q.left), top: pct(q.top) }}
        >
          {firstNumber + i}
        </span>
      ))}

      {/* Horizontal line */}
      <div
        role="slider"
        aria-label="Horizontal split"
        aria-valuenow={Math.round(lines.h * naturalHeight)}
        tabIndex={0}
        className={`${lineBase} inset-x-0 h-5 -translate-y-1/2 cursor-row-resize`}
        style={{ top: pct(lines.h) }}
        {...handlers("h")}
      >
        <div className={`h-0.5 w-full ${active === "h" ? "bg-rose-500" : "bg-sky-500 group-hover:bg-rose-500 group-focus-visible:bg-rose-500"} shadow-[0_0_0_1px_rgba(255,255,255,.8)]`} />
        <div className="absolute left-1/2 h-4 w-10 -translate-x-1/2 rounded-full border-2 border-white bg-sky-500 shadow group-hover:bg-rose-500" />
      </div>

      {/* Vertical line, top row */}
      <div
        role="slider"
        aria-label="Vertical split, top row"
        aria-valuenow={Math.round(lines.vTop * naturalWidth)}
        tabIndex={0}
        className={`${lineBase} top-0 w-5 -translate-x-1/2 cursor-col-resize`}
        style={{ left: pct(lines.vTop), height: pct(lines.h) }}
        {...handlers("vTop")}
      >
        <div className={`h-full w-0.5 ${active === "vTop" ? "bg-rose-500" : "bg-amber-500 group-hover:bg-rose-500 group-focus-visible:bg-rose-500"} shadow-[0_0_0_1px_rgba(255,255,255,.8)]`} />
        <div className="absolute top-1/2 h-10 w-4 -translate-y-1/2 rounded-full border-2 border-white bg-amber-500 shadow group-hover:bg-rose-500" />
      </div>

      {/* Vertical line, bottom row */}
      <div
        role="slider"
        aria-label="Vertical split, bottom row"
        aria-valuenow={Math.round(lines.vBottom * naturalWidth)}
        tabIndex={0}
        className={`${lineBase} bottom-0 w-5 -translate-x-1/2 cursor-col-resize`}
        style={{ left: pct(lines.vBottom), height: pct(1 - lines.h) }}
        {...handlers("vBottom")}
      >
        <div className={`h-full w-0.5 ${active === "vBottom" ? "bg-rose-500" : "bg-amber-500 group-hover:bg-rose-500 group-focus-visible:bg-rose-500"} shadow-[0_0_0_1px_rgba(255,255,255,.8)]`} />
        <div className="absolute top-1/2 h-10 w-4 -translate-y-1/2 rounded-full border-2 border-white bg-amber-500 shadow group-hover:bg-rose-500" />
      </div>

      {loupeEl}
    </div>
  );
}
