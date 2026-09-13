// Cloudflare Workers ばん。D1（SQLite）に きろくを のこす。
// つかいかたは server/README.md を みて ください。
import { handle } from "./api.mjs";

const MAX_BODY = 32 * 1024;   // 1回の そうしんの うわぎり

const d1Store = (db) => ({
  async insertRun(run) {
    const res = await db.prepare(
      `INSERT OR IGNORE INTO runs
         (id, player_id, player_name, day, ts, mode, level, total, correct, detail, received_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
    ).bind(run.id, run.player_id, run.player_name, run.day, run.ts, run.mode,
           run.level, run.total, run.correct, run.detail, run.received_at).run();
    return (res.meta?.changes ?? 0) > 0;
  },
  async listRuns({ since }) {
    const stmt = since
      ? db.prepare("SELECT * FROM runs WHERE day >= ?1 ORDER BY ts ASC").bind(since)
      : db.prepare("SELECT * FROM runs ORDER BY ts ASC");
    const { results } = await stmt.all();
    return results ?? [];
  },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = {
      "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Cache-Control": "no-store",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

    let body = null;
    if (request.method === "POST") {
      const len = Number(request.headers.get("content-length") || 0);
      if (len > MAX_BODY) {
        return new Response(JSON.stringify({ ok: false, error: "おくる データが おおきすぎます" }),
          { status: 413, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
      }
      try { body = await request.json(); } catch { body = null; }
    }

    const res = await handle({
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body,
      store: d1Store(env.DB),
      appKey: env.APP_KEY || "",
    });

    return new Response(res.json === null ? null : JSON.stringify(res.json), {
      status: res.status,
      headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
    });
  },
};
