import { build } from 'esbuild';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('static', 'dist', { recursive: true });
await cp('src/split/split.css', 'dist/split.css');
await mkdir('dist/icons', { recursive: true });
for (const size of [16, 32, 48, 128]) await writeFile(`dist/icons/${size}.png`, icon(size));
await build({
  entryPoints: {
    background: 'src/background/index.ts',
    split: 'src/split/main.ts',
    'pane-boot': 'src/pane-boot/main.ts',
    'drag-bridge': 'src/drag-bridge/main.ts',
    'x-csrf-isolated': 'src/x-csrf/isolated.ts',
    'x-csrf-main': 'src/x-csrf/main.ts',
  },
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  target: 'chrome128',
});

// Simple four-pane mark, generated locally with Node's built-in PNG primitives.
function icon(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + .5) / size, v = (y + .5) / size;
      const col = u < .46 ? 0 : u > .54 ? 1 : -1;
      const row = v < .46 ? 0 : v > .54 ? 1 : -1;
      const inside = u >= .08 && u <= .92 && v >= .08 && v <= .92 && col >= 0 && row >= 0;
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      const color = row === col ? [8, 108, 156] : [122, 191, 218];
      raw[offset] = color[0]; raw[offset + 1] = color[1]; raw[offset + 2] = color[2]; raw[offset + 3] = inside ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const body = Buffer.concat([name, data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
}
