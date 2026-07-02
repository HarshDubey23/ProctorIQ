/**
 * Generates a placeholder 1200×630 OG preview image for ProctorIQ.
 * Uses only Node built-ins (zlib for PNG compression).
 *
 * Replace with final artwork when available.
 * Colors match the Aperture Titanium light palette.
 */

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const W = 1200;
const H = 630;

// Brand colors
const SURFACE_0 = [0xee, 0xf0, 0xf0]; // Titanium background
const JADE = [0x0e, 0x6b, 0x5c];       // Signal focus / CTA
const INK_MUTED = [0x8a, 0x8f, 0x94];  // Secondary text
const EDGE_HIGHLIGHT = [0xff, 0xff, 0xff, 0.5];

function crc32(buf) {
  let crc = 0xffffffff;
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c;
  }
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeB, data]);
  const crcVal = crc32(crcData);
  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crcVal);
  return Buffer.concat([len, typeB, data, crcB]);
}

function createPixelData() {
  // RGBA raw data with scanline filter byte (0 = None) per row
  const stride = W * 4 + 1;
  const raw = Buffer.alloc(stride * H);
  for (let y = 0; y < H; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter: None
    for (let x = 0; x < W; x++) {
      const px = rowStart + 1 + x * 4;
      // Background
      raw[px] = SURFACE_0[0];
      raw[px + 1] = SURFACE_0[1];
      raw[px + 2] = SURFACE_0[2];
      raw[px + 3] = 255;

      // Edge highlight at very top
      if (y < 2) {
        raw[px] = EDGE_HIGHLIGHT[0];
        raw[px + 1] = EDGE_HIGHLIGHT[1];
        raw[px + 2] = EDGE_HIGHLIGHT[2];
        raw[px + 3] = Math.round(EDGE_HIGHLIGHT[3] * 255);
      }

      // Bottom accent bar (jade)
      if (y > H - 6) {
        raw[px] = JADE[0];
        raw[px + 1] = JADE[1];
        raw[px + 2] = JADE[2];
        raw[px + 3] = 255;
      }

      // Simple rectangle to represent "aperture" motif
      const cx = W / 2;
      const cy = H / 2 - 20;
      const r = 140;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > r - 18 && dist < r + 6) {
        raw[px] = JADE[0];
        raw[px + 1] = JADE[1];
        raw[px + 2] = JADE[2];
        raw[px + 3] = 180;
      }
    }
  }
  return raw;
}

function buildPNG() {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = chunk('IHDR', ihdr);

  const rawData = createPixelData();
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = chunk('IDAT', compressed);

  const iendChunk = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const png = buildPNG();
const outPath = path.join(__dirname, '..', 'public', 'og-image.png');
fs.writeFileSync(outPath, png);
console.log(`OG image generated: ${outPath} (${png.length} bytes)`);
