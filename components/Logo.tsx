"use client";

import { motion } from "motion/react";

/** Brand mark: a 2×2 grid with one tile popping out. `animate` loops the split. */
export default function Logo({ size = 32, animate = false }: { size?: number; animate?: boolean }) {
  const tile = { width: 8, height: 8, rx: 2.2, fill: "#fff" };
  const loop = animate
    ? { repeat: Infinity, repeatType: "mirror" as const, duration: 1.4, ease: [0.65, 0, 0.35, 1] as const, repeatDelay: 0.6 }
    : undefined;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7C5CFF" />
          <stop offset="1" stopColor="#E0479E" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#logo-g)" />
      <motion.rect {...tile} x={6.5} y={7.5} animate={animate ? { x: 5, y: 6 } : undefined} transition={loop} />
      <motion.rect {...tile} x={6.5} y={17.5} animate={animate ? { x: 5, y: 19 } : undefined} transition={loop} />
      <motion.rect {...tile} x={16.5} y={17.5} animate={animate ? { x: 18, y: 19 } : undefined} transition={loop} />
      <motion.rect
        {...tile}
        x={18}
        y={5}
        opacity={0.8}
        style={{ originX: "22px", originY: "9px" }}
        initial={{ rotate: 12 }}
        animate={animate ? { rotate: 0, x: 18, y: 6, opacity: 1 } : undefined}
        transition={loop}
      />
    </svg>
  );
}
