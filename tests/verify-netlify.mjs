// Netlify ばんの きろくサーバー（netlify/functions/api.mjs）を たしかめる。
//
// Netlify に あげないと ほんとうの Blobs は つかえないので、**Blobs と おなじ やくそくで
// うごく にせものの Store**（etag つきの 入れもの）を つくって、そこに つないで ためす。
// ここで 見て いるのは 自分で 書いた ところ ——
//   ・1か月ぶんを 1つの JSON に する キーの つくりかた
//   ・おなじ セットを 2かい おくっても ふえない こと
//   ・**2台から 同時に とどいても 消えない こと**（etag を みて 書きなおす）
//   ・/api/health・/api/runs・/api/summary が かえす かたち
//   ・あいことば（APP_KEY）
// つかいかた: node tests/verify-netlify.mjs （リポジトリの ルートで）
import { makeStore, handleRequest } from "../netlify/functions/api.mjs";

const results = [];
const check = (n, c, x = "") => results.push(`${c ? "OK  " : "NG  "} ${n}${x ? " … " + x : ""}`);

/** Netlify Blobs と おなじ やくそくの にせもの。
 *  onBeforeWrite を いれると「ほかの端末が さきに 書いた」を つくれる。 */
function fakeBlobs(onBeforeWrite = null) {
  const data = new Map();                 // key -> { json, etag }
  let seq = 0;
  const api = {
    writes: 0, conflicts: 0,
    async getWithMetadata(key) {
      const v = data.get(key);
      return v ? { data: JSON.parse(v.json), etag: v.etag } : null;
    },
    async get(key) {
      const v = data.get(key);
      return v ? JSON.parse(v.json) : null;
    },
    async list() {
      return { blobs: [...data.keys()].map((key) => ({ key })) };
    },
    async setJSON(key, value, opts = {}) {
      if (onBeforeWrite) await onBeforeWrite(key, data, () => `e${++seq}`);
      const cur = data.get(key);
      if (opts.onlyIfNew && cur) { api.conflicts++; return { modified: false }; }
      if (opts.onlyIfMatch && (!cur || cur.etag !== opts.onlyIfMatch)) { api.conflicts++; return { modified: false }; }
      const etag = `e${++seq}`;
      data.set(key, { json: JSON.stringify(value), etag });
      api.writes++;
      return { modified: true, etag };
    },
    _raw: data,
  };
  return api;
}

const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const TODAY = ymd(Date.now());
const DAY = 86400000;

let n = 0;
const mkRun = (over = {}) => ({
  id: `r${++n}`, player_id: "n:はると", player_name: "はると",
  day: TODAY, ts: Date.now(), mode: "calc", level: 2, total: 10, correct: 8,
  detail: [{ q: "11+22", a: "33", g: "33", o: 1 }],
  ...over,
});

// にせものの Store に つないで、URL を たたく
function makeCall(blobs, appKey = "") {
  const store = makeStore(blobs);
  return async (method, path, body = null) => {
    const req = new Request(`https://example.netlify.app${path}`, {
      method,
      ...(body ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
    });
    const res = await handleRequest(req, store, appKey);
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  };
}

try {
  // ===== 1) げんき かどうか =====
  {
    const call = makeCall(fakeBlobs());
    const r = await call("GET", "/api/health");
    check("/api/health が こたえる", r.status === 200 && r.json.ok === true, JSON.stringify(r.json));
    check("あいことばが いらない ことを つたえる", r.json.need_key === false, String(r.json.need_key));
  }

  // ===== 2) おくって、とってくる =====
  {
    const blobs = fakeBlobs();
    const call = makeCall(blobs);
    const run = mkRun();
    let r = await call("POST", "/api/runs", { run });
    check("きろくを おくれる", r.status === 200 && r.json.inserted === true, JSON.stringify(r.json));

    // おなじ id を もう いちど（たんまつが おくりなおした とき）
    r = await call("POST", "/api/runs", { run });
    check("おなじ セットを 2かい おくっても ふえない",
      r.status === 200 && r.json.inserted === false, JSON.stringify(r.json));

    r = await call("GET", "/api/runs?limit=50");
    check("おくった きろくが とってこられる", r.status === 200 && r.json.runs.length === 1,
      `${r.json.runs?.length}件`);
    check("1もんごとの なかみも かえって くる",
      r.json.runs[0].detail?.[0]?.q === "11+22", JSON.stringify(r.json.runs[0].detail));
    check("1か月ぶんを 1つの JSON に して いる",
      [...blobs._raw.keys()].join(",") === TODAY.slice(0, 7), [...blobs._raw.keys()].join(","));
  }

  // ===== 3) おかしな データは うけとらない =====
  {
    const call = makeCall(fakeBlobs());
    const bad = [
      ["mode を しらない", mkRun({ mode: "そんなの ない" })],
      ["total が 0", mkRun({ total: 0 })],
      ["correct が total より おおい", mkRun({ total: 10, correct: 11 })],
      ["day の かたちが ちがう", mkRun({ day: "2026/09/20" })],
      ["なまえが ない", mkRun({ player_name: "" })],
    ];
    let ng = 0;
    for (const [, run] of bad) {
      const r = await call("POST", "/api/runs", { run });
      if (r.status !== 400) ng++;
    }
    check("おかしな データは 400で ことわる", ng === 0, `${ng}件 とおって しまった`);
  }

  // ===== 4) 2台から 同時に とどいても 消えない（ここが いちばん こわれやすい） =====
  {
    // 1回目の 書きこみの 直前に、ほかの端末が さきに 書いた ことに する
    let interfered = false;
    const blobs = fakeBlobs(async (key, data, nextEtag) => {
      if (interfered) return;
      interfered = true;
      // ほぞんずみの 行は detail が 文字れつ（normalizeRun が そうする）
      const other = { ...mkRun({ id: "other-device" }), detail: JSON.stringify([{ q: "1+1", a: "2", g: "2", o: 1 }]) };
      const cur = data.get(key);
      const rows = cur ? JSON.parse(cur.json) : [];
      data.set(key, { json: JSON.stringify([...rows, other]), etag: nextEtag() });
    });
    const call = makeCall(blobs);
    const r = await call("POST", "/api/runs", { run: mkRun({ id: "mine" }) });
    check("ぶつかっても おくれる", r.status === 200 && r.json.inserted === true, JSON.stringify(r.json));
    check("ぶつかった ことに 気づいて 書きなおして いる", blobs.conflicts >= 1, `${blobs.conflicts}回 やりなおした`);

    const got = await call("GET", "/api/runs?limit=50");
    const ids = got.json.runs.map((x) => x.id).sort();
    check("**ほかの端末の きろくが 消えて いない**",
      ids.includes("mine") && ids.includes("other-device"), ids.join(","));
  }

  // ===== 5) 何か月にも またがっても まとめて とれる =====
  {
    const blobs = fakeBlobs();
    const call = makeCall(blobs);
    const days = [0, 40, 80].map((back) => ymd(Date.now() - back * DAY));
    for (const day of days) {
      await call("POST", "/api/runs", { run: mkRun({ day, ts: new Date(day).getTime() }) });
    }
    check("月を またいで べつの JSON に なる", blobs._raw.size === new Set(days.map((d) => d.slice(0, 7))).size,
      [...blobs._raw.keys()].join(","));
    const r = await call("GET", "/api/runs?limit=50");
    check("月を またいでも ぜんぶ とれる", r.json.runs.length === 3, `${r.json.runs.length}件`);
    check("あたらしい ものから ならぶ",
      r.json.runs[0].day === days[0] && r.json.runs[2].day === days[2],
      r.json.runs.map((x) => x.day).join(" / "));
  }

  // ===== 6) みんなの きろく（summary） =====
  {
    const call = makeCall(fakeBlobs());
    for (const [name, correct] of [["はると", 9], ["はると", 7], ["さくら", 5]]) {
      await call("POST", "/api/runs", {
        run: mkRun({ player_id: `n:${name.toLowerCase()}`, player_name: name, correct }),
      });
    }
    const r = await call("GET", `/api/summary?today=${TODAY}&days=14`);
    check("/api/summary が 人ごとに まとめる", r.status === 200 && r.json.players.length === 2,
      `${r.json.players?.length}人`);
    const haruto = r.json.players.find((p) => p.name === "はると");
    check("その人の きょうの せいかいを かぞえて いる",
      haruto && haruto.today.correct === 16 && haruto.today.total === 20,
      JSON.stringify(haruto?.today));
    check("グラフは 14日ぶん かえる", haruto?.daily.length === 14, `${haruto?.daily.length}日`);
  }

  // ===== 7) あいことば =====
  {
    const blobs = fakeBlobs();
    const call = makeCall(blobs, "あいことば");
    let r = await call("GET", "/api/health");
    check("あいことばが いる ことを health で つたえる", r.json.need_key === true, String(r.json.need_key));
    r = await call("POST", "/api/runs", { run: mkRun() });
    check("あいことば なしは 401", r.status === 401, String(r.status));
    r = await call("POST", "/api/runs", { key: "ちがう", run: mkRun() });
    check("ちがう あいことばも 401", r.status === 401, String(r.status));
    r = await call("POST", "/api/runs", { key: "あいことば", run: mkRun() });
    check("あって いれば とおる", r.status === 200 && r.json.inserted === true, String(r.status));
  }

  // ===== 8) しらない URL =====
  {
    const call = makeCall(fakeBlobs());
    const r = await call("GET", "/api/そんなの");
    check("しらない API は 404", r.status === 404, String(r.status));
  }

  // ===== 9) ほぞんに しっぱいしたら 500（たんまつは outbox に のこして やりなおす） =====
  {
    const blobs = fakeBlobs();
    blobs.setJSON = async () => { throw new Error("blobs down"); };
    const call = makeCall(blobs);
    const r = await call("POST", "/api/runs", { run: mkRun() });
    check("ほぞんに しっぱいしたら 500（400では ない）", r.status === 500, String(r.status));
  }

  console.log("\n" + results.join("\n"));
  const ng = results.filter((r) => r.startsWith("NG")).length;
  console.log(`\nしっぱい ${ng}件`);
  if (ng) process.exitCode = 1;
} catch (e) {
  console.log("!! とまった:", e.stack.split("\n").slice(0, 3).join("\n"));
  console.log(results.join("\n"));
  process.exitCode = 1;
}
