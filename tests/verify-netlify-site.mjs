// Netlify に そのまま 出した ときの かたちで、はじめから おわりまで たしかめる。
//   ・サイトと きろくサーバーが おなじ ところに ある（http://127.0.0.1:8790/ と /api/…）
//   ・**URL を なにも 入れなくても** きろくが サーバーに たまる（autoDetectServer）
//   ・べつの たんまつで おなじ なまえを えらぶと、きろくが 1つに まとまる
//   ・サーバーが ない サイト（ただの 静的サイト）では エラーに せず、この たんまつだけで うごく
// つかいかた: node tests/verify-netlify-site.mjs （リポジトリの ルートで）
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  const { execSync } = await import('node:child_process');
  const root = execSync('npm root -g').toString().trim();
  ({ chromium } = await import(`${root}/playwright/index.mjs`));
}
import { startNetlifyLocal } from './netlify-local.mjs';
import { buildSite } from '../scripts/build-site.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';

const OUT = './tests/.tmp-netlify-site';
const PORT = 8790, PLAIN = 8791;
await buildSite(OUT);

const netlify = await startNetlifyLocal({ siteDir: OUT, port: PORT });
// くらべる ための「ただの 静的サイト」（/api が ない）
const plain = createServer(async (req, res) => {
  const name = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    const buf = await readFile(join(OUT, name));
    res.writeHead(200, { 'Content-Type': name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((ok) => plain.listen(PLAIN, '127.0.0.1', ok));

const results = [];
const check = (n, c, x = '') => results.push(`${c ? 'OK  ' : 'NG  '} ${n}${x ? ' … ' + x : ''}`);
const b = await chromium.launch();
const errs = [];

// まっさらな たんまつ。サーバーの URL は **なにも いれない**。
async function device(origin) {
  const ctx = await b.newContext({ viewport: { width: 430, height: 950 } });
  await ctx.addInitScript(`
    class U { constructor(t){ this.text=t;this.onend=null;this.onerror=null; } }
    window.SpeechSynthesisUtterance = U;
    Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
      getVoices:()=>[], speak:()=>{}, cancel:()=>{}, onvoiceschanged:null }});
    try {
      localStorage.setItem('sn-players', JSON.stringify(['はると']));
      localStorage.setItem('sn-current', 'はると');
    } catch {}
  `);
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push(String(e)));
  await pg.goto(`${origin}/index.html`);
  await pg.waitForTimeout(1600);          // autoDetectServer が おわるまで
  return { ctx, pg };
}

async function playCalc(pg) {
  await pg.click('.mode[data-app="home"]');
  await pg.click('#home .lv[data-lv="2"]');
  await pg.click('.mode[data-mode="calc"]');
  for (let i = 0; i < 10; i++) {
    const v = await pg.evaluate(() => {
      const r = [...document.querySelectorAll('.hz-row')].map((x) => x.textContent.trim());
      const a = Number(r[0]), op = r[1][0], bb = Number(r[1].slice(1));
      return String(op === '＋' ? a + bb : a - bb);
    });
    for (const d of v) await pg.keyboard.press(d);
    await pg.keyboard.press('Enter');
    await pg.waitForTimeout(120);
    await pg.evaluate(() => document.querySelector('#next')?.click());
    await pg.waitForTimeout(80);
  }
  await pg.waitForTimeout(500);
}

const onServer = async () => (await (await fetch(`http://127.0.0.1:${PORT}/api/runs?limit=200`)).json()).runs || [];

try {
  // ===== 1) Netlify に 出した サイト：なにも 入れなくても サーバーに つながる =====
  const A = await device(`http://127.0.0.1:${PORT}`);
  const cfgA = await A.pg.evaluate(() => JSON.parse(localStorage.getItem('sn-server') || 'null'));
  check('URL を 入れなくても じぶんの サイトを きろくサーバーに する',
    cfgA && cfgA.url === `http://127.0.0.1:${PORT}`, JSON.stringify(cfgA));

  await playCalc(A.pg);
  await A.pg.waitForTimeout(900);
  let rows = await onServer();
  check('といた きろくが Netlify がわに とどく', rows.length === 1, `${rows.length}セット`);
  check('1もんごとの なかみも とどく', rows[0]?.detail?.length === 10, `${rows[0]?.detail?.length}もん`);

  // ===== 2) べつの たんまつで ひらくだけで、まえの きろくが 出る =====
  const B = await device(`http://127.0.0.1:${PORT}`);
  const before = await B.pg.evaluate(() => JSON.parse(localStorage.getItem('sn-log-v1') || '[]').length);
  check('たんまつB は さいしょ きろくが 0', before === 0, `${before}セット`);
  await B.pg.click('#to-history');
  await B.pg.waitForTimeout(2500);
  const got = await B.pg.evaluate(() => ({
    sets: JSON.parse(localStorage.getItem('sn-log-v1') || '[]').length,
    msg: document.getElementById('hist-sync').textContent.trim(),
  }));
  check('たんまつB に たんまつA の きろくが 出る', got.sets === 1, `${got.sets}セット / ${got.msg}`);

  // B でも といて、A に もどって くるか
  await B.pg.click('#hist-back');
  await playCalc(B.pg);
  await B.pg.waitForTimeout(900);
  rows = await onServer();
  check('2台ぶんが サーバーに たまる', rows.length === 2, `${rows.length}セット`);

  await A.pg.click('#tohome');
  await A.pg.click('#to-history');
  await A.pg.waitForTimeout(2500);
  const backA = await A.pg.evaluate(() => JSON.parse(localStorage.getItem('sn-log-v1') || '[]').length);
  check('たんまつA にも たんまつB の ぶんが もどって くる', backA === 2, `${backA}セット`);

  // せってい欄に「この サイトの きろくサーバー」と 出る
  const srvText = await A.pg.evaluate(() => document.getElementById('srv-msg')?.textContent.trim() || '');
  check('せってい欄に つながって いる ことを 出す', /この サイトの/.test(srvText), srvText.slice(0, 40));

  // ===== 3) サーバーの ない ただの 静的サイトでも、行き止まりに しない =====
  const C = await device(`http://127.0.0.1:${PLAIN}`);
  const cfgC = await C.pg.evaluate(() => JSON.parse(localStorage.getItem('sn-server') || 'null'));
  check('サーバーが なければ URL を かってに いれない', cfgC === null, JSON.stringify(cfgC));
  await playCalc(C.pg);
  await C.pg.waitForTimeout(700);
  const localC = await C.pg.evaluate(() => JSON.parse(localStorage.getItem('sn-log-v1') || '[]').length);
  check('サーバーが なくても この たんまつには のこる', localC === 1, `${localC}セット`);
  await C.pg.click('#tohome');
  await C.pg.click('#to-history');
  await C.pg.waitForTimeout(1200);
  const cText = await C.pg.evaluate(() => document.getElementById('days')?.textContent.trim() || '');
  check('サーバーが なくても きろく画面は 出る', /ひっさん/.test(cText), cText.slice(0, 30));

  console.log('\n' + results.join('\n'));
  const ng = results.filter((r) => r.startsWith('NG')).length;
  console.log(`\nしっぱい ${ng}件 / JSエラー ${errs.length ? errs.slice(0, 3).join(' | ') : 'なし'}`);
  if (ng || errs.length) process.exitCode = 1;
} catch (e) {
  console.log('!! とまった:', e.message.split('\n')[0]);
  console.log(results.join('\n'));
  process.exitCode = 1;
} finally {
  try { await b.close(); } catch {}
  netlify.close(); plain.close();
  await rm(OUT, { recursive: true, force: true });
}
