// えいごノートの アイコンを つくる（icon-en.svg と PNG 3まい）。
//
//   node tools/icon-en.mjs
//
// かたちの ていぎは この ファイルに 1つだけ おき、SVG と PNG の
// りょうほうを そこから だす（２つが ずれない ように するため）。
// そとの ライブラリは つかわない（PNG も じぶんで くみたてる）。

import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SIZE = 512;                     // かたちは 512x512 で かんがえる

/* ========== かたちの ていぎ ========== */
const C = {
  paper: "#f4f7fb", grid: "#dbe6f1", ink: "#1f2f45",
  skin: "#a3c53f", edge: "#7d9c2b", face: "#c9e27a", dark: "#233b22", ribbon: "#2b6ca3",
  cheek: "#ff93a5", tongue: "#ff8f7e", shu: "#e4523f", ai: "#2b6ca3", green: "#6f8f3c",
};

const shapes = [];
const rect = (x, y, w, h, fill, alpha = 1) => shapes.push({ t: "rect", x, y, w, h, fill, alpha });
const ellipse = (cx, cy, rx, ry, fill, alpha = 1, rot = 0) => shapes.push({ t: "ellipse", cx, cy, rx, ry, fill, alpha, rot });
const circle = (cx, cy, r, fill, stroke, sw = 0, alpha = 1) => shapes.push({ t: "circle", cx, cy, r, fill, stroke, sw, alpha });
const poly = (pts, fill, alpha = 1) => shapes.push({ t: "poly", pts, fill, alpha });
const line = (pts, w, stroke, alpha = 1) => shapes.push({ t: "line", pts, w, stroke, alpha });

// にじかんすう（カエルの め・くち）を てんの れつに する
function quad(p0, p1, p2, n = 18) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
              u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
  return out;
}
// 3じかんすう（リボンの まるみ）を てんの れつに する
function cubic(p0, p1, p2, p3, n = 14) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
              u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return out;
}
// えんこ（もじの まるみ）を てんの れつに する。たてと よこの はんけいを
// べつべつに できるので、B の ような ひらたい まるみも かける。
function arc(cx, cy, rx, ry, a0, a1, n = 36) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + (a1 - a0) * (i / n)) * Math.PI / 180;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}
const move = (pts, dx, dy, s = 1) => pts.map(([x, y]) => [dx + x * s, dy + y * s]);

/* ---------- 1. ほうがんしの かみ ---------- */
rect(0, 0, 512, 512, C.paper);
for (let v = 96; v < 512; v += 96) {
  rect(0, v - 1.5, 512, 3, C.grid);
  rect(v - 1.5, 0, 3, 512, C.grid);
}

/* ---------- 2. コロちゃん（オリジナルの カエル） ---------- */
// english.html / index.html の frogSVG() と おなじ かたち（100x96 の ざひょう）
const FS = 3.0, FX = 256 - 50 * FS, FY = 236 - 48 * FS;
const fp = ([x, y]) => [FX + x * FS, FY + y * FS];
const fw = (w) => w * FS;
ellipse(...fp([50, 58]), fw(34), fw(28), C.skin);
ellipse(...fp([50, 57]), fw(22), fw(13.8), C.face, 0.9);
line(arc(...fp([50, 58]), fw(34), fw(28), 0, 360), fw(2), C.edge, 0.85);
ellipse(...fp([29, 44]), fw(8), fw(5), "#ffffff", 0.18, -22);
circle(...fp([31, 26]), fw(16), "#ffffff", C.edge, fw(2.6));
circle(...fp([69, 26]), fw(16), "#ffffff", C.edge, fw(2.6));
line(quad([22.5, 29], [31, 17.5], [39.5, 29]).map(fp), fw(4), C.dark);
line(quad([60.5, 29], [69, 17.5], [77.5, 29]).map(fp), fw(4), C.dark);
circle(...fp([45.4, 45.5]), fw(1.8), C.edge, null, 0);
circle(...fp([54.6, 45.5]), fw(1.8), C.edge, null, 0);
ellipse(...fp([50, 60.5]), fw(5.6), fw(3.8), C.tongue);
line(quad([34.5, 51], [50, 66.5], [65.5, 51]).map(fp), fw(3.6), C.dark);
circle(...fp([22.5, 58]), fw(6.4), C.cheek, null, 0, 0.8);
circle(...fp([77.5, 58]), fw(6.4), C.cheek, null, 0, 0.8);
poly([
  ...cubic([50, 84], [43, 76.5], [35, 75.5], [33, 79.5]),
  ...cubic([33, 79.5], [31, 83.5], [33.5, 89], [38.5, 89.5]),
  ...cubic([38.5, 89.5], [43.5, 90], [47.5, 87.5], [50, 84]),
].map(fp), C.ribbon);
poly([
  ...cubic([50, 84], [57, 76.5], [65, 75.5], [67, 79.5]),
  ...cubic([67, 79.5], [69, 83.5], [66.5, 89], [61.5, 89.5]),
  ...cubic([61.5, 89.5], [56.5, 90], [52.5, 87.5], [50, 84]),
].map(fp), C.ribbon);
circle(...fp([50, 84]), fw(4.6), C.ribbon, null, 0);
circle(...fp([48.2, 82.4]), fw(1.5), "#ffffff", null, 0, 0.45);

/* ---------- 3. ABC ---------- */
// 100 の ますの なかで もじを かき、よこに ならべる
const SW = 11;                                  // せんの ふとさ（ますの なか）
const LETTERS = [
  { color: C.shu, paths: [[[18, 86], [50, 14], [82, 86]], [[27, 59], [73, 59]]] },                 // A
  { color: C.ai, paths: [[[22, 14], [22, 86]], arc(22, 32, 23, 18, -90, 90), arc(22, 68, 26, 18, -90, 90)] }, // B
  { color: C.green, paths: [arc(50, 50, 32, 32, 42, 318)] },                                             // C
];
const LS = 1.16, GAP = 16;                      // もじの おおきさと あいだ
const LY = 386;                                 // もじの うえの ばしょ
// もじごとの ひだりはしを そろえてから、よこに ならべる
for (const L of LETTERS) {
  const xs = L.paths.flat().map((p) => p[0]);
  L.x0 = Math.min(...xs) - SW / 2;
  L.x1 = Math.max(...xs) + SW / 2;
}
const totalW = LETTERS.reduce((a, l) => a + (l.x1 - l.x0), 0) + GAP * (LETTERS.length - 1);
let lx = 256 - (totalW * LS) / 2;
for (const L of LETTERS) {
  for (const path of L.paths) line(move(path, lx - L.x0 * LS, LY, LS), SW * LS, L.color);
  lx += (L.x1 - L.x0 + GAP) * LS;
}

/* ========== SVG に する ========== */
const f = (v) => Number(v.toFixed(2));
const d = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${f(x)} ${f(y)}`).join(" ");
function toSVG() {
  const body = shapes.map((s) => {
    const op = s.alpha < 1 ? ` opacity="${s.alpha}"` : "";
    if (s.t === "rect") return `<rect x="${f(s.x)}" y="${f(s.y)}" width="${f(s.w)}" height="${f(s.h)}" fill="${s.fill}"${op}/>`;
    if (s.t === "ellipse") {
      const rot = s.rot ? ` transform="rotate(${f(s.rot)} ${f(s.cx)} ${f(s.cy)})"` : "";
      return `<ellipse cx="${f(s.cx)}" cy="${f(s.cy)}" rx="${f(s.rx)}" ry="${f(s.ry)}" fill="${s.fill}"${op}${rot}/>`;
    }
    if (s.t === "circle") return `<circle cx="${f(s.cx)}" cy="${f(s.cy)}" r="${f(s.r)}" fill="${s.fill}"${s.sw ? ` stroke="${s.stroke}" stroke-width="${f(s.sw)}"` : ""}${op}/>`;
    if (s.t === "poly") return `<path d="${d(s.pts)}Z" fill="${s.fill}"${op}/>`;
    return `<path d="${d(s.pts)}" fill="none" stroke="${s.stroke}" stroke-width="${f(s.w)}" stroke-linecap="round" stroke-linejoin="round"${op}/>`;
  }).join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="えいごノート">
  ${body}
</svg>
`;
}

/* ========== PNG に する ========== */
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const distSeg = (px, py, ax, ay, bx, by) => {
  const vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
  const len = vx * vx + vy * vy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / len));
  const dx = wx - t * vx, dy = wy - t * vy;
  return Math.sqrt(dx * dx + dy * dy);
};
function bbox(s) {
  if (s.t === "rect") return [s.x, s.y, s.x + s.w, s.y + s.h];
  if (s.t === "ellipse") {
    const r = Math.max(s.rx, s.ry);
    return [s.cx - r, s.cy - r, s.cx + r, s.cy + r];
  }
  if (s.t === "circle") { const r = s.r + s.sw / 2; return [s.cx - r, s.cy - r, s.cx + r, s.cy + r]; }
  const pad = s.t === "line" ? s.w / 2 + 1 : 1;
  const xs = s.pts.map((p) => p[0]), ys = s.pts.map((p) => p[1]);
  return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
}
function hit(s, x, y) {
  if (s.t === "rect") return x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h ? s.fill : null;
  if (s.t === "ellipse") {
    let dx = x - s.cx, dy = y - s.cy;
    if (s.rot) {                                   // かたむいた だえんは てんの ほうを もどして みる
      const r = (-s.rot * Math.PI) / 180, c = Math.cos(r), n = Math.sin(r);
      [dx, dy] = [dx * c - dy * n, dx * n + dy * c];
    }
    const a = dx / s.rx, b = dy / s.ry;
    return a * a + b * b <= 1 ? s.fill : null;
  }
  if (s.t === "circle") {
    const r = Math.hypot(x - s.cx, y - s.cy);
    if (s.sw && Math.abs(r - s.r) <= s.sw / 2) return s.stroke;
    return r <= s.r ? s.fill : null;
  }
  if (s.t === "poly") {
    let inside = false;
    for (let i = 0, j = s.pts.length - 1; i < s.pts.length; j = i++) {
      const [xi, yi] = s.pts[i], [xj, yj] = s.pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside ? s.fill : null;
  }
  for (let i = 1; i < s.pts.length; i++) {
    if (distSeg(x, y, s.pts[i - 1][0], s.pts[i - 1][1], s.pts[i][0], s.pts[i][1]) <= s.w / 2) return s.stroke;
  }
  return null;
}

function render(size, ss = 3) {
  const n = size * ss, k = size / SIZE * ss;      // 512 の ざひょう -> サブピクセル
  const buf = new Float32Array(n * n * 3).fill(255);
  for (const s of shapes) {
    const [bx0, by0, bx1, by1] = bbox(s).map((v) => v * k);
    const x0 = Math.max(0, Math.floor(bx0)), x1 = Math.min(n - 1, Math.ceil(bx1));
    const y0 = Math.max(0, Math.floor(by0)), y1 = Math.min(n - 1, Math.ceil(by1));
    const rgbCache = new Map();
    const rgbOf = (h) => { if (!rgbCache.has(h)) rgbCache.set(h, hex(h)); return rgbCache.get(h); };
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const col = hit(s, (x + 0.5) / k, (y + 0.5) / k);
        if (!col) continue;
        const [r, g, b] = rgbOf(col);
        const i = (y * n + x) * 3, a = s.alpha;
        buf[i] = buf[i] * (1 - a) + r * a;
        buf[i + 1] = buf[i + 1] * (1 - a) + g * a;
        buf[i + 2] = buf[i + 2] * (1 - a) + b * a;
      }
    }
  }
  // サブピクセルを ならして なめらかに する
  const out = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < ss; dy++) {
        for (let dx = 0; dx < ss; dx++) {
          const i = (((y * ss + dy) * n) + x * ss + dx) * 3;
          r += buf[i]; g += buf[i + 1]; b += buf[i + 2];
        }
      }
      const m = ss * ss, o = (y * size + x) * 3;
      out[o] = Math.round(r / m); out[o + 1] = Math.round(g / m); out[o + 2] = Math.round(b / m);
    }
  }
  return out;
}

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}
function toPNG(size, rgb) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;                 // フィルタなし
    rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ========== かきだす ========== */
writeFileSync(join(OUT, "icon-en.svg"), toSVG());
for (const size of [512, 192, 180]) {
  writeFileSync(join(OUT, `icon-en-${size}.png`), toPNG(size, render(size)));
  console.log(`icon-en-${size}.png`);
}
console.log("icon-en.svg");
