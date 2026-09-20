// かんじアプリを たしかめる。
//  1) かんじの ひょう（かくすう・よみ・がくねん）が おかしく ないか
//  2) よみ／かきとりの せんたくしが 4つで ダブって いないか、○と こたえが あうか
//  3) なぞりがきの はんていが ほんとうに 見わけられるか
//     （ぴったり／すこし ずれ／おおきく ずれ／らくがき／なにも かかない の 5とおりで くらべる）
// つかいかた: node tests/verify-kanji.mjs （リポジトリの ルートで）
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  const { execSync } = await import('node:child_process');
  const root = execSync('npm root -g').toString().trim();
  ({ chromium } = await import(`${root}/playwright/index.mjs`));
}

const results = [];
const check = (n, c, x = '') => results.push(`${c ? 'OK  ' : 'NG  '} ${n}${x ? ' … ' + x : ''}`);
const fails = [];

// テスト側が もって いる かくすう（アプリの ひょうとは べつに かく。ぬきうち）
const STROKES = {
  一: 1, 二: 2, 三: 3, 四: 5, 五: 4, 六: 4, 七: 2, 八: 2, 九: 2, 十: 2,
  百: 6, 千: 3, 上: 3, 下: 3, 左: 5, 右: 5, 中: 4, 大: 3, 小: 3, 月: 4,
  日: 4, 年: 6, 早: 6, 木: 4, 林: 8, 山: 3, 川: 3, 土: 3, 空: 8, 田: 5,
  天: 4, 生: 5, 花: 7, 草: 9, 虫: 6, 犬: 4, 人: 2, 名: 6, 女: 3, 男: 7,
  子: 3, 目: 5, 耳: 6, 口: 3, 手: 4, 足: 7, 見: 7, 音: 9, 力: 2, 気: 6,
  円: 4, 入: 2, 出: 5, 立: 5, 休: 6, 先: 6, 夕: 3, 本: 5, 文: 4, 字: 6,
  学: 8, 校: 10, 村: 7, 町: 7, 森: 12, 正: 5, 水: 4, 火: 4, 玉: 5, 王: 4,
  石: 5, 竹: 6, 糸: 6, 貝: 7, 車: 7, 金: 8, 雨: 8, 赤: 7, 青: 8, 白: 5,
  // 2年生から いくつか
  刀: 2, 万: 3, 丸: 3, 才: 3, 今: 4, 元: 4, 分: 4, 友: 4, 父: 4, 牛: 4,
  心: 4, 戸: 4, 兄: 5, 冬: 5, 北: 5, 半: 5, 古: 5, 外: 5, 母: 5, 広: 5,
  会: 6, 光: 6, 同: 6, 回: 6, 自: 6, 色: 6, 行: 6, 西: 6, 米: 6, 肉: 6,
  体: 7, 作: 7, 声: 7, 来: 7, 里: 7, 言: 7, 近: 7, 弟: 7, 国: 8, 夜: 8,
  妹: 8, 姉: 8, 東: 8, 歩: 8, 明: 8, 岩: 8, 店: 8, 知: 8, 前: 9, 南: 9,
  星: 9, 春: 9, 昼: 9, 風: 9, 食: 9, 首: 9, 点: 9, 茶: 9, 秋: 9, 夏: 10,
  時: 10, 書: 10, 馬: 10, 高: 10, 紙: 10, 家: 10, 強: 11, 魚: 11, 鳥: 11, 雪: 11,
  黒: 11, 組: 11, 週: 11, 場: 12, 朝: 12, 雲: 12, 絵: 12, 道: 12, 答: 12, 園: 13,
  電: 13, 遠: 13, 話: 13, 数: 13, 新: 13, 歌: 14, 聞: 14, 読: 14, 語: 14, 線: 15,
  曜: 18, 顔: 18,
};

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 430, height: 950 }, hasTouch: true });
await ctx.addInitScript(`
  class U { constructor(t){ this.text=t;this.onend=null;this.onerror=null; } }
  window.SpeechSynthesisUtterance = U;
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
    getVoices:()=>[], speak:()=>{}, cancel:()=>{}, onvoiceschanged:null }});
  try { localStorage.setItem('sn-players', JSON.stringify(['はると']));
        localStorage.setItem('sn-current','はると'); } catch {}
`);
const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', e => errs.push(String(e)));
await pg.goto('file://' + process.cwd() + '/index.html');
await pg.waitForTimeout(1300);

// なぞりを 中に つくって はんていさせる。
//   'trace'   … かんじの ドットを ぬりつぶす（ぴったり）
//   'real'    … ペンの ふとさぶん とびとびに、手ぶれつきで なぞる … ほんものの 子に いちばん ちかい
//   'way'     … おおきく（62ドット）ずらす … これは とおさない
//   'scrawl'  … マスに ななめの せんを 2ほん（らくがき）
//   'none'    … なにも かかない
async function traceAs(kind) {
  return pg.evaluate((kind) => {
    const cv = document.getElementById('kj-canvas');
    const N = cv.width;
    const down = (x, y) => cv.dispatchEvent(new PointerEvent('pointerdown', {
      clientX: 0, clientY: 0, bubbles: true, pointerId: 1 }));
    // ポインタの イベントは がめんの ざひょうで くるので、
    // アプリと おなじ へんかんを つかって「かきたい ドット」を つくる
    const r = cv.getBoundingClientRect();
    const toClient = (px, py) => ({ clientX: r.left + px * (r.width / N), clientY: r.top + py * (r.height / N) });
    const send = (type, px, py) => cv.dispatchEvent(new PointerEvent(type, {
      ...toClient(px, py), bubbles: true, pointerId: 1 }));

    if (kind === 'none') return;

    if (kind === 'scrawl') {
      send('pointerdown', 20, 20); for (let i = 0; i <= 20; i++) send('pointermove', 20 + i * 13, 20 + i * 13);
      send('pointerup', 280, 280);
      send('pointerdown', 280, 20); for (let i = 0; i <= 20; i++) send('pointermove', 280 - i * 13, 20 + i * 13);
      send('pointerup', 20, 280);
      return;
    }

    // かんじの かたちを オフスクリーンに かいて、その ドットを よこに たどる
    const off = document.createElement('canvas');
    off.width = off.height = N;
    const oc = off.getContext('2d', { willReadFrequently: true });
    const px = Math.round(N * 0.72);
    oc.font = `700 ${px}px "Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
    oc.textAlign = 'center'; oc.textBaseline = 'middle';
    oc.fillStyle = '#000';
    oc.fillText(document.querySelector('#kj-canvas').getAttribute('aria-label').slice(0, 1),
      N / 2, N / 2 + px * 0.03);
    const d = oc.getImageData(0, 0, N, N).data;
    const shift = kind === 'way' ? 62 : 0;
    // 'real' は ペンの ふとさに あわせて とびとびに なぞる（ぬりつぶさない）
    const step = kind === 'real' ? 16 : 4;
    const wob = (y) => (kind === 'real' ? Math.round(Math.sin(y / 34) * 6) : 0);
    // よこの れつごとに、ドットの ある ところを ひとつづきの せんに する
    for (let y = 2; y < N; y += step) {
      let run = null;
      for (let x = 0; x < N; x++) {
        const on = d[(y * N + x) * 4 + 3] > 40;
        if (on && !run) run = [x, x];
        else if (on) run[1] = x;
        else if (run) {
          if (run[1] - run[0] >= 2) {
            send('pointerdown', run[0] + shift + wob(y), y + shift);
            send('pointermove', run[1] + shift + wob(y), y + shift);
            send('pointerup', run[1] + shift + wob(y), y + shift);
          }
          run = null;
        }
      }
      if (run && run[1] - run[0] >= 2) {
        send('pointerdown', run[0] + shift + wob(y), y + shift);
        send('pointermove', run[1] + shift + wob(y), y + shift);
        send('pointerup', run[1] + shift + wob(y), y + shift);
      }
    }
  }, kind);
}

const startKanji = async (mode, lv) => {
  await pg.evaluate(() => {
    const q = document.getElementById('quit'); if (!q.hidden) q.click();
    const back = document.getElementById('kanji-back'); if (back && !document.getElementById('kanji').hidden) back.click();
    const th = document.getElementById('tohome'); if (th && !document.getElementById('result').hidden) th.click();
  });
  await pg.click('.mode[data-app="kanji"]');
  await pg.click(`#kj-levels .lv[data-lv="${lv}"]`);
  await pg.click(`.mode[data-mode="${mode}"]`);
  await pg.waitForTimeout(250);
};

try {
  // ===== 1) かんじの ひょう =====
  // なぞりがきを たくさん 出して、出て きた かんじ・かくすう・よみを あつめる
  await startKanji('kj-trace', 3);
  const seen = new Map();
  for (let i = 0; i < 90; i++) {
    const got = await pg.evaluate(() => ({
      kanji: document.getElementById('kj-canvas').getAttribute('aria-label').slice(0, 1),
      yomi: document.querySelector('.kjyomi').textContent,
      strokes: Number(document.querySelector('.kjstrokes').textContent.match(/(\d+)かく/)[1]),
      n: document.getElementById('qnum').textContent,
    }));
    seen.set(got.kanji, got);
    // つぎの もんだいへ（なぞらずに けす → できた が おせないので、じかに すすめる）
    const last = await pg.evaluate(() => {
      const el = document.getElementById('qnum');
      return el.textContent === '10';
    });
    if (last) { await startKanji('kj-trace', 3); } else {
      await traceAs('trace');
      await pg.click('#go');
      await pg.waitForTimeout(120);
      await pg.evaluate(() => document.querySelector('#next')?.click());
      await pg.waitForTimeout(120);
    }
  }
  for (const [k, v] of seen) {
    if (STROKES[k] === undefined) continue;              // テスト側に ない かんじは とばす
    if (STROKES[k] !== v.strokes) fails.push(`かくすう が ちがう: ${k} は ${STROKES[k]}かく（アプリは ${v.strokes}）`);
    if (!/^[ぁ-んー]+$/.test(v.yomi)) fails.push(`よみが ひらがなで ない: ${k} → ${v.yomi}`);
  }
  check('かんじの かくすうが テスト側の ひょうと あう', !fails.some(f => f.includes('かくすう')),
    `${seen.size}字 しらべた`);
  check('よみは ぜんぶ ひらがな', !fails.some(f => f.includes('よみが')));

  // ===== 2) なぞりがきの はんてい =====
  const scoreOf = async (kind) => {
    await pg.evaluate(() => { document.getElementById('kj-clear')?.click(); });
    await traceAs(kind);
    return pg.evaluate(() => {
      const el = document.getElementById('go');
      return { can: !el.disabled };
    }).then(async (st) => {
      if (!st.can) return { cover: 0, over: 0, ok: false, empty: true };
      await pg.click('#go');
      await pg.waitForTimeout(200);
      const r = await pg.evaluate(() => ({
        ok: !document.querySelector('.judge').classList.contains('ng'),
        given: document.querySelector('.judge')?.textContent || '',
      }));
      const m = r.given.match(/なぞれた\s*(\d+)/);
      await pg.evaluate(() => document.querySelector('#next')?.click());
      await pg.waitForTimeout(150);
      return { ok: r.ok, cover: m ? Number(m[1]) : null, empty: false };
    });
  };
  // おなじ やりかたを 3もんずつ ためす（かんじに よって あたり方が ちがうので）
  const tryKind = async (kind, n = 3) => {
    await startKanji('kj-trace', 1);      // 1セット10もんを こえない ように かけなおす
    const got = [];
    for (let i = 0; i < n; i++) got.push(await scoreOf(kind));
    return got;
  };
  const good = await tryKind('trace');
  const real = await tryKind('real');
  const way = await tryKind('way');
  const scrawl = await tryKind('scrawl');
  const none = await tryKind('none', 1);
  const shown = (a) => a.map((x) => (x.empty ? 'かけない' : `${x.cover}%${x.ok ? '○' : '✕'}`)).join(' / ');

  check('ぴったり ぬりつぶせば せいかい', good.every((x) => x.ok === true), shown(good));
  check('ほんものの ように せんを 1ぽんずつ なぞっても せいかい（いちばん たいせつ）',
    real.every((x) => x.ok === true), shown(real));
  check('おおきく ずれたら せいかいに しない', way.every((x) => x.ok === false), shown(way));
  check('らくがきは まちがい', scrawl.every((x) => x.ok === false), shown(scrawl));
  check('なにも かかないと「できた」が おせない', none[0].empty === true, shown(none));
  check('ちゃんと なぞった ほうが かならず わりあいが 高い',
    Math.min(...real.map((x) => x.cover)) > Math.max(...scrawl.map((x) => x.cover)),
    `なぞり さいてい ${Math.min(...real.map((x) => x.cover))}% > らくがき さいこう ${Math.max(...scrawl.map((x) => x.cover))}%`);

  // ===== 3) よみ・かきとりの せんたくし =====
  for (const [mode, label] of [['kj-yomi', 'よみ'], ['kj-kaki', 'かきとり']]) {
    await startKanji(mode, 3);
    let bad = 0, marked = 0;
    for (let i = 0; i < 10; i++) {
      const t = await pg.evaluate(() => {
        const label = (el) => {
          const c = el.cloneNode(true);
          c.querySelectorAll('.picknum').forEach(n => n.remove());
          return c.textContent.trim();
        };
        return [...document.querySelectorAll('.pick')].map(label);
      });
      if (t.length !== 4 || new Set(t).size !== 4) bad++;
      await pg.click('.pick[data-c="0"]');
      await pg.waitForTimeout(120);
      const shown = await pg.evaluate(() => ({
        ans: document.querySelector('.judge .say p b')?.textContent || '',
        marked: document.querySelectorAll('.pick.ans').length,
        label: (() => { const el = document.querySelector('.pick.ans'); if (!el) return '';
          const c = el.cloneNode(true); c.querySelectorAll('.picknum').forEach(n => n.remove());
          return c.textContent.trim(); })(),
      }));
      if (shown.marked === 1) marked++;
      if (shown.ans && shown.label && !shown.ans.includes(shown.label)) {
        fails.push(`${label}: ○の ボタンと こたえが ちがう: ${shown.label} / ${shown.ans}`);
      }
      await pg.evaluate(() => document.querySelector('#next')?.click());
      await pg.waitForTimeout(100);
    }
    check(`${label}: せんたくしが 4つで ダブりなし`, bad === 0, `${bad}もん おかしい`);
    check(`${label}: ○が かならず 1つ`, marked === 10, `${marked}/10`);
  }
  check('○の ボタンと こたえあわせが あう', !fails.some(f => f.includes('○の ボタン')));

  console.log('\n' + results.join('\n'));
  if (fails.length) { console.log('\nこまかい しっぱい:'); fails.slice(0, 10).forEach(f => console.log(' -', f)); }
  const ng = results.filter(r => r.startsWith('NG')).length + fails.length;
  console.log(`\nしっぱい ${ng}件 / JSエラー ${errs.length ? errs.slice(0, 3).join(' | ') : 'なし'}`);
  if (ng || errs.length) process.exitCode = 1;
} catch (e) {
  console.log('!! とまった:', e.message.split('\n')[0]);
  console.log(results.join('\n'));
  process.exitCode = 1;
} finally { try { await b.close(); } catch {} }
