// どの たんまつから やっても きろくが 1つに まとまるかを たしかめる。
//   たんまつA で さんすう → たんまつB で えいご・かんじ・タイピング →
//   たんまつC（まっさら）で きろくを ひらく。
//   C に A と B の ぶんが ぜんぶ 出れば OK。
// アプリごとに 分けて 見られるかも ここで みる。
// つかいかた: node tests/verify-sync.mjs （リポジトリの ルートで）
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  const { execSync } = await import('node:child_process');
  const root = execSync('npm root -g').toString().trim();
  ({ chromium } = await import(`${root}/playwright/index.mjs`));
}
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';

const DATA = './tests/.tmp-sync-runs.json';
await rm(DATA, { force: true });
const srv = spawn('node', ['server/dev-server.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: '8788', DATA, ALLOW_ORIGIN: '*' },
  stdio: ['ignore', 'ignore', 'pipe'],
});
srv.stderr.on('data', d => process.stderr.write('  srv| ' + d));
// アプリを 127.0.0.1 から 出す（file:// だと サーバーに つなげない）
const web = spawn('npx', ['--yes', 'http-server', '.', '-p', '8099', '-s', '--cors'], { cwd: process.cwd(), stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3000));

const SRV = 'http://127.0.0.1:8788';
const APP = 'http://127.0.0.1:8099/index.html';
const results = [];
const check = (n, c, x = '') => results.push(`${c ? 'OK  ' : 'NG  '} ${n}${x ? ' … ' + x : ''}`);
const b = await chromium.launch();
const errs = [];

// まっさらな たんまつを 1つ つくる（localStorage は context ごとに べつ）
async function device(name) {
  const ctx = await b.newContext({ viewport: { width: 430, height: 950 } });
  await ctx.addInitScript(`
    class U { constructor(t){ this.text=t;this.onend=null;this.onerror=null; } }
    window.SpeechSynthesisUtterance = U;
    Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
      getVoices:()=>[], speak:()=>{}, cancel:()=>{}, onvoiceschanged:null }});
    try {
      localStorage.setItem('sn-players', JSON.stringify(['はると']));
      localStorage.setItem('sn-current', 'はると');
      localStorage.setItem('sn-server', JSON.stringify({ url: '${SRV}', key: '' }));
    } catch {}
  `);
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(`${name}: ${e}`));
  await pg.goto(APP);
  await pg.waitForTimeout(1200);
  return { ctx, pg };
}

// さんすうを 1セット とく（ぜんぶ せいかい）
async function playCalc(pg) {
  await pg.click('.mode[data-app="home"]');
  await pg.click('#home .lv[data-lv="2"]');
  await pg.click('.mode[data-mode="calc"]');
  for (let i = 0; i < 10; i++) {
    const v = await pg.evaluate(() => {
      const r = [...document.querySelectorAll('.hz-row')].map(x => x.textContent.trim());
      const a = Number(r[0]), op = r[1][0], bb = Number(r[1].slice(1));
      return String(op === '＋' ? a + bb : a - bb);
    });
    for (const d of v) await pg.keyboard.press(d);
    await pg.keyboard.press('Enter');
    await pg.waitForTimeout(120);
    await pg.evaluate(() => document.querySelector('#next')?.click());
    await pg.waitForTimeout(80);
  }
  await pg.waitForTimeout(400);
}

// えいごを 1セット（1つめを えらぶだけ。あって いても いなくても きろくは のこる）
async function playEigo(pg) {
  await pg.click('#tohome');
  await pg.click('.mode[data-app="eigo"]');
  await pg.click('.mode[data-mode="listen"]');
  for (let i = 0; i < 10; i++) {
    await pg.click('.pick[data-c="0"]');
    await pg.waitForTimeout(120);
    await pg.evaluate(() => document.querySelector('#next')?.click());
    await pg.waitForTimeout(80);
  }
  await pg.waitForTimeout(400);
}

// かんじを 1セット（なぞりがき。かんじの かたちを たどって なぞる）
async function playKanji(pg) {
  await pg.click('#tohome');
  await pg.click('.mode[data-app="kanji"]');
  await pg.click('.mode[data-mode="kj-trace"]');
  await pg.waitForTimeout(250);
  for (let i = 0; i < 10; i++) {
    await pg.evaluate(() => {
      const cv = document.getElementById('kj-canvas');
      const N = cv.width, r = cv.getBoundingClientRect();
      const send = (type, px, py) => cv.dispatchEvent(new PointerEvent(type, {
        clientX: r.left + px * (r.width / N), clientY: r.top + py * (r.height / N),
        bubbles: true, pointerId: 1 }));
      const off = document.createElement('canvas');
      off.width = off.height = N;
      const oc = off.getContext('2d', { willReadFrequently: true });
      const px = Math.round(N * 0.72);
      oc.font = `700 ${px}px "Zen Kaku Gothic New", sans-serif`;
      oc.textAlign = 'center'; oc.textBaseline = 'middle'; oc.fillStyle = '#000';
      oc.fillText(cv.getAttribute('aria-label').slice(0, 1), N / 2, N / 2 + px * 0.03);
      const d = oc.getImageData(0, 0, N, N).data;
      for (let y = 2; y < N; y += 4) {
        let run = null;
        for (let x = 0; x < N; x++) {
          const on = d[(y * N + x) * 4 + 3] > 40;
          if (on && !run) run = [x, x];
          else if (on) run[1] = x;
          else if (run) {
            if (run[1] - run[0] >= 2) { send('pointerdown', run[0], y); send('pointermove', run[1], y); send('pointerup', run[1], y); }
            run = null;
          }
        }
      }
    });
    await pg.click('#go');
    await pg.waitForTimeout(150);
    await pg.evaluate(() => document.querySelector('#next')?.click());
    await pg.waitForTimeout(100);
  }
  await pg.waitForTimeout(400);
}

// タイピングを 1かい（れんしゅう 10もん）
async function playTyping(pg) {
  await pg.click('#tohome');
  await pg.click('.mode[data-app="typing"]');
  await pg.click('#ty-start');
  await pg.waitForTimeout(3600);
  for (let i = 0; i < 60; i++) {
    const want = await pg.evaluate(() => document.querySelector('#ty-kbd .kbd-key.next')?.dataset.k ?? null);
    if (!want) break;
    await pg.keyboard.press(want === ' ' ? 'Space' : want);
    await pg.waitForTimeout(30);
  }
  await pg.waitForTimeout(600);
}

const setsOnServer = async () => {
  const r = await fetch(`${SRV}/api/runs?limit=200`);
  const j = await r.json();
  return j.runs || [];
};

try {
  // ===== たんまつA: さんすう =====
  const A = await device('A');
  await playCalc(A.pg);
  await A.pg.waitForTimeout(900);
  let rows = await setsOnServer();
  check('たんまつA: さんすうが サーバーに とどく', rows.length === 1, `${rows.length}セット`);

  // ===== たんまつB: えいご と タイピング =====
  const B = await device('B');
  await playCalc(B.pg);          // B でも さんすう
  await playEigo(B.pg);
  await playKanji(B.pg);
  await playTyping(B.pg);
  await B.pg.waitForTimeout(1200);
  rows = await setsOnServer();
  const modes = rows.map(r => r.mode).sort();
  check('たんまつB: えいごも サーバーに とどく（まえは 400で はじかれて いた）',
    modes.includes('listen'), modes.join(','));
  check('たんまつB: かんじも サーバーに とどく',
    modes.some(m => m.startsWith('kj-')), modes.join(','));
  check('たんまつB: タイピングも サーバーに とどく',
    modes.some(m => m.startsWith('ty-')), modes.join(','));
  check('サーバーに 5セット たまった', rows.length === 5, `${rows.length}セット: ${modes.join(',')}`);

  // ===== たんまつC: まっさら。きろくを ひらくだけで ぜんぶ 出るか =====
  const C = await device('C');
  const before = await C.pg.evaluate(() => JSON.parse(localStorage.getItem('sn-log-v1') || '[]').length);
  check('たんまつC: さいしょは きろくが 0', before === 0, `${before}セット`);
  await C.pg.click('#to-history');
  await C.pg.waitForTimeout(2500);        // サーバーから とってくる
  const got = await C.pg.evaluate(() => ({
    sets: JSON.parse(localStorage.getItem('sn-log-v1') || '[]').length,
    modes: JSON.parse(localStorage.getItem('sn-log-v1') || '[]').map(r => r.m).sort(),
    msg: document.getElementById('hist-sync').textContent.trim(),
    tiles: document.getElementById('tiles').textContent.replace(/\s+/g, ' ').trim(),
    appFilter: document.getElementById('hist-app').hidden
      ? '(ひょうじ なし)'
      : [...document.querySelectorAll('#hist-app .pchip')].map(x => x.textContent).join('/'),
  }));
  check('たんまつC: ほかの たんまつの きろくが ぜんぶ 出る', got.sets === 5, `${got.sets}セット / ${got.modes.join(',')}`);
  check('たんまつC: とりこんだ ことを 画面にも 出す', /とりこみました|そろって/.test(got.msg), got.msg);
  check('たんまつC: 4つの アプリで 分けて 見られる',
    ['さんすう', 'えいご', 'かんじ', 'タイピング'].every(a => got.appFilter.includes(a)),
    got.appFilter);

  // アプリごとに しぼると その アプリだけに なる
  const per = {};
  for (const [label, app] of [['さんすう', 'sansu'], ['えいご', 'eigo'], ['かんじ', 'kanji'], ['タイピング', 'typing']]) {
    await C.pg.click(`#hist-app [data-app-filter="${app}"]`);
    await C.pg.waitForTimeout(250);
    per[label] = await C.pg.evaluate(() => {
      const names = [...document.querySelectorAll('#days .set summary span:first-child')].map(x => x.textContent);
      return names;
    });
  }
  check('しぼると さんすうだけ', per['さんすう'].length === 2 && per['さんすう'].every(n => /ひっさん/.test(n)),
    JSON.stringify(per['さんすう']));
  check('しぼると えいごだけ', per['えいご'].length === 1 && /ききとり/.test(per['えいご'][0] || ''),
    JSON.stringify(per['えいご']));
  check('しぼると かんじだけ', per['かんじ'].length === 1 && /なぞりがき/.test(per['かんじ'][0] || ''),
    JSON.stringify(per['かんじ']));
  check('しぼると タイピングだけ', per['タイピング'].length === 1 && /タイピング/.test(per['タイピング'][0] || ''),
    JSON.stringify(per['タイピング']));

  // もう いちど ひらいても ふえない（おなじ セットを 2かい とりこまない）
  await C.pg.click('#hist-back');
  await C.pg.click('#to-history');
  await C.pg.waitForTimeout(2200);
  const again = await C.pg.evaluate(() => JSON.parse(localStorage.getItem('sn-log-v1') || '[]').length);
  check('2かい ひらいても おなじ セットが ふえない', again === 5, `${again}セット`);

  console.log('\n' + results.join('\n'));
  const ng = results.filter(r => r.startsWith('NG')).length;
  console.log(`\nしっぱい ${ng}件 / JSエラー ${errs.length ? errs.join(' | ') : 'なし'}`);
  if (ng || errs.length) process.exitCode = 1;
} catch (e) {
  console.log('!! とまった:', e.message.split('\n')[0]);
  console.log(results.join('\n'));
  process.exitCode = 1;
} finally {
  try { await b.close(); } catch {}
  srv.kill(); web.kill();
  await rm(DATA, { force: true });
}
