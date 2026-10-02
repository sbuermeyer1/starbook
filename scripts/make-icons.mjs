// Writes the app icons as PNGs with no image library (native image DLLs are blocked on
// some Windows machines): a white star on brand red, rasterized with 4x4 supersampling.
//   node scripts/make-icons.mjs
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const OUT = path.resolve(import.meta.dirname, '..', 'public', 'icons')
const RED = [0xb3, 0x12, 0x2a]
const WHITE = [0xff, 0xff, 0xff]

// Five-pointed star centred on (cx, cy), pointing up.
function star(cx, cy, outer) {
  const inner = outer * 0.382
  const pts = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return pts
}

function inPolygon(x, y, pts) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function inRoundedSquare(x, y, size, radius) {
  const cx = Math.min(Math.max(x, radius), size - radius)
  const cy = Math.min(Math.max(y, radius), size - radius)
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2
}

// starScale: star radius as a fraction of the icon; corner: rounded-corner radius fraction (0 = full bleed).
function render(size, { starScale, corner }) {
  const S = 4
  const pts = star(size / 2, size / 2 + size * 0.03, size * starScale)
  const px = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0
      let fg = 0
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const fx = x + (sx + 0.5) / S
          const fy = y + (sy + 0.5) / S
          if (corner === 0 || inRoundedSquare(fx, fy, size, size * corner)) {
            bg++
            if (inPolygon(fx, fy, pts)) fg++
          }
        }
      }
      const i = (y * size + x) * 4
      const a = bg / (S * S)
      const t = bg ? fg / bg : 0
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(RED[c] * (1 - t) + WHITE[c] * t)
      px[i + 3] = Math.round(a * 255)
    }
  }
  return encodePng(size, size, px)
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

fs.mkdirSync(OUT, { recursive: true })
const icons = {
  'icon-192.png': render(192, { starScale: 0.36, corner: 0.22 }),
  'icon-512.png': render(512, { starScale: 0.36, corner: 0.22 }),
  // Maskable: full bleed, star kept inside the 80% safe zone that launchers may crop to.
  'maskable-512.png': render(512, { starScale: 0.28, corner: 0 }),
  // iOS applies its own rounding, so no transparency.
  'apple-touch-icon.png': render(180, { starScale: 0.34, corner: 0 }),
}
for (const [name, png] of Object.entries(icons)) fs.writeFileSync(path.join(OUT, name), png)
console.log(`wrote ${Object.keys(icons).join(', ')} to ${path.relative(process.cwd(), OUT)}`)
