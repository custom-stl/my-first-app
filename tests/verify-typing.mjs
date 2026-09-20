// かずうち ゲームを、ブラウザの とけいを とめて 1きーずつ たしかめる。
//   ・でてくる かずの けたすうが レベルどおりか
//   ・ただしい キーで「うてた」が ふえ、ちがう キーで「ミス」が ふえるか
//   ・60びょうで おわって、けっかの かずが あって いるか
//   ・さいこう きろくが のこるか
// つかいかた: node tests/verify-typing.mjs （リポジトリの ルートで）
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  const { execSync } = await import('node:child_process');
  const root = execSync('npm root -g').toString().trim();
  ({ chromium } = await import(`${root}/playwright/index.mjs`));
}

const fails = [];
const check = (cond, msg) => { if (!cond) fails.push(msg); };

const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 430, height: 950 } });
const errs = [];
pg.on('pageerror', e => errs.push(String(e)));
// とけいを とめる。すすめるのは runFor だけ（60びょう まつ ひつようが ない）
await pg.clock.install();
await pg.goto('file://' + process.cwd() + '/index.html');

const view = () => pg.evaluate(() => (['t-start', 't-play', 't-over']
  .find((id) => !document.getElementById(id).hidden) || 't-none').slice(2));
const hud = () => pg.evaluate(() => ({
  hit: Number(document.getElementById('t-hit').textContent),
  miss: Number(document.getElementById('t-miss').textContent),
  time: document.getElementById('t-time').textContent,
  digits: [...document.querySelectorAll('#t-digits span')].map(s => s.textContent).join(''),
  done: [...document.querySelectorAll('#t-digits span.done')].length,
  now: [...document.querySelectorAll('#t-digits span.now')].length,
}));

await pg.click('#to-type');
check(await view() === 'start', 'ゲームを ひらいても はじめの がめんが でない');
check(await pg.isHidden('#quit'), 'まだ はじめて いないのに「やめる」が でる');

for (const lv of [1, 2, 3]) {
  const keta = lv;
  await pg.click(`#t-levels .lv[data-lv="${lv}"]`);
  check(await pg.getAttribute(`#t-levels .lv[data-lv="${lv}"]`, 'aria-pressed') === 'true',
    `lv${lv} レベルの ボタンが えらばれない`);
  // ホームがわの レベルも いっしょに かわる
  check(await pg.getAttribute(`#levels .lv[data-lv="${lv}"]`, 'aria-pressed') === 'true',
    `lv${lv} ホームの レベルが ついてこない`);

  await pg.click('#t-go');
  check(await view() === 'play', `lv${lv} スタートで ゲームの がめんに ならない`);
  check(await pg.isVisible('#quit'), `lv${lv} あそんで いる あいだ「やめる」が でない`);
  await pg.clock.runFor(3000);            // 3・2・1・スタート！
  check(await pg.isHidden('#t-ready'), `lv${lv} カウントダウンが きえない`);

  let hit = 0, miss = 0;
  for (let i = 0; i < 8; i++) {
    const s = await hud();
    check(s.digits.length === keta, `lv${lv} けたすうが ${s.digits.length}（${keta} のはず）: ${s.digits}`);
    check(/^\d+$/.test(s.digits), `lv${lv} すうじで ない: ${s.digits}`);
    check(s.now === 1 && s.done === 0, `lv${lv} うつ ばしょの しるしが へん: ${JSON.stringify(s)}`);

    if (i === 3) {                         // わざと ちがう キーを おす
      const bad = String((Number(s.digits[0]) + 1) % 10);
      await pg.keyboard.press(bad);
      miss++;
      const after = await hud();
      check(after.miss === miss, `lv${lv} ミスが ふえない: ${after.miss}`);
      check(after.done === 0, `lv${lv} ミスなのに すすんで しまう`);
      check(after.digits === s.digits, `lv${lv} ミスで かずが かわって しまう`);
    }
    for (const d of s.digits) await pg.keyboard.press(d);
    hit++;
    const after = await hud();
    check(after.hit === hit, `lv${lv} うてた かずが ${after.hit}（${hit} のはず）`);
    await pg.clock.runFor(300);            // つぎの かずが でる まで
  }
  // のこり じかんの ひょうじが へって いるか
  const before = Number((await hud()).time);
  await pg.clock.runFor(2000);
  const later = Number((await hud()).time);
  check(later < before, `lv${lv} のこり じかんが へらない（${before} → ${later}）`);

  await pg.clock.runFor(60000);            // じかんぎれ
  check(await view() === 'over', `lv${lv} じかんが きても けっかに ならない`);
  const res = await pg.evaluate(() => ({
    sub: document.querySelector('#t-stamp .sub').textContent,
    big: document.querySelector('#t-stamp .big').textContent,
    stars: document.querySelectorAll('#t-stars').length,
    cheers: [...document.querySelectorAll('#t-cheers .cheer')].map(c => c.textContent.trim()),
    bubble: document.getElementById('t-bubble').textContent,
  }));
  check(res.sub === `${hit}こ`, `lv${lv} けっかの かずが ${res.sub}（${hit}こ のはず）`);
  check(res.big.startsWith(`${keta}けた`), `lv${lv} けっかの みだしが へん: ${res.big}`);
  check(res.cheers.some(c => c.includes(`${miss}かい`)) || miss === 0,
    `lv${lv} ミスの かずが ほめことばに ない: ${JSON.stringify(res.cheers)}`);
  check(res.bubble.includes(String(hit)), `lv${lv} ふきだしに かずが ない: ${res.bubble}`);

  // さいこう きろくが のこって いるか
  await pg.click('#t-back');
  check(await view() === 'start', `lv${lv} 「けたを かえる」で もどれない`);
  check(await pg.isHidden('#quit'), `lv${lv} けっかの あとも「やめる」が でたまま`);
  const best = await pg.textContent('#t-best');
  check(best.includes(`${hit}`), `lv${lv} さいこう きろくが でない: ${best}`);
  const saved = await pg.evaluate(() => localStorage.getItem('sn-type-best--3') !== null
    || Object.keys(localStorage).some(k => k.startsWith('sn-type-best-')));
  check(saved, `lv${lv} さいこう きろくが ほぞん されない`);
}

// ホームに もどれる
await pg.click('#t-home');
check(await pg.isHidden('#type'), 'ホームへ で ゲームの がめんが きえない');
check(await pg.isHidden('#quit'), 'ホームで「やめる」が でたまま');
check(await pg.isVisible('#to-type'), 'ホームに ゲームの ボタンが ない');

// カウントダウンの とちゅうで やめても、あとから かってに はじまらない
await pg.click('#to-type');
await pg.click('#t-go');
await pg.clock.runFor(2200);             // 「スタート！」が でて いる あいだ
await pg.click('#quit');
check(await pg.isHidden('#type'), 'とちゅうで やめても ゲームの がめんが のこる');
const stopped = await pg.evaluate(() => document.getElementById('t-time').textContent);
await pg.clock.runFor(5000);
check(await pg.isHidden('#type'), 'やめた あとに ゲームが はじまって しまう');
check(await pg.evaluate(() => document.getElementById('t-time').textContent) === stopped,
  'やめた あとも タイマーが うごいて いる');

// さんすうの きろくは よごさない
const log = await pg.evaluate(() => JSON.parse(localStorage.getItem('sn-log-v1') || '[]'));
check(log.length === 0, `ゲームが さんすうの きろくに はいって しまう（${log.length}件）`);

console.log('しっぱい:', fails.length);
fails.slice(0, 12).forEach(f => console.log(' -', f));
console.log('JS errors:', errs.length ? errs.slice(0, 5).join(' | ') : 'none');
await b.close();
process.exit(fails.length || errs.length ? 1 : 0);
