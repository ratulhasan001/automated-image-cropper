import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Yo-Yo Cropper",
    short_name: "Yo-Yo Cropper",
    description: "Split 2×2 grid product images into 4 separate, numbered photos.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0b12",
    theme_color: "#7C5CFF",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
