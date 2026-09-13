// じぶんの PC で うごかす ローカルばん（Cloudflare を つかわない ばあい用）。
// ほぞん先は JSON ファイル 1つ。API の なかみは worker.js と おなじ api.mjs。
//
//   node server/dev-server.mjs                       … http://127.0.0.1:8787
//   PORT=9000 APP_KEY=ひみつ DATA=./kiroku.json node server/dev-server.mjs
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { handle } from "./api.mjs";

const PORT = Number(process.env.PORT || 8787);
const DATA = process.env.DATA || "./server-data/runs.json";
const APP_KEY = process.env.APP_KEY || "";
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";
const MAX_BODY = 32 * 1024;

let rows = [];
try {
  rows = JSON.parse(await readFile(DATA, "utf8"));
  if (!Array.isArray(rows)) rows = [];
  console.log(`[さんすうノート] ${DATA} から ${rows.length}件 よみこみました`);
} catch { console.log(`[さんすうノート] ${DATA} は まだ ありません（さいしょの ほぞんで つくります）`); }

let saving = null;
async function persist() {
  // かきこみが かさなっても ファイルが こわれないように じゅんばんに
  saving = (saving ?? Promise.resolve()).then(async () => {
    await mkdir(dirname(DATA), { recursive: true });
    await writeFile(DATA, JSON.stringify(rows, null, 1));
  });
  return saving;
}

const store = {
  async insertRun(run) {
    if (rows.some((r) => r.id === run.id)) return false;   // おなじ ID は いれない
    rows.push(run);
    await persist();
    return true;
  },
  async listRuns({ since }) {
    const list = since ? rows.filter((r) => r.day >= since) : rows;
    return [...list].sort((a, b) => a.ts - b.ts);
  },
};

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
  const headers = {
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  };
  const chunks = [];
  let size = 0, tooBig = false;
  req.on("data", (c) => {
    size += c.length;
    if (size > MAX_BODY) { tooBig = true; return; }
    chunks.push(c);
  });
  req.on("end", async () => {
    if (tooBig) {
      res.writeHead(413, headers);
      return res.end(JSON.stringify({ ok: false, error: "おくる データが おおきすぎます" }));
    }
    let body = null;
    if (chunks.length) { try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { body = null; } }
    try {
      const out = await handle({
        method: req.method, path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body, store, appKey: APP_KEY,
      });
      res.writeHead(out.status, headers);
      res.end(out.json === null ? "" : JSON.stringify(out.json));
    } catch (e) {
      console.error(e);
      res.writeHead(500, headers);
      res.end(JSON.stringify({ ok: false, error: "サーバーの エラー" }));
    }
  });
}).listen(PORT, () => {
  console.log(`[さんすうノート] http://127.0.0.1:${PORT} で まっています`
    + (APP_KEY ? "（あいことば あり）" : "（あいことば なし）"));
});
