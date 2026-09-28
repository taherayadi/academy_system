/**
 * Regenerate brand assets from the new EduSphère emblem.
 * Source: attached JPEG with a #E0E0E0/#FFFFFF checkerboard background.
 * Outputs:
 *   src/assets/icon.png  — 1024×1024, emblem on brand-600 tile (App / Login / Landing / Settings)
 *   src/assets/logo.png  — transparent emblem (BusDriverModule print header)
 *   public/favicon.svg   — vector-style favicon: brand tile + emblem (index.html)
 */
const sharp = require('sharp');

const SRC = 'C:/Users/taher/Downloads/Image 1.jpeg';
const TILE_BG = '#FFFFFF'; // white tile — the emblem already carries the brand teal

async function extractEmblemOnly() {
  const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;

  // Background = checkerboard of two neutral greys; alpha ramp on distance to the nearest shade.
  const shades = [[224, 224, 224], [255, 255, 255]];
  const alpha = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * C;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      let bgDist = Infinity;
      for (const [sr, sg, sb] of shades) {
        const d = Math.sqrt((r - sr) ** 2 + (g - sg) ** 2 + (b - sb) ** 2);
        if (d < bgDist) bgDist = d;
      }
      alpha[y * W + x] = Math.max(0, Math.min(1, (bgDist - 14) / 42));
    }
  }

  // Vertical projection profile → find the biggest empty horizontal band
  // separating the emblem from the "EduSphère / KidoCampus" wordmark.
  const rowCoverage = new Float32Array(H);
  for (let y = 0; y < H; y++) {
    let sum = 0;
    for (let x = 0; x < W; x++) sum += alpha[y * W + x];
    rowCoverage[y] = sum / W;
  }
  let bestGapStart = -1, bestGapLen = 0, curStart = -1;
  for (let y = 0; y < H; y++) {
    if (rowCoverage[y] < 0.005) {
      if (curStart < 0) curStart = y;
    } else {
      if (curStart >= 0 && y - curStart > bestGapLen && curStart > H * 0.3) {
        bestGapLen = y - curStart; bestGapStart = curStart;
      }
      curStart = -1;
    }
  }
  if (curStart >= 0 && H - curStart > bestGapLen && curStart > H * 0.3) {
    bestGapLen = H - curStart; bestGapStart = curStart;
  }
  const cutY = bestGapStart + Math.floor(bestGapLen / 2); // middle of the gap band
  console.log('gap band:', bestGapStart, '→', bestGapStart + bestGapLen, '| cut at y =', cutY);

  // Bbox of opaque pixels above the cut.
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < cutY; y++) {
    for (let x = 0; x < W; x++) {
      if (alpha[y * W + x] > 0.5) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  // 8px breathing room, clamped.
  minX = Math.max(0, minX - 8); minY = Math.max(0, minY - 8);
  maxX = Math.min(W - 1, maxX + 8); maxY = Math.min(cutY - 1, maxY + 8);
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  console.log('emblem bbox:', { minX, minY, maxX, maxY }, bw + 'x' + bh);

  const rgba = Buffer.alloc(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    rgba[p * 4] = data[p * C];
    rgba[p * 4 + 1] = data[p * C + 1];
    rgba[p * 4 + 2] = data[p * C + 2];
    rgba[p * 4 + 3] = Math.round(alpha[p] * 255);
  }
  const emblem = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: minX, top: minY, width: bw, height: bh })
    .png()
    .toBuffer();
  return emblem;
}

(async () => {
  const emblem = await extractEmblemOnly();

  // ── src/assets/icon.png: emblem centered on brand-600 tile ──
  const TILE = 1024;
  const iconSize = Math.round(TILE * 0.74);
  const emblemForIcon = await sharp(emblem)
    .resize(iconSize, iconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const meta = await sharp(emblemForIcon).metadata();
  await sharp({ create: { width: TILE, height: TILE, channels: 4, background: TILE_BG } })
    .composite([{
      input: emblemForIcon,
      left: Math.round((TILE - meta.width) / 2),
      top: Math.round((TILE - meta.height) * 0.46), // slight optical lift
    }])
    .png()
    .toFile('src/assets/icon.png');
  console.log('wrote src/assets/icon.png');

  // ── src/assets/logo.png: transparent emblem for print header ──
  await sharp(emblem)
    .resize(800, 800, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile('src/assets/logo.png');
  console.log('wrote src/assets/logo.png');

  // ── public/favicon.svg: brand tile + raster emblem (data URI) ──
  const RASTER = 160; // 2.5× the 64 viewBox → crisp down to 16px and fine on hi-dpi
  const emblemRaster = await sharp(emblem)
    .resize(RASTER, RASTER, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toBuffer();
  const b64 = emblemRaster.toString('base64');
  const EMBLEM = 47.5; // viewBox units — same 74% ratio as icon.png
  const inset = (64 - EMBLEM) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#FFFFFF"/>
  <image x="${inset}" y="${inset}" width="${EMBLEM}" height="${EMBLEM}" href="data:image/png;base64,${b64}"/>
</svg>
`;
  const { writeFileSync } = require('fs');
  writeFileSync('public/favicon.svg', svg);
  console.log('wrote public/favicon.svg (' + Math.round(svg.length / 1024) + ' KB)');
})().catch((e) => { console.error(e); process.exit(1); });
