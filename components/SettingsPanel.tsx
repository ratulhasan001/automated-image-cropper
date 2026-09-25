"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { OutputFormat } from "@/lib/image";
import type { Settings } from "@/lib/settings";
import { Field, Segmented, Switch, softSpring } from "./ui";

const SHAPES = [
  { value: "original", label: "Original" },
  { value: "1:1", label: "1:1" },
  { value: "4:5", label: "4:5" },
  { value: "3:4", label: "3:4" },
  { value: "2:3", label: "2:3" },
  { value: "exact", label: "Exact" },
] as const;

const FORMATS = [
  { value: "original", label: "Original" },
  { value: "image/png", label: "PNG" },
  { value: "image/jpeg", label: "JPG" },
  { value: "image/webp", label: "WebP" },
] as const;

const BACKGROUNDS = [
  { value: "keep", label: "Keep" },
  { value: "white", label: "Pure white" },
  { value: "transparent", label: "Transparent" },
] as const;

function summary(s: Settings) {
  const shape = s.shape === "exact" ? `${s.exactW}×${s.exactH}` : s.shape === "original" ? "Original size" : s.shape;
  const fmt = FORMATS.find((f) => f.value === s.format)?.label ?? "";
  return [
    s.layout === "folders" ? "Folder per product" : "Continuous numbers",
    shape,
    s.bgMode === "keep" ? null : s.bgMode === "white" ? "White bg" : "Transparent",
    fmt === "Original" ? "Original format" : fmt,
    s.maxKB ? `≤ ${s.maxKB} KB` : null,
  ].filter(Boolean) as string[];
}

export default function SettingsPanel({ settings, onChange }: { settings: Settings; onChange: (p: Partial<Settings>) => void }) {
  const [open, setOpen] = useState(true);
  const int = (v: string) => Math.max(0, parseInt(v) || 0);
  const lossy = settings.format !== "image/png";
  const group = "flex flex-col gap-3.5 rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)]/60 p-4";
  const heading = "flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]";
  const dot = "h-1.5 w-1.5 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)]";

  return (
    <motion.section layout transition={softSpring} className="glass overflow-hidden rounded-3xl shadow-[var(--shadow)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold">Output settings</span>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          <AnimatePresence initial={false}>
            {!open &&
              summary(settings).map((t) => (
                <motion.span
                  key={t}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)]"
                >
                  {t}
                </motion.span>
              ))}
          </AnimatePresence>
        </div>
        <motion.svg animate={{ rotate: open ? 180 : 0 }} transition={softSpring} width="18" height="18" viewBox="0 0 24 24" className="text-[var(--muted)]">
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </motion.svg>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: softSpring, opacity: { duration: 0.2 } }}
          >
            <div className="grid gap-3 px-5 pb-5 md:grid-cols-2 xl:grid-cols-4">
              {/* Naming */}
              <div className={group}>
                <div className={heading}><span className={dot} />Naming</div>
                <Segmented
                  value={settings.layout}
                  onChange={(layout) => onChange({ layout })}
                  options={[
                    { value: "folders", label: "Folder per product" },
                    { value: "flat", label: "Continuous" },
                  ]}
                />
                <p className="-mt-1 font-mono text-[11px] text-[var(--muted)]">
                  {settings.layout === "folders"
                    ? `${settings.prefix}product-${String(settings.startNumber).padStart(2, "0")}/${settings.prefix}1…${settings.perProduct * 4}`
                    : `${settings.prefix}${settings.startNumber}, ${settings.prefix}${settings.startNumber + 1}, …`}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={settings.layout === "folders" ? "First product #" : "Start at"}>
                    <input type="number" min={0} className="field" value={settings.startNumber} onChange={(e) => onChange({ startNumber: int(e.target.value) })} />
                  </Field>
                  <Field label="Images / product">
                    <input type="number" min={1} className="field" value={settings.perProduct} onChange={(e) => onChange({ perProduct: Math.max(1, int(e.target.value)) })} />
                  </Field>
                </div>
                <Field label="Filename prefix">
                  <input className="field" placeholder="e.g. jacket-" value={settings.prefix} onChange={(e) => onChange({ prefix: e.target.value.replace(/[\\/:*?"<>|]/g, "") })} />
                </Field>
              </div>

              {/* Size & shape */}
              <div className={group}>
                <div className={heading}><span className={dot} />Size &amp; shape</div>
                <Segmented value={settings.shape} onChange={(shape) => onChange({ shape })} options={SHAPES} />
                <AnimatePresence initial={false}>
                  {settings.shape === "exact" && (
                    <motion.div
                      key="exact"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Width px">
                          <input type="number" min={1} className="field" value={settings.exactW} onChange={(e) => onChange({ exactW: Math.max(1, int(e.target.value)) })} />
                        </Field>
                        <Field label="Height px">
                          <input type="number" min={1} className="field" value={settings.exactH} onChange={(e) => onChange({ exactH: Math.max(1, int(e.target.value)) })} />
                        </Field>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                {settings.shape !== "original" && (
                  <Segmented
                    value={settings.fit}
                    onChange={(fit) => onChange({ fit })}
                    options={[
                      { value: "pad", label: "Pad with white" },
                      { value: "fill", label: "Fill (crop edges)" },
                    ]}
                  />
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Max width">
                    <input type="number" min={0} placeholder="No limit" className="field" value={settings.maxW || ""} onChange={(e) => onChange({ maxW: int(e.target.value) })} />
                  </Field>
                  <Field label="Max height">
                    <input type="number" min={0} placeholder="No limit" className="field" value={settings.maxH || ""} onChange={(e) => onChange({ maxH: int(e.target.value) })} />
                  </Field>
                </div>
              </div>

              {/* Background */}
              <div className={group}>
                <div className={heading}><span className={dot} />Background</div>
                <Segmented value={settings.bgMode} onChange={(bgMode) => onChange({ bgMode })} options={BACKGROUNDS} />
                <AnimatePresence initial={false}>
                  {settings.bgMode !== "keep" && (
                    <motion.div key="tol" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <Field
                        label={<span className="flex justify-between">Strength <span className="font-mono text-[var(--text)]">{settings.bgTolerance}</span></span>}
                        hint="Raise if grey shadows remain, lower if product edges get eaten. Check with Preview."
                      >
                        <input type="range" min={10} max={160} value={settings.bgTolerance} onChange={(e) => onChange({ bgTolerance: parseInt(e.target.value) })} />
                      </Field>
                      {settings.bgMode === "transparent" && (settings.format === "image/jpeg" || settings.format === "original") && (
                        <p className="mt-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-600 dark:text-amber-400">
                          JPG can&apos;t be transparent — those photos will be saved as PNG.
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
                <Switch checked={settings.trim} onChange={(trim) => onChange({ trim })} label="Auto-trim empty space" />
                {settings.trim && (
                  <Field label="Trim padding (px)">
                    <input type="number" min={0} className="field" value={settings.trimPadding} onChange={(e) => onChange({ trimPadding: int(e.target.value) })} />
                  </Field>
                )}
              </div>

              {/* Format & file size */}
              <div className={group}>
                <div className={heading}><span className={dot} />Format &amp; file size</div>
                <Segmented value={settings.format} onChange={(format: OutputFormat) => onChange({ format })} options={FORMATS} />
                {lossy && (
                  <Field label={<span className="flex justify-between">Quality (JPG/WebP) <span className="font-mono text-[var(--text)]">{Math.round(settings.quality * 100)}</span></span>}>
                    <input type="range" min={50} max={100} value={Math.round(settings.quality * 100)} onChange={(e) => onChange({ quality: parseInt(e.target.value) / 100 })} />
                  </Field>
                )}
                <Field
                  label="Max file size per photo (KB)"
                  hint={
                    settings.shape === "exact"
                      ? "Exact size is kept, so only quality is lowered — use JPG/WebP for small files."
                      : settings.format === "image/png"
                        ? "PNG is lossless, so it's made smaller by reducing dimensions."
                        : "Lowers quality first, then dimensions if still too big."
                  }
                >
                  <input type="number" min={0} placeholder="No limit" className="field" value={settings.maxKB || ""} onChange={(e) => onChange({ maxKB: int(e.target.value) })} />
                </Field>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
