// Generates simple PNG icons for the PWA using Canvas (Node.js with canvas package)
// If canvas is not installed, falls back to creating placeholder files.
const fs = require("fs");
const path = require("path");

const ICONS_DIR = path.join(__dirname, "../public/icons");
const SIZES = [72, 96, 128, 192, 512];

if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

// Try to use canvas; if not available, create minimal valid PNGs
try {
  const { createCanvas } = require("canvas");

  SIZES.forEach((size) => {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");

    // Background
    ctx.fillStyle = "#2563eb";
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, size * 0.2);
    ctx.fill();

    // Emoji suitcase
    ctx.font = `${size * 0.55}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🧳", size / 2, size / 2);

    const buffer = canvas.toBuffer("image/png");
    fs.writeFileSync(path.join(ICONS_DIR, `icon-${size}.png`), buffer);
    console.log(`Generated icon-${size}.png`);
  });
} catch (e) {
  // Fallback: write a minimal valid 1x1 PNG with correct header
  // This is a valid blue 1x1 PNG encoded as base64
  const BLUE_PNG_B64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const pngBuf = Buffer.from(BLUE_PNG_B64, "base64");

  SIZES.forEach((size) => {
    const outPath = path.join(ICONS_DIR, `icon-${size}.png`);
    if (!fs.existsSync(outPath)) {
      fs.writeFileSync(outPath, pngBuf);
      console.log(`Created placeholder icon-${size}.png (install 'canvas' package for real icons)`);
    }
  });
}
