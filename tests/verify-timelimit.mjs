// れんぞくで やる じかんの せいげん（人ごと・きほん 15ふん）を たしかめる。
//
// 15ふん まつ わけには いかないので、**つづけて いる じかんを localStorage に
// 入れて から ひらく**（アプリも そこを 見て いる）。
// ここで 見て いるのは:
//   ・なにも きめて いない 人は 15ふん
//   ・人ごとに べつべつに きめられる
//   ・こえたら きゅうけいに なる。ただし **もんだいの とちゅうでは 出ない**
//   ・**ひらきなおしても にげられない**（リロードで リセットできたら せいげんに ならない）
//   ・5ふん いじょう あけたら かぞえなおし
//   ・「せいげん なし」に すると 出ない
//   ・きゅうけい中でも おとなは せっていの がめんに 行ける
// つかいかた: node tests/verify-timelimit.mjs （リポジトリの ルートで）
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  const { execSync } = await import('node:child_process');
  const root = execSync('npm root -g').toString().trim();
  ({ chromium } = await import(`${root}/playwright/index.mjs`));
}

const results = [];
const check = (n, c, x = '') => results.push(`${c ? 'OK  ' : 'NG  '} ${n}${x ? ' … ' + x : ''}`);
const MIN = 60000;
const b = await chromium.launch();
const errs = [];
const APP = 'file://' + process.cwd() + '/index.html';

// まっさらな たんまつを つくる。session / limit は こちらで きめて から ひらく。
async function device({ players = ['はると'], current = 'はると', limit = null, session = null } = {}) {
  const ctx = await b.newContext({ viewport: { width: 430, height: 950 } });
  await ctx.addInitScript(`
    class U { constructor(t){ this.text=t;this.onend=null;this.onerror=null; } }
    window.SpeechSynthesisUtterance = U;
    Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
      getVoices:()=>[], speak:()=>{}, cancel:()=>{}, onvoiceschanged:null }});
    try {
      localStorage.setItem('sn-players', ${JSON.stringify(JSON.stringify(players))});
      localStorage.setItem('sn-current', ${JSON.stringify(current)});
      // **1かいだけ** 入れる。リロードの テストで 入れなおすと、
      // 「ひらきなおしても にげられない」を ためせなく なる。
      ${limit ? `if (!localStorage.getItem('sn-limit')) localStorage.setItem('sn-limit', ${JSON.stringify(JSON.stringify(limit))});` : ''}
      ${session ? `if (!localStorage.getItem('sn-session')) localStorage.setItem('sn-session', ${JSON.stringify(JSON.stringify(session))});` : ''}
    } catch {}
  `);
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push(String(e)));
  await pg.goto(APP);
  await pg.waitForTimeout(900);
  return { ctx, pg };
}

const screenOf = (pg) => pg.evaluate(() =>
  ['top', 'home', 'eigo', 'kanji', 'typing', 'quiz', 'tyquiz', 'result', 'tyresult', 'history', 'team', 'child', 'rest']
    .find((id) => !document.getElementById(id).hidden) ?? '(なし)');

// ひっさんを 1もん といて、つぎへ すすめる
async function answerOne(pg) {
  const v = await pg.evaluate(() => {
    const r = [...document.querySelectorAll('.hz-row')].map((x) => x.textContent.trim());
    const a = Number(r[0]), op = r[1][0], bb = Number(r[1].slice(1));
    return String(op === '＋' ? a + bb : a - bb);
  });
  for (const d of v) await pg.keyboard.press(d);
  await pg.keyboard.press('Enter');
  await pg.waitForTimeout(150);
}

const ago = (m) => Date.now() - m * MIN;

try {
  // ===== 1) なにも きめて いない 人は 15ふん =====
  {
    const A = await device();
    await A.pg.click('#to-history');
    await A.pg.waitForTimeout(900);
    const got = await A.pg.evaluate(() => ({
      sel: document.querySelector('#limit-list select')?.value,
      opts: [...document.querySelectorAll('#limit-list option')].map((o) => o.textContent),
      msg: document.getElementById('limit-msg').textContent.trim(),
    }));
    check('きめて いない 人は 15ふん', got.sel === '15', `${got.sel}ふん`);
    check('えらべる じかんが ならぶ', got.opts.includes('せいげん なし') && got.opts.includes('15ふん'), got.opts.join('/'));
    check('いまの つづけて いる じかんを 出す', /つづけて/.test(got.msg), got.msg);
    await A.ctx.close();
  }

  // ===== 2) 人ごとに べつべつ =====
  {
    const A = await device({ players: ['はると', 'さくら'] });
    await A.pg.click('#to-history');
    await A.pg.waitForTimeout(900);
    await A.pg.selectOption('#limit-list select[data-limit-for="さくら"]', '10');
    await A.pg.waitForTimeout(250);
    const saved = await A.pg.evaluate(() => JSON.parse(localStorage.getItem('sn-limit') || '{}'));
    check('人ごとに じかんを きめられる', saved['n:さくら'] === 10, JSON.stringify(saved));
    const sels = await A.pg.evaluate(() =>
      [...document.querySelectorAll('#limit-list select')].map((s) => `${s.dataset.limitFor}=${s.value}`));
    check('ほかの 人の じかんは かわらない', sels.includes('はると=15') && sels.includes('さくら=10'), sels.join(' '));
    await A.ctx.close();
  }

  // ===== 3) もんだいの とちゅうでは 出ない／1もんの くぎりで 出る =====
  {
    // まだ こえて いない（14ふん）ところから はじめて、といて いる さいちゅうに 16ふんに する
    const A = await device({ session: { 'n:はると': { start: ago(14), last: Date.now(), restUntil: 0 } } });
    check('こえて いなければ ふつうに トップ', await screenOf(A.pg) === 'top', await screenOf(A.pg));
    await A.pg.click('.mode[data-app="home"]');
    await A.pg.click('.mode[data-mode="calc"]');
    await A.pg.waitForTimeout(600);
    await A.pg.evaluate((t) => {
      const all = JSON.parse(localStorage.getItem('sn-session') || '{}');
      all['n:はると'].start = t;                 // といて いる あいだに じかんを こえた ことに する
      localStorage.setItem('sn-session', JSON.stringify(all));
    }, ago(16));
    await A.pg.waitForTimeout(600);
    check('**もんだいの とちゅうでは きゅうけいに しない**', await screenOf(A.pg) === 'quiz', await screenOf(A.pg));
    await answerOne(A.pg);
    await A.pg.evaluate(() => document.querySelector('#next')?.click());
    await A.pg.waitForTimeout(400);
    check('**1もんの くぎりで きゅうけいに なる**', await screenOf(A.pg) === 'rest', await screenOf(A.pg));
    const rest = await A.pg.evaluate(() => ({
      lead: document.getElementById('rest-lead').textContent.trim(),
      left: document.getElementById('rest-left').textContent.trim(),
    }));
    check('やった ふんすうを 出す', /16ふん/.test(rest.lead), rest.lead);
    check('のこり じかんが 5ふんから へる', /^[45]:\d\d$/.test(rest.left), rest.left);

    // ===== 4) ひらきなおしても にげられない =====
    await A.pg.reload();
    await A.pg.waitForTimeout(1200);
    check('**ひらきなおしても きゅうけいの まま**', await screenOf(A.pg) === 'rest', await screenOf(A.pg));

    // ===== 5) きゅうけい中でも おとなは せっていに 行ける =====
    await A.pg.click('#rest-settings');
    await A.pg.waitForTimeout(1000);
    check('きゅうけい中でも せっていの がめんに 行ける', await screenOf(A.pg) === 'history', await screenOf(A.pg));
    const msg = await A.pg.evaluate(() => document.getElementById('limit-msg').textContent.trim());
    check('せってい欄に きゅうけい中と 出る', /きゅうけい/.test(msg), msg);

    // ===== 6) じかんを のばすと すぐ つづけられる =====
    await A.pg.selectOption('#limit-list select[data-limit-for="はると"]', '30');
    await A.pg.waitForTimeout(300);
    await A.pg.click('#hist-back');
    await A.pg.waitForTimeout(500);
    check('じかんを のばしたら きゅうけいが おわる', await screenOf(A.pg) === 'top', await screenOf(A.pg));
    await A.ctx.close();
  }

  // ===== 6b) ひらいた ときに すでに こえて いたら、はじめから きゅうけい =====
  {
    const A = await device({ session: { 'n:はると': { start: ago(20), last: Date.now(), restUntil: 0 } } });
    check('こえた まま ひらいたら すぐ きゅうけい', await screenOf(A.pg) === 'rest', await screenOf(A.pg));
    await A.ctx.close();
  }

  // ===== 7) 5ふん いじょう あけたら かぞえなおし =====
  {
    // 30ぷん まえから はじめて いるが、さいごに さわったのは 10ぷん まえ（＝ 5ふん いじょう あいた）
    const A = await device({ session: { 'n:はると': { start: ago(30), last: ago(10), restUntil: 0 } } });
    check('あいだが あいたら かぞえなおす', await screenOf(A.pg) === 'top', await screenOf(A.pg));
    const sess = await A.pg.evaluate(() => JSON.parse(localStorage.getItem('sn-session') || '{}')['n:はると']);
    check('かぞえはじめが いまに なる', Date.now() - sess.start < 30000, `${Math.round((Date.now() - sess.start) / 1000)}びょう まえ`);
    await A.ctx.close();
  }

  // ===== 8) 「せいげん なし」なら 出ない =====
  {
    const A = await device({
      limit: { 'n:はると': 0 },
      session: { 'n:はると': { start: ago(60), last: Date.now(), restUntil: 0 } },
    });
    check('せいげん なしなら 1じかん つづけても 出ない', await screenOf(A.pg) === 'top', await screenOf(A.pg));
    await A.pg.click('.mode[data-app="home"]');
    await A.pg.click('.mode[data-mode="calc"]');
    await A.pg.waitForTimeout(500);
    await answerOne(A.pg);
    await A.pg.evaluate(() => document.querySelector('#next')?.click());
    await A.pg.waitForTimeout(400);
    check('せいげん なしなら もんだいも つづく', await screenOf(A.pg) === 'quiz', await screenOf(A.pg));
    await A.ctx.close();
  }

  // ===== 9) きゅうけいが おわると じぶんで もどる =====
  {
    const A = await device({
      session: { 'n:はると': { start: ago(20), last: Date.now(), restUntil: Date.now() + 2500 } },
    });
    check('きゅうけい中に ひらくと きゅうけい画面', await screenOf(A.pg) === 'rest', await screenOf(A.pg));
    await A.pg.waitForTimeout(3500);
    check('じかんが きたら じぶんで トップに もどる', await screenOf(A.pg) === 'top', await screenOf(A.pg));
    const sess = await A.pg.evaluate(() => JSON.parse(localStorage.getItem('sn-session') || '{}')['n:はると']);
    check('おわったら かぞえなおしに なる',
      sess.restUntil === 0 && Date.now() - sess.start < 30000,
      `restUntil=${sess.restUntil} / ${Math.round((Date.now() - sess.start) / 1000)}びょう まえ`);
    await A.ctx.close();
  }

  // ===== 10) 人を かえると その人の じかんに なる =====
  {
    const A = await device({
      players: ['はると', 'さくら'],
      session: { 'n:はると': { start: ago(20), last: Date.now(), restUntil: Date.now() + 3 * MIN } },
    });
    check('はるとは きゅうけい中', await screenOf(A.pg) === 'rest', await screenOf(A.pg));
    // きゅうけい画面からは 人を かえられないので、せっていの がめんを とおって もどる
    await A.pg.click('#rest-settings');
    await A.pg.waitForTimeout(800);
    await A.pg.evaluate(() => {
      const b = [...document.querySelectorAll('#hist-who .pchip')].find((x) => x.textContent.includes('さくら'));
      if (b) b.click();
    });
    await A.pg.waitForTimeout(400);
    // さくらを えらんでから ホームへ
    await A.pg.evaluate(() => { localStorage.setItem('sn-current', 'さくら'); });
    await A.pg.click('#hist-back');
    await A.pg.waitForTimeout(600);
    check('**さくらは きゅうけいに ならない（人ごと）**', await screenOf(A.pg) === 'top', await screenOf(A.pg));
    const sess = await A.pg.evaluate(() => JSON.parse(localStorage.getItem('sn-session') || '{}'));
    check('はるとの きゅうけいは のこって いる', (sess['n:はると']?.restUntil || 0) > Date.now(),
      JSON.stringify(Object.keys(sess)));
    await A.ctx.close();
  }

  // ===== 11) きゅうけいの ながさを かえられる（みんな 共通） =====
  {
    const A = await device({ players: ['はると', 'さくら'] });
    await A.pg.click('#to-history');
    await A.pg.waitForTimeout(900);
    const one = await A.pg.evaluate(() => document.querySelectorAll('#rest-min').length);
    check('きゅうけいの ながさは 1つだけ（人ごとでは ない）', one === 1, `${one}こ`);
    const opts = await A.pg.evaluate(() =>
      [...document.querySelectorAll('#rest-min option')].map((o) => `${o.textContent}${o.selected ? '*' : ''}`));
    check('きほんは 5ふん', opts.includes('5ふん*'), opts.join('/'));
    await A.pg.selectOption('#rest-min', '10');
    await A.pg.waitForTimeout(250);
    check('えらんだ ながさが のこる',
      await A.pg.evaluate(() => localStorage.getItem('sn-rest')) === '10',
      await A.pg.evaluate(() => localStorage.getItem('sn-rest')));

    // その ながさで きゅうけいに なるか
    await A.pg.click('#hist-back');
    await A.pg.waitForTimeout(400);
    // まだ こえて いない ところから はじめて、といて いる あいだに こえさせる
    await A.pg.evaluate((t) => {
      localStorage.setItem('sn-session', JSON.stringify({ 'n:はると': { start: t, last: Date.now(), restUntil: 0 } }));
    }, ago(14));
    await A.pg.click('.mode[data-app="home"]');
    await A.pg.click('.mode[data-mode="calc"]');
    await A.pg.waitForTimeout(500);
    await A.pg.evaluate((t) => {
      const all = JSON.parse(localStorage.getItem('sn-session') || '{}');
      all['n:はると'].start = t;
      localStorage.setItem('sn-session', JSON.stringify(all));
    }, ago(16));
    await answerOne(A.pg);
    await A.pg.evaluate(() => document.querySelector('#next')?.click());
    await A.pg.waitForTimeout(400);
    const left = await A.pg.evaluate(() => document.getElementById('rest-left').textContent.trim());
    check('きめた ながさで きゅうけいに なる', /^(10:00|9:5\d)$/.test(left), left);
    await A.ctx.close();
  }

  // ===== 12) きゅうけい中でも ほかの 人が できる（左上の だいめいから トップへ） =====
  {
    const A = await device({
      players: ['はると', 'さくら'],
      session: { 'n:はると': { start: ago(20), last: Date.now(), restUntil: Date.now() + 4 * MIN } },
    });
    check('はるとは きゅうけい画面', await screenOf(A.pg) === 'rest', await screenOf(A.pg));

    // 左上の「べんきょうノート」で トップへ
    await A.pg.click('#to-top');
    await A.pg.waitForTimeout(500);
    check('**だいめいラベルを おすと トップに もどれる**', await screenOf(A.pg) === 'top', await screenOf(A.pg));
    const note = await A.pg.evaluate(() => {
      const el = document.getElementById('rest-note-top');
      return el.hidden ? '(出て いない)' : el.textContent.replace(/\s+/g, ' ').trim();
    });
    check('トップに「きゅうけい中」と のこり じかんが 出る', /はると/.test(note) && /あと \d+:\d\d/.test(note), note);

    // トップに いる あいだは きゅうけい画面に もどされない
    await A.pg.waitForTimeout(1500);
    check('トップでは きゅうけい画面に もどされない', await screenOf(A.pg) === 'top', await screenOf(A.pg));

    // さくらを えらぶと できる
    await A.pg.evaluate(() => {
      const b = [...document.querySelectorAll('#players .pchip')].find((x) => x.textContent.includes('さくら'));
      b?.click();
    });
    await A.pg.waitForTimeout(400);
    const noteAfter = await A.pg.evaluate(() => document.getElementById('rest-note-top').hidden);
    check('さくらに かえると「きゅうけい中」は 消える', noteAfter === true, `hidden=${noteAfter}`);
    await A.pg.click('.mode[data-app="home"]');
    await A.pg.click('.mode[data-mode="calc"]');
    await A.pg.waitForTimeout(600);
    check('**さくらは きゅうけい中でも もんだいが できる**', await screenOf(A.pg) === 'quiz', await screenOf(A.pg));

    // はるとに もどすと また とめられる
    await A.pg.click('#to-top');
    await A.pg.waitForTimeout(400);
    await A.pg.evaluate(() => {
      const b = [...document.querySelectorAll('#players .pchip')].find((x) => x.textContent.includes('はると'));
      b?.click();
    });
    await A.pg.waitForTimeout(300);
    check('はるとに もどすと また「きゅうけい中」が 出る',
      await A.pg.evaluate(() => !document.getElementById('rest-note-top').hidden));
    await A.pg.click('.mode[data-app="home"]');
    await A.pg.click('.mode[data-mode="calc"]');
    await A.pg.waitForTimeout(600);
    check('**はるとは はじめようと すると きゅうけいに もどる**', await screenOf(A.pg) === 'rest', await screenOf(A.pg));

    // きゅうけい画面の「ほかの 人が やる」でも おなじ
    await A.pg.click('#rest-other');
    await A.pg.waitForTimeout(400);
    check('「ほかの 人が やる」でも トップに もどれる', await screenOf(A.pg) === 'top', await screenOf(A.pg));
    await A.ctx.close();
  }

  console.log('\n' + results.join('\n'));
  const ng = results.filter((r) => r.startsWith('NG')).length;
  console.log(`\nしっぱい ${ng}件 / JSエラー ${errs.length ? errs.slice(0, 3).join(' | ') : 'なし'}`);
  if (ng || errs.length) process.exitCode = 1;
} catch (e) {
  console.log('!! とまった:', e.message.split('\n')[0]);
  console.log(results.join('\n'));
  process.exitCode = 1;
} finally { try { await b.close(); } catch {} }
