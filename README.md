# 2×2 Grid Cropper

Split 2×2 grid product images into 4 separate photos. Runs 100% in the browser (no uploads, no server costs).

## Use
1. Drop / choose / paste any number of grid images (sorted by filename; reorder with ↑ ↓).
2. Cut lines are auto-detected. Drag them if needed (top and bottom rows have separate vertical lines),
   or click a line and nudge with arrow keys (Shift = 10px). A magnifier shows while dragging.
3. Click **Crop & download ZIP**.

Numbering: image 1 → 1–4, image 2 → 5–8, … Every 2 images = 1 product (configurable).
Optionally use "Folder per product" to get `product-01/1..8`, `product-02/1..8`, …

## Run locally
    npm install
    npm run dev   # http://localhost:3000

## Deploy to Vercel
- Push this folder to GitHub, then "Add New Project" on vercel.com and import it (no settings needed), **or**
- `npx vercel` from this folder (then `npx vercel --prod`).
