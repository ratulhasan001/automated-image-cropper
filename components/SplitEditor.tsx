"use client";

import { AnimatePresence, motion } from "motion/react";
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
      <motion.div
        key="loupe"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1, left, top }}
        exit={{ opacity: 0, scale: 0.6 }}
        transition={{ type: "spring", stiffness: 700, damping: 40, mass: 0.5 }}
        className="pointer-events-none absolute z-30 overflow-hidden rounded-full border-[3px] border-white shadow-2xl ring-1 ring-black/20"
        style={{
          width: LOUPE,
          height: LOUPE,
          backgroundImage: `url(${url})`,
          backgroundRepeat: "no-repeat",
          backgroundSize: `${W * ZOOM}px ${H * ZOOM}px`,
          backgroundPosition: `${-px * ZOOM + LOUPE / 2}px ${-py * ZOOM + LOUPE / 2}px`,
          backgroundColor: "#fff",
        }}
      >
        <div className="absolute inset-x-0 h-px bg-[var(--accent-2)]" style={{ top: ly }} />
        <div className="absolute inset-y-0 w-px bg-[var(--accent-2)]" style={{ left: lx }} />
      </motion.div>
    );
  }

  // Lines glide when moved by buttons (Auto / Center / Apply to all) but track the pointer 1:1 while dragging.
  const glide = active ? "none" : "top .5s cubic-bezier(.22,1,.36,1), left .5s cubic-bezier(.22,1,.36,1), height .5s cubic-bezier(.22,1,.36,1)";

  const cut = (key: LineKey, label: string) => {
    const horizontal = key === "h";
    const isActive = active === key;
    const color = horizontal ? "var(--cut-h)" : "var(--cut-v)";
    const style: React.CSSProperties = horizontal
      ? { top: pct(lines.h), transition: glide }
      : key === "vTop"
        ? { left: pct(lines.vTop), top: 0, height: pct(lines.h), transition: glide }
        : { left: pct(lines.vBottom), bottom: 0, height: pct(1 - lines.h), transition: glide };
    return (
      <div
        role="slider"
        aria-label={label}
        aria-orientation={horizontal ? "vertical" : "horizontal"}
        aria-valuenow={Math.round(lines[key] * (horizontal ? naturalHeight : naturalWidth))}
        tabIndex={0}
        className={`group absolute z-20 flex touch-none items-center justify-center outline-none ${
          horizontal ? "inset-x-0 h-6 -translate-y-1/2 cursor-row-resize" : "w-6 -translate-x-1/2 cursor-col-resize"
        }`}
        style={style}
        {...handlers(key)}
      >
        {/* the line */}
        <div
          className={`${horizontal ? "h-[2px] w-full" : "h-full w-[2px]"} transition-[box-shadow] duration-300`}
          style={{
            background: color,
            boxShadow: isActive
              ? `0 0 0 1px rgba(255,255,255,.9), 0 0 14px 2px ${color}`
              : "0 0 0 1px rgba(255,255,255,.75)",
          }}
        />
        {/* the grip */}
        <div
          className={`absolute rounded-full border-2 border-white shadow-lg transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-125 group-focus-visible:scale-125 ${
            horizontal ? "left-1/2 h-3.5 w-11 -translate-x-1/2" : "top-1/2 h-11 w-3.5 -translate-y-1/2"
          } ${isActive ? "scale-125" : ""}`}
          style={{ background: color }}
        >
          <div className={`absolute inset-0 m-auto flex items-center justify-center gap-[2px] ${horizontal ? "flex-row" : "flex-col"}`}>
            {[0, 1, 2].map((d) => (
              <span key={d} className="h-[3px] w-[3px] rounded-full bg-white/80" />
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div ref={box} className="relative w-full select-none" style={{ aspectRatio: `${naturalWidth} / ${naturalHeight}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" draggable={false} className="absolute inset-0 h-full w-full" />

      {quadrants.map((q, i) => (
        <span
          key={i}
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/55 px-2.5 py-0.5 font-mono text-xs font-semibold text-white shadow-lg ring-1 ring-white/25 backdrop-blur-md"
          style={{ left: pct(q.left), top: pct(q.top), transition: glide }}
        >
          {firstNumber + i}
        </span>
      ))}

      {cut("h", "Horizontal split")}
      {cut("vTop", "Vertical split, top row")}
      {cut("vBottom", "Vertical split, bottom row")}

      <AnimatePresence>{loupeEl}</AnimatePresence>
    </div>
  );
}
