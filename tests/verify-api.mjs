import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
const DATA = './tests/.tmp-runs.json';
await rm(DATA, { force: true });
const srv = spawn('node', ['server/dev-server.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: '8787', APP_KEY: 'ひみつ', DATA },
  stdio: ['ignore', 'pipe', 'pipe'],
});
srv.stdout.on('data', d => process.stdout.write('  srv| ' + d));
await new Promise(r => setTimeout(r, 700));
const B = 'http://127.0.0.1:8787';
const results = [];
const check = (name, cond, extra = '') => results.push(`${cond ? 'OK  ' : 'NG  '} ${name}${extra ? ' … ' + extra : ''}`);
const post = (path, obj) => fetch(B + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

const mkRun = (o = {}) => ({
  id: o.id ?? crypto.randomUUID(), player_id: o.pid ?? 'p-kero', player_name: o.name ?? 'はると',
  day: o.day ?? '2026-09-13', ts: o.ts ?? Date.now(), mode: o.mode ?? 'calc', level: o.level ?? 2,
  total: o.total ?? 10, correct: o.correct ?? 8,
  detail: [{ q: '12 ＋ 34', a: '46', g: '46', o: 1 }],
});

// health
let r = await fetch(B + '/api/health'); let j = await r.json();
check('health は あいことばなしで みられる', r.status === 200 && j.need_key === true);
// あいことば なし → 401
r = await post('/api/runs', { run: mkRun() });
check('あいことばなしの そうしんは ことわる', r.status === 401, `status=${r.status}`);
// あいことば ちがい → 401
r = await post('/api/runs', { key: 'ちがう', run: mkRun() });
check('あいことばが ちがうと ことわる', r.status === 401);
// せいじょう
const id1 = crypto.randomUUID();
r = await post('/api/runs', { key: 'ひみつ', run: mkRun({ id: id1 }) }); j = await r.json();
check('ただしい きろくは ほぞんされる', r.status === 200 && j.inserted === true, JSON.stringify(j));
// おなじ ID → じゅうふく しない
r = await post('/api/runs', { key: 'ひみつ', run: mkRun({ id: id1 }) }); j = await r.json();
check('おなじ ID は じゅうふく しない', r.status === 200 && j.inserted === false);
// ふせいな あたい
for (const [name, run] of [
  ['correct > total を ことわる', mkRun({ total: 10, correct: 11 })],
  ['level 9 を ことわる', mkRun({ level: 9 })],
  ['mode が へんなのを ことわる', mkRun({ mode: 'hack' })],
  ['day の かたちを ことわる', mkRun({ day: '2026/09/13' })],
  ['なまえが からを ことわる', mkRun({ name: '   ' })],
]) {
  r = await post('/api/runs', { key: 'ひみつ', run }); j = await r.json();
  check(name, r.status === 400, j.error);
}
// おおきすぎる データ
r = await post('/api/runs', { key: 'ひみつ', run: mkRun({}), pad: 'あ'.repeat(40000) });
check('おおきすぎる そうしんを ことわる', r.status === 413, `status=${r.status}`);
// ふたりぶん・ふくすう日
const days = ['2026-09-13', '2026-09-12', '2026-09-11', '2026-09-09'];
for (const d of days) {
  await post('/api/runs', { key: 'ひみつ', run: mkRun({ pid: 'p-kero', name: 'はると', day: d, correct: 7 }) });
}
for (const d of ['2026-09-13', '2026-09-13', '2026-09-10']) {
  await post('/api/runs', { key: 'ひみつ', run: mkRun({ pid: 'p-koro', name: 'さくら', day: d, correct: 10 }) });
}
r = await fetch(`${B}/api/summary?key=ひみつ&today=2026-09-13`); j = await r.json();
const kero = j.players.find(p => p.id === 'p-kero'), koro = j.players.find(p => p.id === 'p-koro');
check('人ごとに わかれて いる', j.players.length === 2, `players=${j.players.length}`);
check('はるとの セット数', kero.sets === 5, `sets=${kero.sets}`);
check('はるとの れんぞく日すう=3', kero.streak === 3, `streak=${kero.streak}`);
check('さくらの きょうは 2セット', koro.today.sets === 2 && koro.today.total === 20, JSON.stringify(koro.today));
check('さくらの れんぞく日すう=1', koro.streak === 1, `streak=${koro.streak}`);
check('14日ぶんの グラフ データ', kero.daily.length === 14 && kero.daily.at(-1).day === '2026-09-13');
// きょうの もんだいすうは どちらも 20。つぎの きじゅん（つうさん）で はるとが さき
check('ならびは きょう→つうさんの おおい 人が さき', j.players[0].id === 'p-kero' && kero.today.total === 20 && koro.today.total === 20,
  j.players.map(p => `${p.name}(きょう${p.today.total}/つうさん${p.total})`).join(', '));
// runs（人で しぼる）
r = await fetch(`${B}/api/runs?key=ひみつ&player=p-koro&limit=5`); j = await r.json();
check('人で しぼって とりだせる', j.runs.length === 3 && j.runs.every(x => x.player_id === 'p-koro'), `n=${j.runs.length}`);
check('1もんごとの なかみも かえってくる', Array.isArray(j.runs[0].detail) && j.runs[0].detail[0].q === '12 ＋ 34');
// ない API
r = await fetch(B + '/api/nope?key=ひみつ');
check('しらない API は 404', r.status === 404);

console.log('\n' + results.join('\n'));
console.log(`\n${results.filter(x => x.startsWith('NG')).length} けんの しっぱい`);
srv.kill();
