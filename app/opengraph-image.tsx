import { ImageResponse } from "next/og";

export const alt = "Yo-Yo Cropper — split 2×2 grids into product photos";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  const tile = { position: "absolute" as const, width: 96, height: 96, borderRadius: 24, background: "#fff" };
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 72,
          padding: "0 96px",
          background: "radial-gradient(circle at 20% 20%, #2a1f5c 0%, #0b0b12 60%)",
          color: "#fff",
        }}
      >
        <div style={{ width: 280, height: 280, borderRadius: 72, position: "relative", display: "flex", background: "linear-gradient(135deg,#7C5CFF,#E0479E)" }}>
          <div style={{ ...tile, left: 40, top: 56 }} />
          <div style={{ ...tile, left: 40, top: 160 }} />
          <div style={{ ...tile, left: 144, top: 160 }} />
          <div style={{ ...tile, left: 152, top: 40, opacity: 0.85, transform: "rotate(12deg)" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -3 }}>Yo-Yo Cropper</div>
          <div style={{ fontSize: 36, color: "#c9c3ff", maxWidth: 640 }}>Split 2×2 grids into clean, numbered product photos — right in your browser.</div>
        </div>
      </div>
    ),
    size,
  );
}
