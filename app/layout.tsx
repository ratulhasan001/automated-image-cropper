import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Yo-Yo Cropper",
  description: "Split 2×2 grid product images into 4 separate, numbered photos — right in your browser.",
  applicationName: "Yo-Yo Cropper",
  appleWebApp: { title: "Yo-Yo Cropper", capable: true, statusBarStyle: "black-translucent" },
  openGraph: { title: "Yo-Yo Cropper", description: "Split 2×2 grids into clean, numbered product photos.", type: "website" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b12" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
