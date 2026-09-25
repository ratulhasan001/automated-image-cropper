import { resolveFormat, type Lines, type OutputFormat, type ProcessOptions, type RGB, type Shape } from "@/lib/image";

export const APP_NAME = "Yo-Yo Cropper";

export type Item = {
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

export type Settings = {
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

export const DEFAULTS: Settings = {
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

export function processOptions(s: Settings, item: Item): ProcessOptions {
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

export const SETTINGS_KEY = "grid-cropper-settings";
