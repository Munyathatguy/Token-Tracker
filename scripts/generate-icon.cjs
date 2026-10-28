// Reproducible original icon using only Node standard libraries.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const n = 256,
  raw = Buffer.alloc((n * 4 + 1) * n);
for (let y = 0; y < n; y++)
  for (let x = 0; x < n; x++) {
    const i = y * (n * 4 + 1) + 1 + x * 4;
    const X = x / 4,
      Y = y / 4;
    const d = Math.hypot(X - 31.5, Y - 31.5);
    let c = [23, 42, 60, 255];
    if (d > 30) c = [0, 0, 0, 0];
    else if (d > 24 && d < 28) c = [146, 195, 233, 255];
    else if (
      (X >= 17 && X <= 46 && Y >= 23 && Y <= 28) ||
      (X >= 17 && X <= 37 && Y >= 36 && Y <= 41)
    )
      c = [146, 195, 233, 255];
    raw.set(c, i);
  }
function crc(b) {
  let c = 0xffffffff;
  for (const x of b) {
    c ^= x;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type),
    len = Buffer.alloc(4),
    check = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  check.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, check]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(n, 0);
header.writeUInt32BE(n, 4);
header[8] = 8;
header[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", header),
  chunk("IDAT", zlib.deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);
const dir = path.join(__dirname, "..", "assets");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "icon.png"), png);
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico[6] = 0;
ico[7] = 0;
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(dir, "icon.ico"), Buffer.concat([ico, png]));
