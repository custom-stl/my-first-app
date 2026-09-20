/* Netlify ばんの きろくサーバー。
 *
 * サイトと おなじ ところ（https://……netlify.app/api/…）で うごくので、
 * べつの サーバーを 立てなくても どの端末からの きろくも 1つに まとまる。
 *
 * HTTP の さほうは server/api.mjs（Cloudflare Workers ばん・ローカルばんと きょうよう）。
 * ここは その「ほぞん先」を Netlify Blobs で つくるだけ。
 *
 * ほぞんの かたち: 1か月ぶんを 1つの JSON に する（`2026-09` → run の はいれつ）。
 *   ・1年ぶん さかのぼっても よみこみは 13こまで。1件ずつ 別の blob に すると
 *     何百回も とりに いく ことに なって、Lambda の じかんぎれに なる。
 *   ・同時に 2台から とどいても 消えない ように、**etag を みて 書く**（CAS）。
 *     ほかの端末が さきに 書いて いたら よみなおして やりなおす。
 */
import { getStore } from "@netlify/blobs";
import { handle } from "../../server/api.mjs";

const STORE = "sn-runs";
const MAX_BODY = 32 * 1024;        // 1回の そうしんの うわぎり
const MAX_PER_MONTH = 5000;        // 1か月に のこす セットの うわぎり（ふるい ものから すてる）
const CAS_TRIES = 6;               // ほかの端末と ぶつかった ときの やりなおし かいすう

const monthOf = (day) => String(day).slice(0, 7);

/** Netlify Blobs の Store を、server/api.mjs が ほしい かたち
 *  （insertRun / listRuns）に つつむ。
 *  store は テストから 入れかえられる ように ひきすうで うけとる。 */
export function makeStore(store) {
  const readMonth = async (key) => {
    const got = await store.getWithMetadata(key, { type: "json" });
    const rows = got && Array.isArray(got.data) ? got.data : [];
    return { rows, etag: got ? got.etag : undefined };
  };

  return {
    async insertRun(run) {
      const key = monthOf(run.day);
      for (let i = 0; i < CAS_TRIES; i++) {
        const { rows, etag } = await readMonth(key);
        if (rows.some((r) => r && r.id === run.id)) return false;   // もう ある
        const next = [...rows, run].slice(-MAX_PER_MONTH);
        const res = await store.setJSON(key, next, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
        if (res.modified) return true;
        // ほかの端末が さきに 書いた。よみなおして やりなおす。
      }
      throw new Error("blob write conflict");
    },

    async listRuns({ since }) {
      let keys;
      if (since) {
        // since の 月から こんげつまで（うるう年などを かんがえずに すむ よう 1日で すすめる）
        keys = [];
        const end = monthOf(new Date().toISOString().slice(0, 10));
        let [y, m] = monthOf(since).split("-").map(Number);
        for (let i = 0; i < 400; i++) {
          const key = `${y}-${String(m).padStart(2, "0")}`;
          keys.push(key);
          if (key >= end) break;
          if (++m > 12) { m = 1; y++; }
        }
      } else {
        const { blobs } = await store.list();
        keys = blobs.map((b) => b.key);
      }
      const months = await Promise.all(keys.map(async (key) => {
        try { const v = await store.get(key, { type: "json" }); return Array.isArray(v) ? v : []; }
        catch { return []; }
      }));
      const rows = months.flat().filter((r) => r && (!since || r.day >= since));
      rows.sort((a, b) => a.ts - b.ts);
      return rows;
    },
  };
}

/** HTTP の うけつけ。ほぞん先を ひきすうで うけとるので テストから そのまま よべる。 */
export async function handleRequest(request, store, appKey = process.env.APP_KEY || "") {
  const url = new URL(request.url);
  const headers = {
    "Access-Control-Allow-Origin": process.env.ALLOW_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

  let body = null;
  if (request.method === "POST") {
    const text = await request.text();
    if (text.length > MAX_BODY) {
      return new Response(JSON.stringify({ ok: false, error: "おくる データが おおきすぎます" }),
        { status: 413, headers });
    }
    try { body = JSON.parse(text); } catch { body = null; }
  }

  let res;
  try {
    res = await handle({
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body,
      store,
      appKey,
    });
  } catch (err) {
    // ほぞんに しっぱいした ときは 500 を かえす。
    // たんまつ側は 500 なら outbox に のこして 次に また おくるので、きろくは 消えない。
    return new Response(JSON.stringify({ ok: false, error: `ほぞんに しっぱいしました: ${err.message}` }),
      { status: 500, headers });
  }

  return new Response(res.json === null ? null : JSON.stringify(res.json), { status: res.status, headers });
}

export default (request) =>
  handleRequest(request, makeStore(getStore({ name: STORE, consistency: "strong" })));

// Netlify Functions v2：この かんすうが /api/… を そのまま うけとる（netlify.toml の
// リダイレクトは いらない）。server/api.mjs が /api/health・/api/runs・/api/summary を 見る。
export const config = { path: "/api/*" };
