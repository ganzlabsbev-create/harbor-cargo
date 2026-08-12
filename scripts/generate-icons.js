/**
 * Generates favicons / PWA icons / og-image from public/harbor-cargo.png.
 * Runs once during setup (see package.json "postinstall").
 * Safe to re-run any time — it just overwrites public/icons/*.
 */
const path = require("path");
const fs = require("fs");

let sharp;
try {
  sharp = require("sharp");
} catch {
  console.warn("[generate-icons] sharp not installed, skipping icon generation.");
  process.exit(0);
}

const SRC = path.join(__dirname, "..", "public", "harbor-cargo.png");
const OUT_DIR = path.join(__dirname, "..", "public", "icons");

const SIZES = [
  { name: "favicon-16x16.png", size: 16 },
  { name: "favicon-32x32.png", size: 32 },
  { name: "favicon-48x48.png", size: 48 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
];

async function main() {
  if (!fs.existsSync(SRC)) {
    console.warn(`[generate-icons] ${SRC} not found, skipping.`);
    return;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const { name, size } of SIZES) {
    await sharp(SRC)
      .resize(size, size, { fit: "cover" })
      .png()
      .toFile(path.join(OUT_DIR, name));
    console.log(`[generate-icons] wrote icons/${name} (${size}x${size})`);
  }

  const ogSize = { width: 1200, height: 630 };
  const mark = await sharp(SRC).resize(360, 360).png().toBuffer();
  await sharp({
    create: {
      width: ogSize.width,
      height: ogSize.height,
      channels: 4,
      background: { r: 4, g: 13, b: 26, alpha: 1 },
    },
  })
    .composite([{ input: mark, left: (ogSize.width - 360) / 2, top: (ogSize.height - 360) / 2 }])
    .png()
    .toFile(path.join(OUT_DIR, "og-image.png"));
  console.log("[generate-icons] wrote icons/og-image.png");
}

main().catch((err) => {
  console.error("[generate-icons] failed:", err);
  process.exit(0);
});
