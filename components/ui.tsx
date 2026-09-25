"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { useId } from "react";

export const spring = { type: "spring", stiffness: 420, damping: 34, mass: 0.8 } as const;
export const softSpring = { type: "spring", stiffness: 260, damping: 30 } as const;

type ButtonProps = HTMLMotionProps<"button"> & {
  variant?: "primary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md";
  busy?: boolean;
};

export function Button({ variant = "outline", size = "md", busy, className = "", disabled, ...rest }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-xl font-medium select-none transition-colors disabled:cursor-not-allowed disabled:opacity-45";
  const sizes = { sm: "h-8 px-2.5 text-xs", md: "h-10 px-4 text-sm" };
  const variants = {
    primary: "btn-primary font-semibold",
    ghost: "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]",
    outline: "border border-[var(--line-strong)] bg-[var(--panel-solid)] hover:bg-[var(--hover)] hover:border-[var(--accent)]/40",
    danger: "text-rose-500 hover:bg-rose-500/10",
  };
  return (
    <motion.button
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      transition={spring}
      disabled={disabled}
      data-busy={busy ? "true" : undefined}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    />
  );
}

/** Segmented control with a sliding highlight pill. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = "",
}: {
  value: T;
  options: readonly { value: T; label: React.ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`flex flex-wrap gap-0.5 rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-0.5 ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`relative flex-1 rounded-[10px] px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              active ? "text-white" : "text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={spring}
                className="absolute inset-0 rounded-[10px] shadow-sm"
                style={{ background: "linear-gradient(100deg, var(--accent), var(--accent-2))" }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-300 ${checked ? "bg-[var(--accent)]" : "bg-[var(--line-strong)]"}`}
      >
        <motion.span
          layout
          transition={spring}
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow"
          style={{ left: checked ? 18 : 2 }}
        />
      </button>
      {label}
    </label>
  );
}

export function Field({ label, children, hint }: { label: React.ReactNode; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--muted)]">
      {label}
      {children}
      {hint && <span className="font-normal leading-snug">{hint}</span>}
    </label>
  );
}
