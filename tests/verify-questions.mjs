// playwright は ローカル（npm i -D playwright）でも グローバルでも つかえるように さがす
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  const { execSync } = await import('node:child_process');
  const root = execSync('npm root -g').toString().trim();
  ({ chromium } = await import(`${root}/playwright/index.mjs`));
}
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 430, height: 950 } });
const errs = [];
pg.on('pageerror', e => errs.push(String(e)));
await pg.goto('file://' + process.cwd() + '/index.html');

const fails = [];
const stats = { calc: 0, word: 0, read: 0, shift: 0, choice: 0, eigo: 0 };
// どの アプリの もんだいかで、トップから たどる がめんが かわる
const EIGO = ['listen', 'eword', 'talk', 'abc', 'eigo'];
const appOf = (mode) => (EIGO.includes(mode) ? 'eigo' : 'home');
// くらべる ときは、てん・かっこ・スペースを ぬく（「はい、どうぞ」と「はいどうぞ」を おなじに）
const norm = (v) => [...String(v)].filter((ch) => /[ぁ-んァ-ヶー一-龥A-Za-z0-9]/.test(ch)).join('');
// アプリの ことばの ひょうとは べつに、テスト側で もって いる こたえ（ぬきうち）。
// 「えいたんご」で この にほんごが でたら、せいかいは かならず この つづり。
const KNOWN = {
  ねこ: 'cat', いぬ: 'dog', とり: 'bird', さかな: 'fish', うさぎ: 'rabbit', くま: 'bear',
  ぶた: 'pig', かえる: 'frog', さる: 'monkey', ぞう: 'elephant', うま: 'horse', うし: 'cow',
  りんご: 'apple', あか: 'red', あお: 'blue', みどり: 'green', きいろ: 'yellow', しろ: 'white',
  くろ: 'black', あたま: 'head', て: 'hand', め: 'eye', みみ: 'ear', くち: 'mouth',
  ほん: 'book', つくえ: 'desk', いす: 'chair', とけい: 'clock', かさ: 'umbrella',
};

// 出題されている もんだいの「ただしい こたえ」を がめんから どくじに もとめる
async function truth() {
  return await pg.evaluate(() => {
    const hz = document.querySelector('.hz');
    const ask = document.querySelector('#ask').textContent;
    if (hz) {
      const rows = [...hz.querySelectorAll('.hz-row')].map(r => r.textContent.trim());
      const a = Number(rows[0]);
      const op = rows[1][0];
      const b = Number(rows[1].slice(1));
      return { t: 'calc', a, b, op, want: op === '＋' ? a + b : a - b };
    }
    const svg = document.querySelector('.clockwrap svg');
    if (svg) {
      // はりの かくどから とけいを よみとる（かかれた えと こたえが あっているか）
      const gs = [...svg.querySelectorAll('g[transform]')].map(g => Number(g.getAttribute('transform').match(/rotate\(([-\d.]+)/)[1]));
      const [ha, ma] = gs;
      const m = Math.round(ma / 6) % 60;
      let h = Math.floor((ha % 360) / 30); if (h === 0) h = 12;
      const shift = ask.match(/(\d+)ふん(まえ|あと)/);
      return { t: shift ? 'shift' : 'read', h, m, ask, d: shift ? Number(shift[1]) : 0, back: shift ? shift[2] === 'まえ' : false };
    }
    if (document.querySelector('.picks.en')) {
      // えいご: 4たく。せいかいは アプリの もんだいデータから とるのでは なく、
      // がめんに でて いる「え」「もじ」と こたえあわせの ひょうじで てらす。
      // ボタンの 1〜4の ばんごうと えもじは ぬいて、ことばだけ とりだす。
      const label = (el) => {
        if (!el) return '';
        const c = el.cloneNode(true);
        c.querySelectorAll('.picknum').forEach((n) => n.remove());
        return [...c.textContent.trim()].filter((ch) => /[ぁ-んァ-ヶー一-龥A-Za-z0-9'.!? ]/.test(ch)).join('').trim();
      };
      const picks = [...document.querySelectorAll('.pick')].map((p, i) => ({ i, label: label(p) }));
      return {
        t: 'eigo', ask, picks,
        one: Boolean(document.querySelector('.picks.one')),
        picname: document.querySelector('.picname')?.textContent.trim() || '',
      };
    }
    if (document.querySelector('.picks')) {
      const want = document.querySelector('#ask').textContent.match(/「(\d+)じ(?:(\d+)ふん)?/);
      const n = [...document.querySelectorAll('.pick')].map((p, i) => {
        const gs = [...p.querySelectorAll('g[transform]')].map(g => Number(g.getAttribute('transform').match(/rotate\(([-\d.]+)/)[1]));
        const m = Math.round(gs[1] / 6) % 60;
        let h = Math.floor((gs[0] % 360) / 30); if (h === 0) h = 12;
        return { i, h, m };
      });
      return { t: 'choice', want: { h: Number(want[1]), m: Number(want[2] || 0) }, opts: n };
    }
    return { t: 'word', ask, nums: (ask.match(/\d+/g) || []).map(Number) };
  });
}

async function typeNum(v) {
  for (const d of String(v)) await pg.keyboard.press(d);
  await pg.keyboard.press('Enter');
}
async function typeTime(h, m) {
  for (const d of String(h)) await pg.keyboard.press(d);
  await pg.keyboard.press('ArrowRight');
  for (const d of String(m)) await pg.keyboard.press(d);
  await pg.keyboard.press('Enter');
}
const verdict = () => pg.evaluate(() => document.querySelector('.judge')?.classList.contains('ng') ? 'ng' : (document.querySelector('.judge') ? 'ok' : 'none'));

for (const lv of [1, 2, 3]) {
  for (const mode of (process.env.ONLY || 'calc,word,clock,listen,eword,talk,abc').split(',')) {
    for (let set = 0; set < 4; set++) {
      try {
        await pg.click(`.mode[data-app="${appOf(mode)}"]`, { timeout: 4000 });
        await pg.click(`#${appOf(mode)} .lv[data-lv="${lv}"]`, { timeout: 4000 });
        await pg.click(`.mode[data-mode="${mode}"]`, { timeout: 4000 });
      } catch (e) {
        const st = await pg.evaluate(() => ({
          screen: ['top', 'home', 'eigo', 'quiz', 'result'].find((id) => !document.getElementById(id).hidden),
          ask: document.querySelector('#ask')?.textContent,
          judge: document.querySelector('.judge')?.textContent,
        }));
        console.log(`!! lv${lv} ${mode} set${set} で とまった:`, JSON.stringify(st));
        await pg.screenshot({ path: `stuck-lv${lv}-${mode}.png` });
        break;
      }
      for (let q = 0; q < 10; q++) {
        const t = await truth();
        let expectOk = true;
        if (t.t === 'calc') {
          stats.calc++;
          const digits = Math.max(String(t.a).length, String(t.b).length);
          const maxd = { 1: 2, 2: 3, 3: 4 }[lv];
          if (digits !== maxd) fails.push(`lv${lv} calc けたすう ${t.a}${t.op}${t.b}`);
          if (t.want < 0) fails.push(`lv${lv} calc マイナス ${t.a}${t.op}${t.b}`);
          await typeNum(t.want);
        } else if (t.t === 'word') {
          stats.word++;
          const [x, y, z] = t.nums;
          const cands = [x + y, x - y, (x || 0) + (y || 0) + (z || 0)];
          // 1もんに 1かいしか こたえられない。まちがえた ときは はんていに でる せいかいを よみとる
          await typeNum(x + y);
          let got;
          if (await verdict() === 'ok') got = x + y;
          else {
            const shown = await pg.evaluate(() => document.querySelector('.judge .say p b')?.textContent || '');
            got = Number((shown.match(/[0-9]+/) || ['NaN'])[0]);
          }
          if (!cands.includes(got)) fails.push(`lv${lv} word こたえが すうじと あわない: ${t.ask} → ${got}`);
          else if (!(got >= 0)) fails.push(`lv${lv} word こたえが マイナス: ${t.ask} → ${got}`);
          expectOk = false;
        } else if (t.t === 'read') {
          stats.read++;
          await typeTime(t.h, t.m);
        } else if (t.t === 'shift') {
          stats.shift++;
          let tot = ((t.h % 12) * 60 + t.m + (t.back ? -t.d : t.d)) % 720;
          if (tot < 0) tot += 720;
          await typeTime(Math.floor(tot / 60) || 12, tot % 60);
        } else if (t.t === 'eigo') {
          stats.eigo++;
          if (t.picks.length !== 4) fails.push(`lv${lv} ${mode} せんたくしが ${t.picks.length}こ`);
          const uniq = new Set(t.picks.map(p => p.label));
          if (uniq.size !== t.picks.length) fails.push(`lv${lv} ${mode} せんたくしが ダブり: ${JSON.stringify(t.picks.map(p => p.label))}`);
          // 1つめを えらんで、こたえあわせに でる せいかいと てらす
          await pg.click('.pick[data-c="0"]');
          const shown = await pg.evaluate(() => ({
            ok: !document.querySelector('.judge').classList.contains('ng'),
            ans: document.querySelector('.judge .say p b')?.textContent || '',
            marked: [...document.querySelectorAll('.pick.ans')].length,
            ansLabel: (() => {
              const el = document.querySelector('.pick.ans');
              if (!el) return '';
              const c = el.cloneNode(true);
              c.querySelectorAll('.picknum').forEach((n) => n.remove());
              return [...c.textContent.trim()].filter((ch) => /[ぁ-んァ-ヶー一-龥A-Za-z0-9'.!? ]/.test(ch)).join('').trim();
            })(),
          }));
          if (shown.marked !== 1) fails.push(`lv${lv} ${mode} せいかいの しるしが ${shown.marked}こ`);
          if (!shown.ok && !shown.ans) fails.push(`lv${lv} ${mode} まちがえた のに こたえが でない: ${t.ask}`);
          // ○を つけた ボタンと、こたえあわせに でる こたえが あって いるか
          if (shown.ansLabel && shown.ans && !norm(shown.ans).includes(norm(shown.ansLabel))) {
            fails.push(`lv${lv} ${mode} ○の ボタンと こたえが ちがう: ${shown.ansLabel} / ${shown.ans}`);
          }
          // 「えいたんご」は テスト側の こたえと てらす
          if (t.picname && KNOWN[t.picname] && shown.ansLabel && shown.ansLabel !== KNOWN[t.picname]) {
            fails.push(`lv${lv} ${mode} ${t.picname} の こたえが ちがう: ${shown.ansLabel}（${KNOWN[t.picname]} のはず）`);
          }
          expectOk = false;
        } else if (t.t === 'choice') {
          stats.choice++;
          const match = t.opts.filter(o => o.h === (t.want.h % 12 || 12) && o.m === t.want.m);
          if (match.length !== 1) fails.push(`lv${lv} choice せいかいが ${match.length}こ: ${JSON.stringify(t)}`);
          await pg.click(`.pick[data-c="${(match[0] || t.opts[0]).i}"]`);
        }
        const v = await verdict();
        if (expectOk && v !== 'ok') fails.push(`lv${lv} ${t.t} まるつけ ミス: ${JSON.stringify(t)}`);
        // じどうおくりを またずに すぐ つぎへ（setTimeout は locked が とけて いるので なにも しない）
        await pg.evaluate(() => document.querySelector('#next')?.click());
      }
      await pg.evaluate(() => document.querySelector('#tohome')?.click());
    }
  }
}
// ===== さんすうの よみあげ =====
// こえを にせものに して「なにを しゃべったか」を とる。
// 見るのは 3つ: ボタンが 出るか／しゃべる ことばが もんだいと あって いるか／
// ぶんしょうだいだけ じどうで 1かい よむか（ひっさん・とけいでは かってに よまない）。
{
  const ctx = await b.newContext({ viewport: { width: 430, height: 950 } });
  await ctx.addInitScript(`
    window.__said = [];
    class U { constructor(t){ this.text = t; this.onend = null; this.onerror = null; this.lang = ''; } }
    window.SpeechSynthesisUtterance = U;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [{ name: 'Kyoko', lang: 'ja-JP', localService: true }],
      speak: (u) => { window.__said.push(String(u.text)); setTimeout(() => u.onend && u.onend(), 10); },
      cancel: () => {}, onvoiceschanged: null } });
    try { localStorage.setItem('sn-players', JSON.stringify(['はると']));
          localStorage.setItem('sn-current', 'はると'); } catch {}
  `);
  const sp = await ctx.newPage();
  sp.on('pageerror', (e) => errs.push(String(e)));
  await sp.goto('file://' + process.cwd() + '/index.html');
  await sp.waitForTimeout(1200);

  const toTop = async () => {
    for (let i = 0; i < 4; i++) {
      const moved = await sp.evaluate(() => {
        if (!document.getElementById('top').hidden) return false;
        for (const id of ['quit', 'tohome', 'home-back', 'kanji-back', 'eigo-back']) {
          const el = document.getElementById(id);
          if (el && el.offsetParent !== null) { el.click(); return true; }
        }
        return false;
      });
      await sp.waitForTimeout(300);
      if (!moved) break;
    }
  };

  for (const [mode, lv, auto] of [['calc', 2, false], ['word', 1, true], ['clock', 1, false]]) {
    await toTop();
    await sp.click('.mode[data-app="home"]');
    await sp.click(`#home .lv[data-lv="${lv}"]`);
    await sp.click(`.mode[data-mode="${mode}"]`);
    await sp.waitForTimeout(700);
    const got = await sp.evaluate(() => {
      const said = window.__said.slice();
      window.__said.length = 0;
      return {
        hasBtn: Boolean(document.getElementById('replay')),
        disabled: document.getElementById('replay')?.disabled,
        ask: document.getElementById('ask').textContent.trim(),
        body: document.getElementById('body').textContent.trim(),
        auto: said,
      };
    });
    await sp.evaluate(() => document.getElementById('replay')?.click());
    await sp.waitForTimeout(150);
    const spoken = await sp.evaluate(() => { const v = window.__said.slice(); window.__said.length = 0; return v; });

    if (!got.hasBtn) fails.push(`${mode}: 「もんだいを きく」ボタンが ない`);
    if (got.disabled) fails.push(`${mode}: こえが あるのに ボタンが おせない`);
    if (spoken.length !== 1) fails.push(`${mode}: ボタンで しゃべった かいすうが ${spoken.length}`);
    if (auto && got.auto.length !== 1) fails.push(`${mode}: じどうで よむ はずが ${got.auto.length}かい`);
    if (!auto && got.auto.length !== 0) fails.push(`${mode}: かってに よんで しまう（${got.auto.length}かい）`);

    // しゃべった ことばが もんだいと あって いるか
    const say = spoken[0] || '';
    if (mode === 'calc') {
      const nums = (got.body.match(/\d+/g) || []).slice(0, 2);
      const ok = nums.length === 2 && say.includes(nums[0]) && say.includes(nums[1])
        && /たす|ひく/.test(say) && (got.ask.startsWith('たし') ? say.includes('たす') : say.includes('ひく'));
      if (!ok) fails.push(`calc: しゃべる ことばが もんだいと ちがう（${got.ask} ${nums.join(',')} → ${say}）`);
    } else if (mode === 'word') {
      if (norm(say) !== norm(got.ask)) fails.push(`word: もんだい文と ちがう ことばを よむ（${got.ask} → ${say}）`);
      if (norm(got.auto[0] || '') !== norm(say)) fails.push(`word: じどうと ボタンで よむ ことばが ちがう`);
    } else if (!/なんじ|とけい/.test(say)) {
      fails.push(`clock: とけいの もんだいを よんで いない（${say}）`);
    }
  }

  // こえが ない たんまつでは ボタンは 出るが おせない
  const off = await b.newContext({ viewport: { width: 430, height: 950 } });
  await off.addInitScript(`Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    getVoices: () => [], speak: () => {}, cancel: () => {}, onvoiceschanged: null } });`);
  const op = await off.newPage();
  await op.goto('file://' + process.cwd() + '/index.html');
  await op.waitForTimeout(1000);
  await op.click('.mode[data-app="home"]');
  await op.click('.mode[data-mode="calc"]');
  await op.waitForTimeout(500);
  const offBtn = await op.evaluate(() => {
    const el = document.getElementById('replay');
    return el ? { label: el.textContent.trim(), disabled: el.disabled } : null;
  });
  if (!offBtn) fails.push('こえが ない たんまつ: ボタンが ない');
  else if (!offBtn.disabled) fails.push('こえが ない たんまつ: ボタンが おせて しまう');
  else if (!/こえが/.test(offBtn.label)) fails.push(`こえが ない たんまつ: りゆうを 出して いない（${offBtn.label}）`);
  await off.close();
  await ctx.close();
  stats.yomiage = 4;
}

console.log('もんだいすう:', JSON.stringify(stats));
console.log('しっぱい:', fails.length);
fails.slice(0, 12).forEach(f => console.log(' -', f));
console.log('JS errors:', errs.length ? errs.slice(0,5).join(' | ') : 'none');
if (fails.length || errs.length) process.exitCode = 1;
await b.close();
