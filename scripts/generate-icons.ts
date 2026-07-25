// Generates solid indigo (#4f46e5) PNG icons with white "PW" text
// Uses only Bun built-ins — no external dependencies

import { deflateSync } from "node:zlib";

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, data.length, false);
  const header = new Uint8Array([...len, ...typeBytes]);
  const combined = new Uint8Array([...header, ...data]);
  const crc = crc32(new Uint8Array([...typeBytes, ...data]));
  const crcBytes = new Uint8Array(4);
  new DataView(crcBytes.buffer).setUint32(0, crc, false);
  return new Uint8Array([...combined, ...crcBytes]);
}

function drawCenteredText(
  pixels: Uint8Array,
  width: number,
  height: number,
  text: string,
  r: number, g: number, b: number
) {
  // Simple bitmap font (5x7 pixels per character, fixed-width)
  const font: Record<string, number[]> = {
    'P': [
      0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000
    ],
    'W': [
      0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001
    ],
    ' ': [
      0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000
    ],
  };

  const charW = 6; // 5 + 1 spacing
  const charH = 7;
  const totalTextW = text.length * charW;
  const startX = Math.floor((width - totalTextW) / 2);
  const startY = Math.floor((height - charH) / 2);

  for (let ci = 0; ci < text.length; ci++) {
    const glyph = font[text[ci]] || font[' '];
    const cx = startX + ci * charW;
    for (let row = 0; row < charH; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row] & (1 << (4 - col))) {
          const px = cx + col;
          const py = startY + row;
          if (px >= 0 && px < width && py >= 0 && py < height) {
            const idx = (py * width + px) * 4;
            pixels[idx] = r;
            pixels[idx + 1] = g;
            pixels[idx + 2] = b;
          }
        }
      }
    }
  }
}

function generatePng(size: number): Uint8Array {
  // Create raw RGBA pixel data
  const rawData = new Uint8Array(size * size * 4);
  const bgR = 0x4f, bgG = 0x46, bgE = 0xe5;

  // Fill with indigo background
  for (let i = 0; i < size * size; i++) {
    rawData[i * 4] = bgR;
    rawData[i * 4 + 1] = bgG;
    rawData[i * 4 + 2] = bgE;
    rawData[i * 4 + 3] = 0xff;
  }

  // Scale font: use larger text for larger icon
  if (size >= 192) {
    drawCenteredText(rawData, size, size, 'PW', 0xff, 0xff, 0xff);
  }

  // Apply PNG filter (none = 0) to each row
  const filtered = new Uint8Array(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    filtered[y * (1 + size * 4)] = 0; // filter none
    const src = y * size * 4;
    const dst = y * (1 + size * 4) + 1;
    filtered.set(rawData.subarray(src, src + size * 4), dst);
  }

  const compressed = deflateSync(filtered);

  // Assemble PNG
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = new Uint8Array(13);
  const dv = new DataView(ihdrData.buffer);
  dv.setUint32(0, size, false);
  dv.setUint32(4, size, false);
  dv.setUint8(8, 8); // bit depth
  dv.setUint8(9, 6); // color type RGBA
  dv.setUint8(10, 0); // compression
  dv.setUint8(11, 0); // filter
  dv.setUint8(12, 0); // interlace

  const iendData = new Uint8Array(0);

  const ihdr = pngChunk('IHDR', ihdrData);
  const idat = pngChunk('IDAT', compressed);
  const iend = pngChunk('IEND', iendData);

  return new Uint8Array([...signature, ...ihdr, ...idat, ...iend]);
}

// Generate both sizes
const sizes = [192, 512];
for (const size of sizes) {
  const png = generatePng(size);
  Bun.write(`public/icon-${size}.png`, png);
  console.log(`Generated icon-${size}.png (${png.length} bytes)`);
}
