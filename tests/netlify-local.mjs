// Netlify に あげた ときと おなじ かたちを、この PC の 中に つくる。
//   ・サイトの ファイル（dist/）を そのまま だす
//   ・/api/… は netlify/functions/api.mjs に わたす
//   ・ほぞん先は Netlify Blobs の かわりに メモリ（etag の やくそくも まねる）
// テストから つかう。ほんばんの Netlify では これは つかわない。
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { makeStore, handleRequest } from "../netlify/functions/api.mjs";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png",
};

/** Netlify Blobs と おなじ やくそくの、メモリの 入れもの */
export function memoryBlobs() {
  const data = new Map();
  let seq = 0;
  return {
    async getWithMetadata(key) {
      const v = data.get(key);
      return v ? { data: JSON.parse(v.json), etag: v.etag } : null;
    },
    async get(key) {
      const v = data.get(key);
      return v ? JSON.parse(v.json) : null;
    },
    async list() { return { blobs: [...data.keys()].map((key) => ({ key })) }; },
    async setJSON(key, value, opts = {}) {
      const cur = data.get(key);
      if (opts.onlyIfNew && cur) return { modified: false };
      if (opts.onlyIfMatch && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified: false };
      const etag = `e${++seq}`;
      data.set(key, { json: JSON.stringify(value), etag });
      return { modified: true, etag };
    },
  };
}

export function startNetlifyLocal({ siteDir, port = 8790, appKey = "" } = {}) {
  const store = makeStore(memoryBlobs());
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname.startsWith("/api/")) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const request = new Request(`http://127.0.0.1:${port}${req.url}`, {
        method: req.method,
        ...(chunks.length ? { body: Buffer.concat(chunks), headers: { "Content-Type": "application/json" } } : {}),
      });
      const out = await handleRequest(request, store, appKey);
      const body = await out.text();
      res.writeHead(out.status, Object.fromEntries(out.headers));
      res.end(body);
      return;
    }
    const name = url.pathname === "/" ? "/index.html" : url.pathname;
    try {
      const buf = await readFile(join(siteDir, name));
      res.writeHead(200, { "Content-Type": TYPES[extname(name)] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(buf);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("not found");
    }
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}
