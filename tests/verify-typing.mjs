// タイピングの もんだい・ゆびの わりあて・てんすうを たしかめる。
// こたえは アプリの なかみから とるのでは なく、テスト側で もう いちど かぞえて てらす。
// つかいかた: node tests/verify-typing.mjs （リポジトリの ルートで）
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  const { execSync } = await import('node:child_process');
  const root = execSync('npm root -g').toString().trim();
  ({ chromium } = await import(`${root}/playwright/index.mjs`));
}

const results = [];
const check = (n, c, x = '') => results.push(`${c ? 'OK  ' : 'NG  '} ${n}${x ? ' … ' + x : ''}`);

// テスト側が もって いる ゆびの わりあて（アプリの FINGER とは べつに かく）
const FING = {};
const put = (keys, y, hand) => { for (const k of keys) FING[k] = { y, hand }; };
put('1qaz', 4, 0); put('2wsx', 3, 0); put('3edc', 2, 0); put('45rtfgvb', 1, 0);
put('67yuhjnm', 1, 1); put('8ik,', 2, 1); put('9ol.', 3, 1); put('0p;/', 4, 1);
const YUBI = { 1: 'ひとさしゆび', 2: 'なかゆび', 3: 'くすりゆび', 4: 'こゆび', 5: 'おやゆび' };
const HAND = { 0: 'ひだり', 1: 'みぎ' };
// レベル1の もじは ホームポジションの 8つだけ
const HOME8 = new Set([...'asdfjkl;']);

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 430, height: 950 } });
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
await pg.waitForTimeout(1200);

const peek = () => pg.evaluate(() => ({
  chips: [...document.querySelectorAll('#ty-chips span')].map(s => s.textContent).join(''),
  done: [...document.querySelectorAll('#ty-chips span')].findIndex(s => s.classList.contains('now')),
  next: document.querySelector('#ty-kbd .kbd-key.next')?.dataset.k ?? null,
  yubi: document.getElementById('ty-yubi').textContent.trim(),
  hit: Number(document.getElementById('ty-st-hit').textContent),
  miss: Number(document.getElementById('ty-st-miss').textContent),
  score: Number(document.getElementById('ty-st-score').textContent),
}));

async function startCourse(course, lv) {
  await pg.evaluate(() => document.querySelector('#ty-home, #ty-back')?.click());
  await pg.click('.mode[data-app="typing"]');
  await pg.waitForTimeout(200);
  await pg.click(`#ty-courses .mode[data-c="${course}"]`);
  await pg.click(`#ty-levels .lv[data-lv="${lv}"]`);
  await pg.click('#ty-modes [data-md="practice"]');
  await pg.click('#ty-start');
  await pg.waitForTimeout(3600);       // 3・2・1・スタート！
}

const fails = [];
try {
  // ===== 1) もじコース レベル1：ホームポジションの 8キーだけ・ゆびの あんないが あう =====
  await startCourse('moji', 1);
  let seen = new Set();
  for (let i = 0; i < 10; i++) {
    const p = await peek();
    if (!p.next) { fails.push(`もじ lv1: ${i}もん目で つぎの キーが 出ない`); break; }
    seen.add(p.next);
    if (!HOME8.has(p.next)) fails.push(`もじ lv1: ホームポジション いがいが 出た（${p.next}）`);
    const f = FING[p.next];
    const want = `${HAND[f.hand]}の ${YUBI[f.y]}で ${p.next.toUpperCase()}`;
    if (p.yubi.replace(/\s+/g, ' ') !== want) fails.push(`ゆびの あんないが ちがう: ${p.yubi} ≠ ${want}`);
    await pg.keyboard.press(p.next);
    await pg.waitForTimeout(60);
  }
  check('もじ lv1: ホームポジションの キーだけ 出る', !fails.some(f => f.includes('ホームポジション')), `${[...seen].sort().join('')}`);
  check('もじ lv1: ゆびの あんないが あって いる', !fails.some(f => f.includes('ゆびの あんない')));
  // 10もんで けっかへ
  await pg.waitForTimeout(600);
  const after = await pg.evaluate(() => ({
    screen: ['typing', 'tyquiz', 'tyresult'].find(id => !document.getElementById(id).hidden),
    score: document.getElementById('ty-stamp').textContent,
  }));
  check('れんしゅう 10もんで けっかに いく', after.screen === 'tyresult', JSON.stringify(after));
  // ミス 0・10れんぞくの てんすう: (100 + 50 + min(n,10)*10) の ごうけい
  let want = 0;
  for (let n = 1; n <= 10; n++) want += 100 + 50 + Math.min(n, 10) * 10;
  check('ミスなし 10もんの てんすうが けいさんと あう',
    after.score.includes(String(want)), `${after.score} / けいさんでは ${want}てん`);

  // ===== 2) まちがえた キーは すすまない・ミスが ふえる =====
  await pg.click('#ty-home');
  await startCourse('moji', 1);
  let p = await peek();
  const wrong = [...'asdfjkl;'].find(k => k !== p.next);
  await pg.keyboard.press(wrong);
  await pg.waitForTimeout(150);
  const p2 = await peek();
  check('ちがう キーでは 先に すすまない', p2.next === p.next && p2.hit === 0, `${p.next} → ${p2.next}`);
  check('ちがう キーで ミスが 1 ふえる', p2.miss === 1, `ミス ${p2.miss}`);
  check('ちがう キーでは てんすうが つかない', p2.score === 0, `スコア ${p2.score}`);

  // ===== 3) すうじコース レベル3：3けたの すうじが 出る =====
  await pg.evaluate(() => document.getElementById('quit').click());
  await startCourse('num', 3);
  p = await peek();
  check('すうじ lv3: 3けたの すうじが 出る', /^[0-9]{3}$/.test(p.chips), p.chips);
  check('すうじ lv3: つぎの キーは その 1もじ目', p.next === p.chips[0], `${p.chips} → ${p.next}`);

  // ===== 4) たんごコース レベル1：3もじの えいたんご =====
  await pg.evaluate(() => document.getElementById('quit').click());
  await startCourse('word', 1);
  p = await peek();
  check('たんご lv1: 3もじの たんごが 出る', /^[a-z]{3}$/.test(p.chips), p.chips);

  // ===== 5) ローマじコース：ひらがなが 出て ローマじを うつ =====
  await pg.evaluate(() => document.getElementById('quit').click());
  await startCourse('roma', 1);
  const roma = await pg.evaluate(() => ({
    kana: document.getElementById('ty-prompt').textContent,
    chips: [...document.querySelectorAll('#ty-chips span')].map(s => s.textContent).join(''),
  }));
  check('ローマじ: ひらがなを 見せて ローマじを うつ',
    /^[ぁ-ん]+$/.test(roma.kana) && /^[A-Z]+$/.test(roma.chips), JSON.stringify(roma));

  console.log('\n' + results.join('\n'));
  if (fails.length) { console.log('\nこまかい しっぱい:'); fails.slice(0, 8).forEach(f => console.log(' -', f)); }
  const ng = results.filter(r => r.startsWith('NG')).length + fails.length;
  console.log(`\nしっぱい ${ng}件 / JSエラー ${errs.length ? errs.join(' | ') : 'なし'}`);
  if (ng || errs.length) process.exitCode = 1;
} catch (e) {
  console.log('!! とまった:', e.message.split('\n')[0]);
  console.log(results.join('\n'));
  process.exitCode = 1;
} finally { try { await b.close(); } catch {} }
