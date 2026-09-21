// かんじアプリを たしかめる。
//  1) かんじの ひょう（かくすう・よみ・がくねん）が おかしく ないか
//  2) よみ／かきとりの せんたくしが 4つで ダブって いないか、○と こたえが あうか
//  3) なぞりがきの はんていが ほんとうに 見わけられるか
//     お手本の せんは 1かくずつ SVGで もって いるので、テストも「ほんものの ように
//     1かくずつ なぞる」ことが できる。かきじゅん・むき・かくすうを 見て いるかを、
//     わざと まちがえた ひきかたで てらす（ぬりつぶしも ここで おとす）。
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
  window.__said = [];
  class U { constructor(t){ this.text=t;this.onend=null;this.onerror=null;this.lang=''; } }
  window.SpeechSynthesisUtterance = U;
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
    getVoices:()=>[{ name:'Kyoko', lang:'ja-JP', localService:true }],
    speak:(u)=>{ window.__said.push(String(u.text)); setTimeout(()=>u.onend&&u.onend(),10); },
    cancel:()=>{}, onvoiceschanged:null }});
  try { localStorage.setItem('sn-players', JSON.stringify(['はると']));
        localStorage.setItem('sn-current','はると');
      // テストの あいだは れんぞく時間の せいげんを 切る（そこは verify-timelimit.mjs が みる）
      localStorage.setItem('sn-limit', JSON.stringify({ 'n:はると': 0 })); } catch {}
`);
const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', e => errs.push(String(e)));
await pg.goto('file://' + process.cwd() + '/index.html');
await pg.waitForTimeout(1300);

/* なぞりを 中から つくる。ざひょうは お手本と おなじ 109×109。
     'real'   … お手本を 1かくずつ、かきじゅんの とおりに 手ぶれつきで なぞる
                （ほんものの 子に いちばん ちかい。これが とおらないと はなしに ならない）
     'fast'   … おなじだが てんが 4つだけ（さっと ひく子）
     'order'  … かきじゅんを さかさまに する（ばしょは あって いる）
     'back'   … いちは あって いるが、1かくずつ ぎゃくむきに ひく
     'few'    … さいごの 1かくを かかない
     'extra'  … ぜんぶ かいた あと よけいに 1かく ふやす
     'nuri'   … よこに ぬりつぶす（むかしの しくみなら とおって いた やりかた）
     'scrawl' … ななめの せんを 2ほん（らくがき）
     'none'   … なにも かかない                                            */
async function traceAs(kind) {
  return pg.evaluate((kind) => {
    const VB = 109;
    const cv = document.getElementById('kj-canvas');
    const r = cv.getBoundingClientRect();
    const send = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, {
      clientX: r.left + x * (r.width / VB), clientY: r.top + y * (r.height / VB),
      bubbles: true, pointerId: 1,
    }));
    const draw = (pts) => {
      if (pts.length < 2) return;
      send('pointerdown', pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) send('pointermove', pts[i].x, pts[i].y);
      send('pointerup', pts[pts.length - 1].x, pts[pts.length - 1].y);
    };
    if (kind === 'none') return 0;

    if (kind === 'scrawl') {
      draw(Array.from({ length: 21 }, (_, i) => ({ x: 10 + i * 4.4, y: 10 + i * 4.4 })));
      draw(Array.from({ length: 21 }, (_, i) => ({ x: 99 - i * 4.4, y: 10 + i * 4.4 })));
      return 2;
    }
    if (kind === 'nuri') {
      let n = 0;
      for (let y = 10; y < 100; y += 4) { draw([{ x: 10, y }, { x: 99, y }]); n++; }
      return n;
    }

    const els = [...document.querySelectorAll('#kj-gstrokes .gs')];
    const sample = (el, n) => {
      const len = el.getTotalLength(), out = [];
      for (let i = 0; i <= n; i++) { const p = el.getPointAtLength((len * i) / n); out.push({ x: p.x, y: p.y }); }
      return out;
    };
    // 子どもの 手ぶれ（マスの 3％ぐらい ゆれる）
    const wob = (pts) => pts.map((p, i) => ({ x: p.x + Math.sin(i * 1.7) * 3, y: p.y + Math.cos(i * 2.3) * 3 }));

    let order = els.map((_, i) => i);
    if (kind === 'order') order = order.slice().reverse();
    if (kind === 'few') order = order.slice(0, -1);
    for (const i of order) {
      let pts = sample(els[i], kind === 'fast' ? 3 : 14);
      if (kind === 'back') pts = pts.slice().reverse();
      draw(kind === 'fast' ? pts : wob(pts));
    }
    if (kind === 'extra') draw([{ x: 12, y: 96 }, { x: 40, y: 96 }]);
    return order.length + (kind === 'extra' ? 1 : 0);
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
      yomi: document.querySelector('.kjyomi').firstChild.textContent.trim(),
      ex: document.querySelector('.kjyomi span')?.textContent || '',
      // かくすうは お手本の せんを かぞえて とる（画面の 字を 見ない）
      strokes: document.querySelectorAll('#kj-gstrokes .gs').length,
      step: document.getElementById('kj-step').textContent,
      n: document.getElementById('qnum').textContent,
    }));
    seen.set(got.kanji, got);
    // つぎの もんだいへ（なぞらずに けす → できた が おせないので、じかに すすめる）
    const last = await pg.evaluate(() => {
      const el = document.getElementById('qnum');
      return el.textContent === '10';
    });
    if (last) { await startKanji('kj-trace', 3); } else {
      await traceAs('real');
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
    if (!v.ex.includes(k)) fails.push(`見本の ことばに その字が ない: ${k} → ${v.ex}`);
    if (v.step !== `1／${STROKES[k]}かく目`) fails.push(`かくの あんない が ちがう: ${k} → ${v.step}`);
  }
  check('お手本の せんの かずが テスト側の かくすうと あう', !fails.some(f => f.includes('かくすう')),
    `${seen.size}字 しらべた`);
  check('よみは ぜんぶ ひらがな', !fails.some(f => f.includes('よみが')));
  check('見本の ことばに その かんじが 入って いる', !fails.some(f => f.includes('見本の')));
  check('「1／○かく目」の あんないが かくすうと あう', !fails.some(f => f.includes('かくの あんない')));

  // ===== 2) なぞりがきの はんてい =====
  // 1かいぶん：けして → ひいて →「できた」を おして、○か ✕かと ケロの ことばを とる
  const tryOnce = async (kind) => {
    await pg.evaluate(() => { document.getElementById('kj-clear')?.click(); });
    const kanji = await pg.evaluate(() =>
      document.getElementById('kj-canvas').getAttribute('aria-label').slice(0, 1));
    const drew = await traceAs(kind);
    const can = await pg.evaluate(() => !document.getElementById('go').disabled);
    if (!can) return { kanji, drew, empty: true, ok: false, said: '' };
    await pg.click('#go');
    await pg.waitForTimeout(220);
    const r = await pg.evaluate(() => ({
      ok: !document.querySelector('.judge').classList.contains('ng'),
      said: document.querySelector('.judge')?.textContent.replace(/\s+/g, ' ').trim() || '',
      shu: document.querySelectorAll('#kj-gstrokes .gs.bad').length,
    }));
    await pg.evaluate(() => document.querySelector('#next')?.click());
    await pg.waitForTimeout(150);
    return { kanji, drew, empty: false, ...r };
  };
  // おなじ ひきかたを 3もんずつ ためす（かんじに よって あたり方が ちがうので）
  const tryKind = async (kind, n = 3, lv = 2) => {
    await startKanji('kj-trace', lv);        // 1セット10もんを こえない ように かけなおす
    const got = [];
    for (let i = 0; i < n; i++) got.push(await tryOnce(kind));
    return got;
  };
  const shown = (a) => a.map((x) => `${x.kanji}${x.empty ? 'かけない' : x.ok ? '○' : '✕'}`).join(' / ');

  const real = await tryKind('real');
  const real1 = await tryKind('real', 3, 1);
  const real3 = await tryKind('real', 3, 3);
  const fast = await tryKind('fast');
  const order = await tryKind('order');
  const back = await tryKind('back');
  const few = await tryKind('few');
  const extra = await tryKind('extra');
  const nuri = await tryKind('nuri');
  const scrawl = await tryKind('scrawl');
  const none = await tryKind('none', 1);

  check('ほんものの ように 1かくずつ なぞったら せいかい（いちばん たいせつ）',
    real.every((x) => x.ok === true), shown(real));
  check('レベル1（かくすうの すくない 字）でも せいかい', real1.every((x) => x.ok === true), shown(real1));
  check('レベル3（かくすうの おおい 字）でも せいかい', real3.every((x) => x.ok === true), shown(real3));
  check('てんが すくない さっとした せんでも せいかい', fast.every((x) => x.ok === true), shown(fast));
  check('かきじゅんが さかさまなら まちがい', order.every((x) => x.ok === false), shown(order));
  check('1かくずつ ぎゃくむきに ひいたら まちがい', back.every((x) => x.ok === false), shown(back));
  check('さいごの 1かくが ぬけたら まちがい', few.every((x) => x.ok === false), shown(few));
  check('よけいに 1かく ふえたら まちがい', extra.every((x) => x.ok === false), shown(extra));
  check('ぬりつぶしは とおらない（むかしの しくみとの ちがい）',
    nuri.every((x) => x.ok === false), shown(nuri));
  check('らくがきは まちがい', scrawl.every((x) => x.ok === false), shown(scrawl));
  check('なにも かかないと「できた」が おせない', none[0].empty === true, shown(none));

  // ケロの ことばが 「なにを まちがえたか」を いって いるか
  check('かくすうが ちがう ときは かくすうを おしえる',
    few.every((x) => /ほんとうは/.test(x.said)), few.map((x) => x.said.slice(0, 40)).join(' | '));
  check('ずれた ときは なんかく目かを おしえる',
    back.every((x) => /かく目|ほんとうは/.test(x.said)), back.map((x) => x.said.slice(0, 40)).join(' | '));
  // なぞれなかった かくは お手本が 朱に なる（先生の 赤ペン）
  check('なぞれなかった かくは お手本が 朱に なる',
    few.every((x) => x.shu >= 1) && real.every((x) => x.shu === 0),
    `ぬけたとき ${few.map((x) => x.shu).join(',')}ぽん / なぞれたとき ${real.map((x) => x.shu).join(',')}ぽん`);

  // 「1かく もどす」と かきじゅんの さいせい
  await startKanji('kj-trace', 2);
  const undo = await pg.evaluate(async () => {
    const VB = 109, cv = document.getElementById('kj-canvas');
    const r = cv.getBoundingClientRect();
    const send = (t, x, y) => cv.dispatchEvent(new PointerEvent(t, {
      clientX: r.left + x * (r.width / VB), clientY: r.top + y * (r.height / VB), bubbles: true, pointerId: 1 }));
    const el = document.querySelector('#kj-gstrokes .gs'), len = el.getTotalLength();
    const p = (i) => el.getPointAtLength((len * i) / 8);
    send('pointerdown', p(0).x, p(0).y);
    for (let i = 1; i <= 8; i++) send('pointermove', p(i).x, p(i).y);
    send('pointerup', p(8).x, p(8).y);
    const after = document.getElementById('kj-step').textContent;
    document.getElementById('kj-undo').click();
    return { after, back: document.getElementById('kj-step').textContent,
      go: document.getElementById('go').disabled };
  });
  check('1かく ひくと あんないが つぎの かくに すすむ', /^2／/.test(undo.after), undo.after);
  check('「1かく もどす」で 1つ まえに もどる', /^1／/.test(undo.back) && undo.go === true,
    `${undo.back} / できた=${undo.go ? 'おせない' : 'おせる'}`);

  await pg.click('#kj-order');
  await pg.waitForTimeout(900);
  const playing = await pg.evaluate(() => document.querySelectorAll('#kj-anim .kjanim').length);
  check('「かきじゅん」で お手本が 1かくずつ 出る', playing >= 1, `${playing}ぽん 出て いる`);
  await pg.waitForTimeout(400);

  // ===== 3) よみ・かきとりの せんたくし =====
  for (const [mode, label] of [['kj-yomi', 'よみ'], ['kj-kaki', 'かきとり'], ['kj-word', 'たんご']]) {
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

  // ===== 4) たんご（ことばの ◯に 入る かんじ） =====
  // ◯の よみが おなじ かんじは、こたえが 2つに なって しまうので えらびしに 出して はいけない。
  // テスト側で その くみを もって おいて てらす（アプリの ひょうは 見ない）。
  const SAME_YOMI = [['気', '木'], ['千', '先'], ['田', '立']];
  const partnerOf = (k) => { for (const [a, b] of SAME_YOMI) { if (a === k) return b; if (b === k) return a; } return null; };

  const words = [];
  for (let set = 0; set < 6; set++) {
    await startKanji('kj-word', (set % 3) + 1);    // レベル1・2・3 を 2セットずつ（60もん）
    for (let i = 0; i < 10; i++) {
      const q = await pg.evaluate(() => ({
        word: document.querySelector('.kjw-word')?.textContent.trim() ?? '',
        yomi: document.querySelector('.kjw-yomi')?.textContent.trim() ?? '',
        picks: [...document.querySelectorAll('.pick')].map((e) => e.textContent.trim()),
        btn: document.getElementById('replay')?.textContent.trim() ?? '',
      }));
      await pg.evaluate(() => { window.__said = []; document.getElementById('replay')?.click(); });
      await pg.waitForTimeout(80);
      const said = await pg.evaluate(() => (window.__said || []).slice());
      await pg.click('.pick[data-c="0"]');
      await pg.waitForTimeout(150);
      const ans = await pg.evaluate(() => ({
        marked: [...document.querySelectorAll('.pick.ans')].map((e) => e.textContent.trim()),
        say: document.querySelector('.judge .say p b')?.textContent ?? '',
      }));
      words.push({ ...q, said, ...ans });
      await pg.evaluate(() => document.querySelector('#next')?.click());
      await pg.waitForTimeout(100);
    }
  }

  for (const w of words) {
    if ((w.word.match(/◯/g) || []).length !== 1) fails.push(`たんご: ◯が 1つで ない（${w.word}）`);
    if (!/^[ぁ-んー◯]+$/.test(w.word)) fails.push(`たんご: ひらがなと ◯ いがいが ある（${w.word}）`);
    if (!/^[ぁ-んー]+$/.test(w.yomi)) fails.push(`たんご: よみが ひらがなで ない（${w.yomi}）`);
    const [pre, post] = w.word.split('◯');
    if (!w.yomi.startsWith(pre) || !w.yomi.endsWith(post)) {
      fails.push(`たんご: ことばと よみが あわない（${w.word} / ${w.yomi}）`);
      continue;
    }
    const blank = w.yomi.slice(pre.length, w.yomi.length - post.length);
    if (!blank) fails.push(`たんご: ◯の よみが からっぽ（${w.word} / ${w.yomi}）`);
    const k = w.marked[0] || '';
    const bad = partnerOf(k);
    if (bad && w.picks.includes(bad)) {
      fails.push(`たんご: ◯の よみが おなじ かんじが えらびしに ある（こたえ ${k} なのに ${bad} が ある: ${w.picks.join(',')}）`);
    }
  }
  check('たんご: ことばは ひらがな＋◯ 1つ', !fails.some((f) => f.includes('◯が 1つ') || f.includes('いがいが ある')),
    `${words.length}もん しらべた`);
  check('たんご: ことばと よみが かみあう', !fails.some((f) => f.includes('あわない') || f.includes('からっぽ')),
    words[0] ? `れい: ${words[0].word} / ${words[0].yomi}` : '');
  const conflicts = words.filter((w) => partnerOf(w.marked[0] || '')).length;
  check('たんご: ◯の よみが おなじ かんじは えらびしに 出さない',
    !fails.some((f) => f.includes('よみが おなじ')) && conflicts > 0,
    conflicts > 0 ? `${conflicts}もんが 気／木・千／先・田／立 だった`
      : 'その かんじが 1もんも 出なかった（ためせて いない）');
  check('たんご: 「もんだいを きく」で ことばの よみを よむ',
    words.every((w) => w.said.length === 1 && w.said[0] === w.yomi),
    words[0] ? `れい: ${JSON.stringify(words[0].said)} / ${words[0].yomi}` : '');
  check('たんご: ことばが たくさん 出る', new Set(words.map((w) => w.word + w.yomi)).size >= 20,
    `${new Set(words.map((w) => w.word + w.yomi)).size}しゅるい / ${words.length}もん`);

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
