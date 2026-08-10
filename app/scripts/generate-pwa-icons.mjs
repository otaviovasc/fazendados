// Gera ícones PNG mínimos do PWA (placeholder): quadrado verde-pasto com "F" branco.
// Uso: node scripts/generate-pwa-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");
mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = px(x, y, size);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const PASTURE = [0x3e, 0x6b, 0x42];
const PAPER = [0xfa, 0xf7, 0xf1];

// safeZone: fração da margem interna (maskable exige zona segura ~10%)
function icon({ maskable = false } = {}) {
  return (x, y, size) => {
    const s = maskable ? 0.8 : 1.0; // conteúdo ocupa 80% no maskable
    const off = (1 - s) / 2;
    const u = (x / size - off) / s; // coord normalizada 0..1
    const v = (y / size - off) / s;
    if (u < 0 || u > 1 || v < 0 || v > 1) return PASTURE;
    // "F" em grade: haste vertical + duas hastes horizontais
    const inF =
      (u >= 0.22 && u <= 0.36 && v >= 0.18 && v <= 0.82) ||
      (u >= 0.22 && u <= 0.78 && v >= 0.18 && v <= 0.32) ||
      (u >= 0.22 && u <= 0.64 && v >= 0.43 && v <= 0.57);
    return inF ? PAPER : PASTURE;
  };
}

writeFileSync(join(outDir, "icon-192.png"), png(192, icon()));
writeFileSync(join(outDir, "icon-512.png"), png(512, icon()));
writeFileSync(join(outDir, "icon-maskable-512.png"), png(512, icon({ maskable: true })));
console.log("OK: app/public/icons/{icon-192,icon-512,icon-maskable-512}.png");
