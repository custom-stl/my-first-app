// typing.html（タイピングゲーム）を、ブラウザの とけいを とめて 1キーずつ たしかめる。
//   ・4コース × 3レベルで、おだいと「うつ もじ」が かみあって いるか
//   ・つぎに おす キーと ゆびの あんないが あって いるか
//   ・ただしい キーで すすみ、ちがう キーで ミスが ふえ、先に すすまないか
//   ・れんしゅう（10もん）と ゲーム（60びょう）が ちゃんと おわるか
//   ・にがてな キー・さいこう きろくが のこるか
// つかいかた: node tests/verify-typing-app.mjs （リポジトリの ルートで）
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
const pg = await b.newPage({ viewport: { width: 760, height: 1100 } });
const errs = [];
pg.on('pageerror', e => errs.push(String(e)));
await pg.clock.install();
await pg.goto('file://' + process.cwd() + '/typing.html');

const view = () => pg.evaluate(() => ['home', 'play', 'over']
  .find((id) => !document.getElementById(id).hidden) || 'none');
const state = () => pg.evaluate(() => ({
  prompt: document.getElementById('prompt').hidden ? '' : document.getElementById('prompt').textContent,
  disp: [...document.querySelectorAll('#chips span')].map(s => s.textContent).join(''),
  done: [...document.querySelectorAll('#chips span.done')].length,
  now: [...document.querySelectorAll('#chips span.now')].length,
  next: document.querySelector('#kbd .kbd-key.next')?.dataset.k ?? null,
  yubi: document.getElementById('yubi').textContent.trim(),
  hit: Number(document.getElementById('st-hit').textContent),
  miss: Number(document.getElementById('st-miss').textContent),
  acc: Number(document.getElementById('st-acc').textContent),
}));
// 画面の「うつ もじ」から、じっさいに おす キーを もとめる（アプリの中身は 見ない）
const toKeys = (disp) => [...disp.toLowerCase()];

const COURSES = ['moji', 'word', 'roma', 'num'];
// コース・レベルごとの「うつ もじ」の ながさ（word の むずかしいは 5〜6もじ）
const KETA = { word: [[3], [4], [5, 6]], num: [[1], [2], [3]] };

check(await view() === 'home', 'ひらいても コースの がめんが でない');
check(await pg.isHidden('#quit'), 'まだ はじめて いないのに「やめる」が でる');
check((await pg.$$('#kbd .kbd-key')).length === 41, `キーボードの キーが ${(await pg.$$('#kbd .kbd-key')).length}こ（41こ のはず）`);
check((await pg.$$('#kbd .kbd-key.home')).length === 2, 'ホームポジション（F・J）の しるしが 2つ ない');

/* ---------- れんしゅう：4コース × 3レベル ---------- */
await pg.click('.md[data-md="practice"]');
for (const course of COURSES) {
  for (const lv of [1, 2, 3]) {
    await pg.click(`.course[data-c="${course}"]`);
    await pg.click(`.lv[data-lv="${lv}"]`);
    check(await pg.getAttribute(`.course[data-c="${course}"]`, 'aria-pressed') === 'true',
      `${course} コースが えらばれない`);
    await pg.click('#start');
    check(await view() === 'play', `${course} lv${lv} スタートで がめんが かわらない`);
    check(await pg.isVisible('#quit'), `${course} lv${lv} あそぶ あいだ「やめる」が でない`);
    await pg.clock.runFor(3000);                 // 3・2・1・スタート！

    let hit = 0, miss = 0, keys = 0;
    for (let q = 0; q < 10; q++) {
      const s = await state();
      const want = toKeys(s.disp);
      // おだいの ながさが レベルどおりか（ローマじの lv1/2 は かな1文字ぶん）
      if (KETA[course]) {
        const ok = KETA[course][lv - 1];
        check(ok.includes(s.disp.length),
          `${course} lv${lv} ながさが ${s.disp.length}（${ok.join('か')} のはず）: ${s.disp}`);
      }
      if (course === 'moji') check(/^[A-Z;]$/.test(s.disp), `moji で もじが へん: ${s.disp}`);
      if (course === 'roma') check(s.prompt !== '' && /^[A-Z]+$/.test(s.disp), `roma の 出しかたが へん: ${s.prompt}/${s.disp}`);
      if (course === 'word') check(s.prompt !== '', `word に いみが ついて いない: ${s.disp}`);
      check(s.now === 1 && s.done === 0, `${course} lv${lv} うつ ばしょの しるしが へん: ${JSON.stringify(s)}`);
      check(s.next === want[0], `${course} lv${lv} つぎの キーの ひかりが ちがう: ${s.next} / ${want[0]}`);
      check(/(ひだり|みぎ)/.test(s.yubi) && s.yubi.includes(want[0].toUpperCase()),
        `${course} lv${lv} ゆびの あんないが へん: ${s.yubi}`);

      if (q === 2) {                              // わざと ちがう キーを おす
        const bad = want[0] === 'a' ? 'b' : 'a';
        await pg.keyboard.press(bad);
        miss++;
        const af = await state();
        check(af.miss === miss, `${course} lv${lv} ミスが ふえない`);
        check(af.done === 0, `${course} lv${lv} ミスなのに 先に すすむ`);
        check(af.disp === s.disp, `${course} lv${lv} ミスで おだいが かわる`);
      }
      for (const k of want) { await pg.keyboard.press(k === ' ' ? 'Space' : k); keys++; }
      hit++;
      const af = await state();
      check(af.hit === hit || hit === 10, `${course} lv${lv} うてた かずが ${af.hit}（${hit} のはず）`);
      if (hit < 10) {
        const want2 = Math.round((keys / (keys + miss)) * 100);
        check(af.acc === want2, `${course} lv${lv} せいかい率が ${af.acc}％（${want2}％ のはず）`);
      }
      await pg.clock.runFor(300);
    }
    check(await view() === 'over', `${course} lv${lv} 10もんで けっかに ならない`);
    const res = await pg.evaluate(() => ({
      big: document.querySelector('#stamp .big').textContent,
      sub: document.querySelector('#stamp .sub').textContent,
      weak: [...document.querySelectorAll('#weak span')].map(s => s.textContent),
      cheers: [...document.querySelectorAll('#cheers .cheer')].map(c => c.textContent.trim()),
    }));
    check(res.big.includes('10もん'), `${course} lv${lv} けっかの みだしが へん: ${res.big}`);
    check(/びょう$/.test(res.sub), `${course} lv${lv} けっかが びょうで でない: ${res.sub}`);
    check(res.weak.length >= 1, `${course} lv${lv} にがてな キーが でない`);
    check(res.cheers.some(c => c.includes('ミス 1かい') || c.includes('せいかい')),
      `${course} lv${lv} ミスの かずが ほめことばに ない: ${JSON.stringify(res.cheers)}`);
    await pg.click('#back');
  }
}

/* ---------- ゲーム：60びょうで おわる ---------- */
await pg.click('.md[data-md="game"]');
await pg.click('.course[data-c="num"]');
await pg.click('.lv[data-lv="1"]');
await pg.click('#start');
await pg.clock.runFor(3000);
let g = 0;
for (let i = 0; i < 5; i++) {
  const s = await state();
  for (const k of toKeys(s.disp)) await pg.keyboard.press(k);
  g++;
  await pg.clock.runFor(300);
}
const before = await pg.textContent('#hud-left');
await pg.clock.runFor(2000);
check((await pg.textContent('#hud-left')) !== before, 'ゲームの のこり じかんが へらない');
await pg.clock.runFor(60000);
check(await view() === 'over', 'じかんが きても けっかに ならない');
check((await pg.textContent('#stamp .sub')) === `${g}もん`,
  `ゲームの けっかが ${await pg.textContent('#stamp .sub')}（${g}もん のはず）`);

// さいこう きろくが のこる
await pg.click('#back');
check((await pg.textContent('#best')).includes(String(g)), `ゲームの さいこう きろくが でない: ${await pg.textContent('#best')}`);
const keys = await pg.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('sn-typing-best-')));
check(keys.length > 0, 'さいこう きろくが ほぞん されない');
// さんすうの きろくは さわらない
const log = await pg.evaluate(() => localStorage.getItem('sn-log-v1'));
check(log === null, 'タイピングが さんすうの きろくに かきこんで いる');

/* ---------- とちゅうで やめても、あとから はじまらない ---------- */
await pg.click('#start');
await pg.clock.runFor(2200);
await pg.click('#quit');
check(await view() === 'home', 'やめても コースの がめんに もどらない');
await pg.clock.runFor(5000);
check(await view() === 'home', 'やめた あとに ゲームが はじまって しまう');

/* ---------- キーボードの ひょうじを けせる ---------- */
await pg.click('#kbd-toggle');
await pg.click('#start');
await pg.clock.runFor(3000);
check(await pg.isHidden('#kbd-box'), 'キーボード オフに しても でたまま');
await pg.click('#quit');
await pg.click('#kbd-toggle');

console.log('しっぱい:', fails.length);
fails.slice(0, 15).forEach(f => console.log(' -', f));
console.log('JS errors:', errs.length ? errs.slice(0, 5).join(' | ') : 'none');
await b.close();
process.exit(fails.length || errs.length ? 1 : 0);
