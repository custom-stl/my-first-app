// ケロと コロの こえが かさならない ことを、ほんものの ブラウザの じかんで たしかめる。
//   ことば（TTS）／アニメごえ（WebAudio）／ろくおんした こえ の 3とおり。
// つかいかた: node tests/verify-voice-order.mjs （リポジトリの ルートで）
// playwright は ローカル（npm i -D playwright）でも グローバルでも つかえるように さがす
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  const { execSync } = await import('node:child_process');
  const root = execSync('npm root -g').toString().trim();
  ({ chromium } = await import(`${root}/playwright/index.mjs`));
}
import { spawn } from 'node:child_process';
// マイクは 127.0.0.1 なら つかえる（file:// だと ろくおん できない）
const web = spawn('npx', ['--yes', 'http-server', '.', '-p', '8099', '-s'], { cwd: process.cwd(), stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3000));
const results = [];
const check = (n, c, x = '') => results.push(`${c ? 'OK  ' : 'NG  '} ${n}${x ? ' … ' + x : ''}`);
const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });

const spy = (voices) => `
  window.__ev = [];
  const T0 = performance.now();
  const at = () => Math.round(performance.now() - T0);
  class U {
    constructor(t){ this.text=t; this.pitch=1; this.rate=1; this.voice=null; this.onend=null; this.onerror=null; }
  }
  window.SpeechSynthesisUtterance = U;
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    getVoices: () => ${JSON.stringify(voices)},
    speak: (u) => {
      window.__ev.push({ kind: 'tts', t: at(), text: u.text, pitch: u.pitch });
      // 600ms しゃべって おわる、と する
      setTimeout(() => { window.__ev.push({ kind: 'tts-end', t: at(), text: u.text }); u.onend && u.onend(); }, 600);
    },
    cancel: () => { window.__ev.push({ kind: 'cancel', t: at() }); },
    onvoiceschanged: null }});
  const Orig = window.AudioContext;
  class SpyCtx extends Orig {
    createOscillator() {
      const n = super.createOscillator();
      const os = n.start.bind(n);
      n.start = (...a) => { if (n.frequency.value > 100 || n.__f) window.__ev.push({ kind: 'babble', t: at(), f: Math.round(n.__f || n.frequency.value) }); return os(...a); };
      const sv = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(n.frequency), 'value');
      const origSet = n.frequency.setValueAtTime.bind(n.frequency);
      n.frequency.setValueAtTime = (v, t) => { n.__f = n.__f || v; return origSet(v, t); };
      return n;
    }
    createBiquadFilter() {
      window.__ev.push({ kind: 'babble-batch', t: at() });
      return super.createBiquadFilter();
    }
    createBufferSource() {
      const n = super.createBufferSource();
      const os = n.start.bind(n);
      n.start = (...a) => { window.__ev.push({ kind: 'rec', t: at(), dur: n.buffer ? +(n.buffer.duration / n.playbackRate.value).toFixed(2) : 0 }); return os(...a); };
      return n;
    }
  }
  Object.defineProperty(window, 'AudioContext', { configurable: true, value: SpyCtx });
  Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: SpyCtx });
`;
const answer = async (pg, ok) => {
  const v = await pg.evaluate(() => {
    const r = [...document.querySelectorAll('.hz-row')].map(x => x.textContent.trim());
    const a = Number(r[0]), op = r[1][0], bb = Number(r[1].slice(1));
    return String(op === '＋' ? a + bb : a - bb);
  });
  await pg.evaluate(() => { window.__ev = []; });
  for (const d of (ok ? v : String(Number(v) + 1))) await pg.keyboard.press(d);
  await pg.keyboard.press('Enter');
};
let pg;
try {
  // ===== 1) ことばモード: ケロが おわってから コロ =====
  let ctx = await b.newContext({ viewport: { width: 430, height: 940 }, permissions: ['microphone'] });
  await ctx.addInitScript(spy([{ name: 'Kyoko', lang: 'ja-JP' }, { name: 'Nanami', lang: 'ja-JP' }]));
  pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto('http://127.0.0.1:8099/index.html');
  await pg.waitForTimeout(1800);
  await pg.click('#padd'); await pg.fill('#pname', 'はると'); await pg.press('#pname', 'Enter');
  await pg.click('.lv[data-lv="2"]'); await pg.click('.mode[data-mode="calc"]');
  await answer(pg, true);
  await pg.waitForTimeout(1800);
  let ev = await pg.evaluate(() => window.__ev);
  let tts = ev.filter(e => e.kind === 'tts'), ends = ev.filter(e => e.kind === 'tts-end');
  check('ことば: ふたりぶん しゃべる', tts.length === 2, tts.map(x => `${x.t}ms:${x.text.slice(0, 10)}`).join(' | '));
  check('ことば: コロは ケロが おわって から はじまる', tts.length === 2 && ends.length >= 1 && tts[1].t >= ends[0].t,
    `ケロ開始${tts[0]?.t} → ケロ終了${ends[0]?.t} → コロ開始${tts[1]?.t}`);
  check('ことば: ケロと コロで こえが ちがう', tts[0]?.pitch !== tts[1]?.pitch, `${tts[0]?.pitch} / ${tts[1]?.pitch}`);
  // ことばの まえに みじかい アニメごえ（ひとり 3おと）。ことばに かぶらない ことを みる
  const bab = ev.filter(e => e.kind === 'babble');
  check('ことば: まえの アニメごえは ひとり 3おと', bab.length === 6, `${bab.length}おと`);
  check('ことば: アニメごえの あとに ことばが くる',
    bab[2] && tts[0] && bab[2].t < tts[0].t && bab[3].t > tts[0].t && bab[5].t < tts[1].t,
    `ケロおと${bab[0]?.t}→ケロことば${tts[0]?.t}→コロおと${bab[3]?.t}→コロことば${tts[1]?.t}`);
  await pg.close();

  // ===== 2) アニメごえだけ: ケロの おとが おわってから コロ =====
  ctx = await b.newContext({ viewport: { width: 430, height: 940 } });
  await ctx.addInitScript(spy([{ name: 'Alex', lang: 'en-US' }]));
  pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto('http://127.0.0.1:8099/index.html');
  await pg.waitForTimeout(1800);
  await pg.click('.lv[data-lv="2"]'); await pg.click('.mode[data-mode="calc"]');
  await answer(pg, true);
  await pg.waitForTimeout(2500);
  ev = await pg.evaluate(() => window.__ev);
  const batches = ev.filter(e => e.kind === 'babble-batch');
  const notes = ev.filter(e => e.kind === 'babble');
  // せりふは まいかい ちがうので、おとの かずは もじすうで かわる（ひとり 3〜8おと）
  check('アニメごえ: ふたりぶん なる', batches.length === 2 && notes.length >= 6, `${batches.length}かい・${notes.length}おと`);
  if (batches.length === 2) {
    const gap = batches[1].t - batches[0].t;
    // 8おと × 82ms ＝ やく660ms ＋ すこし あけて つぎへ
    check('アニメごえ: コロは ケロの おとが おわって から', gap >= 600, `ケロ開始 → ${gap}ms あとに コロ開始`);
    const lastKero = Math.max(...notes.filter(n => n.t < batches[1].t).map(n => n.t));
    check('アニメごえ: おとが かさならない', batches[1].t >= lastKero, `ケロ最後${lastKero}ms → コロ開始${batches[1].t}ms`);
  }
  await pg.close();

  // ===== 3) ろくおん: ながい こえでも かさならない =====
  ctx = await b.newContext({ viewport: { width: 430, height: 940 }, permissions: ['microphone'] });
  await ctx.addInitScript(spy([{ name: 'Kyoko', lang: 'ja-JP' }]));
  pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto('http://127.0.0.1:8099/index.html');
  await pg.waitForTimeout(1800);
  await pg.click('#to-history'); await pg.waitForTimeout(400);
  // ケロ・ほめる と コロ・ほめる を 2びょうずつ ろくおん
  for (const slot of ['kero-ok', 'koro-ok']) {
    await pg.click(`[data-rec="${slot}"]`);
    await pg.waitForTimeout(2000);
    await pg.click(`[data-rec="${slot}"]`);
    await pg.waitForTimeout(900);
  }
  await pg.evaluate(() => document.querySelector('#hist-back').click());
  await pg.click('.lv[data-lv="2"]'); await pg.click('.mode[data-mode="calc"]');
  await answer(pg, true);
  await pg.waitForTimeout(5000);
  ev = await pg.evaluate(() => window.__ev.filter(e => e.kind === 'rec'));
  check('ろくおん: ふたりぶん ならす', ev.length === 2, ev.map(x => `${x.t}ms(${x.dur}びょう)`).join(' | '));
  if (ev.length === 2) {
    const gap = ev[1].t - ev[0].t;
    check('ろくおん: 1つめが おわって から 2つめ', gap >= ev[0].dur * 1000,
      `1つめ ${ev[0].dur}びょう → 2つめは ${gap}ms あと`);
  }
  console.log('\n' + results.join('\n'));
  const ng = results.filter(r => r.startsWith('NG')).length;
  console.log(`\nしっぱい ${ng}件 / JSエラー ${errs.length ? errs.join(' | ') : 'なし'}`);
  if (ng || errs.length) process.exitCode = 1;
} catch (e) {
  console.log('!! とまった:', e.message.split('\n')[0]);
  console.log(results.join('\n'));
  process.exitCode = 1;
} finally { try { await b.close(); } catch {} web.kill(); }
