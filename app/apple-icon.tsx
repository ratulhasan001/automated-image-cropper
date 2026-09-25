import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  const tile = { position: "absolute" as const, width: 44, height: 44, borderRadius: 12, background: "#fff" };
  return new ImageResponse(
    (
      <div style={{ width: 180, height: 180, display: "flex", position: "relative", background: "linear-gradient(135deg,#7C5CFF,#E0479E)" }}>
        <div style={{ ...tile, left: 36, top: 42 }} />
        <div style={{ ...tile, left: 36, top: 98 }} />
        <div style={{ ...tile, left: 92, top: 98 }} />
        <div style={{ ...tile, left: 101, top: 28, opacity: 0.8, transform: "rotate(12deg)" }} />
      </div>
    ),
    size,
  );
}
