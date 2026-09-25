import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "2×2 Grid Cropper",
  description: "Split 2×2 grid product images into 4 separate photos, right in your browser.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
