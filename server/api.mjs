// さんすうノートの きろく API（本体）
//
// Cloudflare Workers（server/worker.js）と、じぶんの PC で うごかす
// ローカル版（server/dev-server.mjs）の りょうほうから よばれる。
// ここには HTTP の さほうだけを おき、ほぞん先は store（アダプタ）に まかせる。
//
//   store.insertRun(row)        -> true（あたらしく いれた）/ false（すでに ある）
//   store.listRuns({ since })   -> row の はいれつ（ふるい→あたらしい）

export const MODES = ["calc", "word", "clock", "mix"];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DETAIL = 50;      // 1セットの もんだいすうの うわぎり
const MAX_STR = 400;        // もんだい文などの ながさの うわぎり

const ok = (json, status = 200) => ({ status, json });
const bad = (status, error) => ({ status, json: { ok: false, error } });

const clampStr = (v, max = MAX_STR) => String(v ?? "").slice(0, max);
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

/** クライアントから きた 1セットぶんの きろくを たしかめて、ほぞんする かたちに そろえる */
function normalizeRun(raw, now) {
  if (!raw || typeof raw !== "object") return { error: "run が ありません" };
  const name = clampStr(raw.player_name, 40).trim();
  if (!name) return { error: "player_name が ありません" };
  const id = clampStr(raw.id, 64).trim();
  if (!id) return { error: "id が ありません" };
  const playerId = clampStr(raw.player_id, 64).trim();
  if (!playerId) return { error: "player_id が ありません" };
  if (!DAY_RE.test(String(raw.day ?? ""))) return { error: "day は YYYY-MM-DD で おくって ください" };
  if (!isInt(raw.total, 1, 100)) return { error: "total が ただしく ありません" };
  if (!isInt(raw.correct, 0, raw.total)) return { error: "correct が ただしく ありません" };
  if (!isInt(raw.level, 1, 3)) return { error: "level が ただしく ありません" };
  if (!MODES.includes(raw.mode)) return { error: "mode が ただしく ありません" };
  const ts = isInt(raw.ts, 0, now + 86400000) ? raw.ts : now;

  let detail = null;
  if (Array.isArray(raw.detail)) {
    detail = raw.detail.slice(0, MAX_DETAIL).map((q) => ({
      q: clampStr(q?.q), a: clampStr(q?.a, 80), g: clampStr(q?.g, 80), o: q?.o ? 1 : 0,
    }));
  }
  return {
    run: {
      id, player_id: playerId, player_name: name,
      day: raw.day, ts, mode: raw.mode, level: raw.level,
      total: raw.total, correct: raw.correct,
      detail: detail ? JSON.stringify(detail) : null,
      received_at: now,
    },
  };
}

const shiftDay = (day, n) => {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
};

/** 人ごとに まとめる。today は クライアントの ローカル日付 */
export function summarize(rows, today, chartDays = 14) {
  const players = new Map();
  for (const r of rows) {
    let p = players.get(r.player_id);
    if (!p) {
      p = { id: r.player_id, name: r.player_name, sets: 0, total: 0, correct: 0,
            first_day: r.day, last_day: r.day, days: new Map() };
      players.set(r.player_id, p);
    }
    p.name = r.player_name;                       // なまえを かえたら あたらしい ほうを つかう
    p.sets += 1;
    p.total += r.total;
    p.correct += r.correct;
    if (r.day < p.first_day) p.first_day = r.day;
    if (r.day > p.last_day) p.last_day = r.day;
    const d = p.days.get(r.day) || { total: 0, correct: 0, sets: 0 };
    d.total += r.total; d.correct += r.correct; d.sets += 1;
    p.days.set(r.day, d);
  }

  const out = [...players.values()].map((p) => {
    // れんぞく日すう（きょう、なければ きのうから さかのぼる）
    let streak = 0;
    let cursor = p.days.has(today) ? today : shiftDay(today, -1);
    while (p.days.has(cursor)) { streak++; cursor = shiftDay(cursor, -1); }

    const daily = [];
    for (let i = chartDays - 1; i >= 0; i--) {
      const day = shiftDay(today, -i);
      const d = p.days.get(day);
      daily.push({ day, total: d ? d.total : 0, correct: d ? d.correct : 0 });
    }
    const t = p.days.get(today);
    return {
      id: p.id, name: p.name, sets: p.sets, total: p.total, correct: p.correct,
      active_days: p.days.size, streak,
      first_day: p.first_day, last_day: p.last_day,
      today: { total: t ? t.total : 0, correct: t ? t.correct : 0, sets: t ? t.sets : 0 },
      daily,
    };
  });
  // よく やって いる 人を さきに
  out.sort((a, b) => b.today.total - a.today.total || b.total - a.total || a.name.localeCompare(b.name, "ja"));
  return out;
}

export async function handle({ method, path, query = {}, body = null, store, appKey, now = Date.now() }) {
  if (method === "OPTIONS") return { status: 204, json: null };

  if (method === "GET" && path === "/api/health") {
    return ok({ ok: true, need_key: Boolean(appKey), now });
  }

  // あいことばが せっていされて いれば、どの API にも ひつよう
  if (appKey) {
    const given = String(query.key ?? (body && body.key) ?? "");
    if (given !== appKey) return bad(401, "あいことばが ちがいます");
  }

  if (method === "POST" && path === "/api/runs") {
    const { run, error } = normalizeRun(body && body.run, now);
    if (error) return bad(400, error);
    const inserted = await store.insertRun(run);
    return ok({ ok: true, id: run.id, inserted });
  }

  if (method === "GET" && path === "/api/summary") {
    const today = DAY_RE.test(String(query.today ?? "")) ? query.today : new Date(now).toISOString().slice(0, 10);
    const days = isInt(Number(query.days), 1, 90) ? Number(query.days) : 14;
    const since = shiftDay(today, -365);
    const rows = await store.listRuns({ since });
    return ok({ ok: true, today, players: summarize(rows, today, days), sets: rows.length });
  }

  if (method === "GET" && path === "/api/runs") {
    const limit = isInt(Number(query.limit), 1, 200) ? Number(query.limit) : 50;
    const player = query.player ? clampStr(query.player, 64) : null;
    let rows = await store.listRuns({ since: query.since && DAY_RE.test(query.since) ? query.since : null });
    if (player) rows = rows.filter((r) => r.player_id === player);
    rows = rows.slice(-limit).reverse();
    return ok({ ok: true, runs: rows.map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null })) });
  }

  return bad(404, "そんな API は ありません");
}
